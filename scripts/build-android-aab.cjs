/* global __dirname */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { parseEnv } = require('node:util');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const environment = { NODE_ENV: 'production' };
for (const name of ['.env', '.env.local']) {
  const file = path.join(root, name);
  if (fs.existsSync(file)) Object.assign(environment, parseEnv(fs.readFileSync(file, 'utf8')));
}
Object.assign(environment, process.env, { NODE_ENV: 'production' });
const credentials = ['ANDROID_KEYSTORE_PASSWORD', 'ANDROID_KEY_ALIAS', 'ANDROID_KEY_PASSWORD'];
for (const name of credentials) {
  if (!environment[name]) throw new Error(`Set ${name} locally before building a release AAB.`);
}
environment.ANDROID_KEYSTORE_PATH = path.resolve(
  root,
  environment.ANDROID_KEYSTORE_PATH || 'release.keystore'
);
if (!fs.existsSync(environment.ANDROID_KEYSTORE_PATH))
  throw new Error('Release keystore not found.');
if (!environment.ANDROID_HOME && !environment.ANDROID_SDK_ROOT) {
  const sdk = path.join(os.homedir(), 'Library', 'Android', 'sdk');
  if (fs.existsSync(sdk)) environment.ANDROID_HOME = sdk;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    env: environment,
    stdio: 'inherit',
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed; release bundle was not produced.`);
  return result;
}

// Hold a project-wide lock across prebuild too, since it modifies Gradle inputs.
const lock = path.join(root, '.android-aab.lock');
function acquireLock() {
  try {
    fs.writeFileSync(lock, String(process.pid), { flag: 'wx', mode: 0o600 });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const owner = Number(fs.readFileSync(lock, 'utf8'));
    if (!Number.isInteger(owner) || owner <= 0)
      throw new Error('Android build lock is initializing. Retry after the active build finishes.');
    try {
      process.kill(owner, 0);
    } catch (check) {
      if (check.code !== 'ESRCH') throw check;
      fs.unlinkSync(lock);
      fs.writeFileSync(lock, String(process.pid), { flag: 'wx', mode: 0o600 });
      return;
    }
    throw new Error('An Android AAB build is already running. Wait for it to finish.');
  }
}
acquireLock();
let temp;
try {
  temp = fs.mkdtempSync(path.join(os.tmpdir(), 'pocketbook-aab-'));
  // Credentials are supplied through the process environment, never embedded in this file.
  const init = path.join(temp, 'release-signing.gradle');
  fs.writeFileSync(
    init,
    `
gradle.beforeProject { project ->
    ['com.android.application', 'com.android.library'].each { plugin ->
        project.pluginManager.withPlugin(plugin) {
            project.extensions.getByName('androidComponents').finalizeDsl { android ->
                android.defaultConfig.externalNativeBuild.cmake.arguments.addAll([
                    '-DCMAKE_JOB_POOLS=pocketbook_compile=2;pocketbook_link=1',
                    '-DCMAKE_JOB_POOL_COMPILE=pocketbook_compile',
                    '-DCMAKE_JOB_POOL_LINK=pocketbook_link'
                ])
            }
        }
    }
    project.pluginManager.withPlugin('com.android.application') {
        project.extensions.getByName('androidComponents').finalizeDsl { android ->
            def signing = android.signingConfigs.create('pocketbookRelease')
            signing.storeFile = project.file(System.getenv('ANDROID_KEYSTORE_PATH'))
            signing.storePassword = System.getenv('ANDROID_KEYSTORE_PASSWORD')
            signing.keyAlias = System.getenv('ANDROID_KEY_ALIAS')
            signing.keyPassword = System.getenv('ANDROID_KEY_PASSWORD')
            android.buildTypes.getByName('release').signingConfig = signing
        }
    }
}
`,
    { mode: 0o600 }
  );
  run(process.platform === 'win32' ? 'npx.cmd' : 'npx', [
    'expo',
    'prebuild',
    '--platform',
    'android',
    '--no-install',
  ]);
  run(
    process.platform === 'win32' ? 'gradlew.bat' : './gradlew',
    [':app:bundleRelease', '--no-daemon', '--no-parallel', '--max-workers=1', '-I', init],
    { cwd: path.join(root, 'android') }
  );
  const bundle = path.join(root, 'android/app/build/outputs/bundle/release/app-release.aab');
  const verified = run(
    'jarsigner',
    [
      '-verify',
      '-strict',
      '-keystore',
      environment.ANDROID_KEYSTORE_PATH,
      '-storepass:env',
      'ANDROID_KEYSTORE_PASSWORD',
      bundle,
      environment.ANDROID_KEY_ALIAS,
    ],
    { stdio: 'pipe', encoding: 'utf8' }
  );
  if (!/jar verified/i.test(verified.stdout))
    throw new Error('Release AAB signature was not verified.');
  const version = require('../app.json').expo.version;
  const output = path.join(root, 'builds', `pocketbook-${version}.aab`);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.copyFileSync(bundle, output);
  console.log(`Verified release AAB: ${output}`);
} finally {
  if (temp) fs.rmSync(temp, { recursive: true, force: true });
  fs.rmSync(lock, { force: true });
}
