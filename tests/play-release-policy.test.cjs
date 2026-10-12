const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseXMLAsync } = require('@expo/config-plugins/build/utils/XML');
const {
  secureManifest,
  secureGradle,
  backupRules,
  extractionRules,
} = require('../plugins/withAndroidReleasePolicy.cjs');
test('Android release manifest rejects automatic transfers and cleartext and disables remote push auto-init', () => {
  const manifest = {
    manifest: {
      application: [{ $: { 'android:name': '.MainApplication', 'android:allowBackup': 'true' } }],
    },
  };
  const result = secureManifest(manifest);
  const application = result.manifest.application[0];
  assert.equal(application.$['android:allowBackup'], 'false');
  assert.equal(application.$['android:usesCleartextTraffic'], 'false');
  assert.equal(application.$['android:fullBackupContent'], '@xml/settler_backup_rules');
  assert.equal(application.$['android:dataExtractionRules'], '@xml/settler_data_extraction_rules');
  assert.deepEqual(
    application['meta-data'].find(
      (item) => item.$['android:name'] === 'firebase_messaging_auto_init_enabled'
    ).$,
    {
      'android:name': 'firebase_messaging_auto_init_enabled',
      'android:value': 'false',
    }
  );
  secureManifest(manifest);
  assert.equal(
    application['meta-data'].filter(
      (item) => item.$['android:name'] === 'firebase_messaging_auto_init_enabled'
    ).length,
    1
  );
});
test('all standard and device-protected data domains are excluded from backup and device transfer', async () => {
  const old = await parseXMLAsync(backupRules),
    current = await parseXMLAsync(extractionRules);
  const expected = [
    'root',
    'file',
    'database',
    'sharedpref',
    'external',
    'device_root',
    'device_file',
    'device_database',
    'device_sharedpref',
  ].sort();
  for (const rules of [
    old['full-backup-content'],
    current['data-extraction-rules']['cloud-backup'][0],
    current['data-extraction-rules']['device-transfer'][0],
  ]) {
    assert.deepEqual(rules.exclude.map((item) => item.$.domain).sort(), expected);
    assert.ok(rules.exclude.every((item) => item.$.path === '.'));
    assert.equal(rules.include, undefined);
  }
});
test('prebuild preserves debug development signing but blocks debug and unsigned release tasks idempotently', () => {
  const generated =
    'android { buildTypes { debug { signingConfig signingConfigs.debug } release { signingConfig signingConfigs.debug } } }';
  const secured = secureGradle(generated);
  assert.match(secured, /debug \{ signingConfig signingConfigs\.debug \}/);
  assert.match(secured, /release \{ signingConfig null \}/);
  assert.match(secured, /signing == null/);
  assert.match(secured, /signing == android\.signingConfigs\.findByName\('debug'\)/);
  for (const task of ['assembleRelease', 'bundleRelease', 'packageRelease', 'packageReleaseBundle'])
    assert.ok(secured.includes(`'${task}'`));
  assert.equal(secureGradle(secured), secured);
  const custom = secureGradle('android { release { signingConfig signingConfigs.upload } }');
  assert.match(custom, /signingConfig signingConfigs\.upload/);
});
