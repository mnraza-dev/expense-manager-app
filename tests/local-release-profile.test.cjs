const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const { validateLocalReleaseProfile } = require('../scripts/check-local-release.cjs');
const profile = require('../src/release/profile.json');
const packageJSON = require('../package.json');

test('local build rejects activation of online accounts, purchases or the unused Android billing SDK', () => {
  assert.doesNotThrow(() => validateLocalReleaseProfile(profile, packageJSON));
  for (const change of [{ cloudAccounts: true }, { storePurchases: true }, { profile: 'paid' }])
    assert.throws(
      () => validateLocalReleaseProfile({ ...profile, ...change }, packageJSON),
      /policy audit/
    );
  assert.throws(
    () =>
      validateLocalReleaseProfile(profile, { expo: { autolinking: { android: { exclude: [] } } } }),
    /billing SDK/
  );
});

test('credentials cannot enable Auth or billing; public update metadata uses an anonymous nonpersistent client', async () => {
  const names = [
    'EXPO_PUBLIC_SUPABASE_URL',
    'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    'EXPO_PUBLIC_REVENUECAT_ANDROID_KEY',
  ];
  const saved = names.map((name) => process.env[name]);
  process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://policy.example.com';
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test_only';
  process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY = 'goog_test_only';
  const load = Module._load,
    created = [];
  let billingLoads = 0;
  Module._load = function (request, ...args) {
    if (request === 'react-native-url-polyfill/auto') return {};
    if (request === '@react-native-async-storage/async-storage')
      return { getItem: () => assert.fail('Saved auth must not be loaded') };
    if (request === 'expo-secure-store' || request === 'expo-crypto') return {};
    if (request === 'react-native')
      return { Platform: { OS: 'android' }, AppState: { currentState: 'active' } };
    if (request === 'expo') return { isRunningInExpoGo: () => false };
    if (request === 'react-native-purchases') {
      billingLoads++;
      return {};
    }
    if (request === '@supabase/supabase-js')
      return {
        createClient: (...parameters) => {
          const value = { parameters };
          created.push(value);
          return value;
        },
      };
    return load.call(this, request, ...args);
  };
  try {
    const client = require('../.test-build/cloud/client.js');
    const auth = require('../.test-build/cloud/auth.js');
    const billing = require('../.test-build/cloud/entitlements.js');
    assert.equal(client.updateBackendConfigured(), true);
    assert.equal(client.cloudConfigured(), false);
    assert.throws(() => client.cloudClient(), /disabled/);
    const publicClient = client.publicReleaseClient();
    assert.equal(client.publicReleaseClient(), publicClient);
    assert.equal(created.length, 1);
    assert.deepEqual(created[0].parameters[2].auth, {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    });
    auth.useCloudAuth.setState({ session: { user: { id: 'old-owner' } } });
    await auth.useCloudAuth.getState().initialize();
    assert.equal(auth.useCloudAuth.getState().session, null);
    await assert.rejects(auth.verifiedOwner(), /disabled/);
    assert.equal(billing.billingConfigured(), false);
    await billing.billingUser('synthetic-owner');
    await assert.rejects(billing.purchase({}), /Purchases require/);
    assert.equal(billingLoads, 0);
  } finally {
    Module._load = load;
    names.forEach((name, index) => {
      if (saved[index] === undefined) delete process.env[name];
      else process.env[name] = saved[index];
    });
  }
});
