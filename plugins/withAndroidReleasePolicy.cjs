const fs = require('node:fs/promises');
const path = require('node:path');
const {
  AndroidConfig,
  withAndroidManifest,
  withAppBuildGradle,
  withDangerousMod,
} = require('@expo/config-plugins');

const excludedDomains = [
  'root',
  'file',
  'database',
  'sharedpref',
  'external',
  'device_root',
  'device_file',
  'device_database',
  'device_sharedpref',
];
const exclusions = excludedDomains
  .map((domain) => `    <exclude domain="${domain}" path="."/>`)
  .join('\n');
const backupRules = `<?xml version="1.0" encoding="utf-8"?>\n<full-backup-content>\n${exclusions}\n</full-backup-content>\n`;
const extractionRules = `<?xml version="1.0" encoding="utf-8"?>\n<data-extraction-rules>\n  <cloud-backup>\n${exclusions}\n  </cloud-backup>\n  <device-transfer>\n${exclusions}\n  </device-transfer>\n</data-extraction-rules>\n`;
const signingGuard = `
// Settler release policy: added by the config plugin; credentials stay in the build environment.
tasks.register('verifySettlerReleaseSigning') {
    doLast {
        def signing = android.buildTypes.getByName('release').signingConfig
        if (signing == null || signing == android.signingConfigs.findByName('debug') ||
            signing.keyAlias == 'androiddebugkey' || signing.storeFile?.name == 'debug.keystore' ||
            !signing.storeFile?.isFile() || !signing.keyAlias || !signing.storePassword || !signing.keyPassword) {
            throw new GradleException('Release signing is required. Use npm run android:aab with the upload keystore; debug or unsigned releases are blocked.')
        }
    }
}
tasks.configureEach { task ->
    if (task.name in ['assembleRelease', 'bundleRelease', 'packageRelease', 'packageReleaseBundle']) {
        task.dependsOn('verifySettlerReleaseSigning')
    }
}
`;
function secureManifest(manifest) {
  const application = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);
  application.$['android:allowBackup'] = 'false';
  application.$['android:fullBackupContent'] = '@xml/settler_backup_rules';
  application.$['android:dataExtractionRules'] = '@xml/settler_data_extraction_rules';
  application.$['android:usesCleartextTraffic'] = 'false';
  AndroidConfig.Manifest.addMetaDataItemToMainApplication(
    application,
    'firebase_messaging_auto_init_enabled',
    'false'
  );
  return manifest;
}
function secureGradle(contents) {
  const updated = contents.replace(
    /(release\s*\{[\s\S]*?)signingConfig signingConfigs\.debug/,
    '$1signingConfig null'
  );
  return updated.includes("tasks.register('verifySettlerReleaseSigning')")
    ? updated
    : updated + signingGuard;
}
module.exports = function withAndroidReleasePolicy(config) {
  config = withAndroidManifest(config, (mod) => {
    mod.modResults = secureManifest(mod.modResults);
    return mod;
  });
  config = withAppBuildGradle(config, (mod) => {
    if (mod.modResults.language !== 'groovy')
      throw new Error('Review the release signing policy before using Kotlin Gradle.');
    mod.modResults.contents = secureGradle(mod.modResults.contents);
    return mod;
  });
  return withDangerousMod(config, [
    'android',
    async (mod) => {
      const directory = path.join(mod.modRequest.platformProjectRoot, 'app/src/main/res/xml');
      await fs.mkdir(directory, { recursive: true });
      await fs.writeFile(path.join(directory, 'settler_backup_rules.xml'), backupRules);
      await fs.writeFile(
        path.join(directory, 'settler_data_extraction_rules.xml'),
        extractionRules
      );
      return mod;
    },
  ]);
};
module.exports.secureManifest = secureManifest;
module.exports.secureGradle = secureGradle;
module.exports.backupRules = backupRules;
module.exports.extractionRules = extractionRules;
