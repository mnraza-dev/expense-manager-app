const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');
const {
  compareVersions,
  parseUpdatePolicy,
  requiresUpdate,
  validUpdateURL,
  UpdateController,
  withUpdateTimeout,
} = require('../.test-build/updates/core.js');
const policy = (patch = {}) => ({
  platform: 'android',
  enabled: true,
  minimum_version: '1.3.0',
  minimum_build: '5',
  store_url: 'https://play.google.com/store/apps/details?id=com.razatechlabs.settler',
  message: 'Update Settler to continue.',
  ...patch,
});
const current = { version: '1.3.0', build: '5' };
test('native version comparison orders numeric components and enforces older versions and builds', () => {
  assert.equal(compareVersions('1.10.0', '1.9.9'), 1);
  assert.equal(compareVersions('1.3.0', '1.3.0'), 0);
  assert.equal(requiresUpdate(policy(), { version: '1.2.0', build: '999' }), true);
  assert.equal(requiresUpdate(policy(), { version: '1.3.0', build: '4' }), true);
  assert.equal(requiresUpdate(policy(), current), false);
  assert.equal(requiresUpdate(policy(), { version: '1.4.0', build: '1' }), false);
  assert.equal(requiresUpdate(policy(), { version: null, build: null }), true);
  assert.equal(requiresUpdate(policy(), { version: '1.3.0', build: null }), true);
  assert.equal(
    requiresUpdate(policy({ minimum_build: null }), { version: '1.3.0', build: null }),
    false
  );
  assert.equal(requiresUpdate(policy({ enabled: false }), { version: null, build: null }), false);
  assert.equal(requiresUpdate(null, current), false);
});
test('iOS dotted build numbers compare numerically and newer marketing versions remain supported', () => {
  const p = parseUpdatePolicy(
    policy({
      platform: 'ios',
      minimum_build: '5.10',
      store_url: 'https://apps.apple.com/app/id123456789',
    }),
    'ios'
  );
  assert.equal(requiresUpdate(p, { version: '1.3.0', build: '5.9' }), true);
  assert.equal(requiresUpdate(p, { version: '1.3.0', build: '5.10.0' }), false);
  assert.equal(requiresUpdate(p, { version: '1.3.1', build: '1' }), false);
});
test('invalid metadata, cross-platform caches and unsafe update links are rejected', () => {
  for (const patch of [
    { minimum_version: '1.3' },
    { minimum_version: '1.3.0-beta' },
    { minimum_build: '5a' },
    { enabled: 'true' },
    { platform: 'ios' },
    { store_url: 'javascript:alert(1)' },
    { store_url: 'http://example.com' },
    { store_url: 'https://user:secret@example.com/app' },
    { store_url: null },
    { message: 'x'.repeat(501) },
  ])
    assert.throws(() => parseUpdatePolicy(policy(patch), 'android'));
  assert.equal(validUpdateURL('https://example.com/releases/settler.apk'), true);
  assert.equal(validUpdateURL('https://example.com/ bad.apk'), false);
  assert.equal(validUpdateURL('file:///app.apk'), false);
  assert.doesNotThrow(() =>
    parseUpdatePolicy(policy({ enabled: false, store_url: null }), 'android')
  );
});
test('an online requirement is cached and continues blocking across an offline restart', async () => {
  let cache = null;
  const first = new UpdateController(
    'android',
    { version: '1.2.0', build: '4' },
    {
      readCache: async () => cache,
      writeCache: async (v) => {
        cache = v;
      },
      fetchPolicy: async () => policy(),
    }
  );
  await first.refresh();
  assert.equal(first.state.required, true);
  assert.equal(first.state.ready, true);
  assert.ok(cache);
  const restarted = new UpdateController(
    'android',
    { version: '1.2.0', build: '4' },
    {
      readCache: async () => cache,
      writeCache: async () => {},
      fetchPolicy: async () => {
        throw new Error('offline');
      },
    }
  );
  await restarted.refresh();
  assert.equal(restarted.state.required, true);
  assert.match(restarted.state.error, /retry/);
});
test('a newly installed native build satisfies a cached requirement even when offline', async () => {
  const controller = new UpdateController('android', current, {
    readCache: async () => JSON.stringify(policy()),
    writeCache: async () => {},
    fetchPolicy: async () => {
      throw new Error('offline');
    },
  });
  await controller.refresh();
  assert.equal(controller.state.required, false);
  assert.equal(controller.state.ready, true);
});
test('offline first launch preserves local use, and reconnecting can require an update', async () => {
  let online = false;
  const controller = new UpdateController(
    'android',
    { version: '1.2.0', build: '4' },
    {
      readCache: async () => null,
      writeCache: async () => {},
      fetchPolicy: async () => {
        if (!online) throw new Error('offline');
        return policy();
      },
    }
  );
  await controller.refresh();
  assert.equal(controller.state.required, false);
  assert.equal(controller.state.ready, true);
  online = true;
  await controller.refresh();
  assert.equal(controller.state.required, true);
});
test('malformed responses retain the requirement; an authoritative disabled policy releases it', async () => {
  let response = { enabled: false };
  const controller = new UpdateController(
    'android',
    { version: '1.2.0', build: '4' },
    {
      readCache: async () => JSON.stringify(policy()),
      writeCache: async () => {},
      fetchPolicy: async () => response,
    }
  );
  await controller.refresh();
  assert.equal(controller.state.required, true);
  response = policy({ enabled: false });
  await controller.refresh();
  assert.equal(controller.state.required, false);
  assert.equal(controller.state.error, null);
});
test('simultaneous checks share a request and a cache write failure never hides a requirement', async () => {
  let resolve,
    calls = 0;
  const request = new Promise((r) => {
    resolve = r;
  });
  const controller = new UpdateController(
    'android',
    { version: '1.2.0', build: '4' },
    {
      readCache: async () => null,
      writeCache: async () => {
        throw new Error('storage');
      },
      fetchPolicy: async () => {
        calls++;
        return request;
      },
    }
  );
  const a = controller.refresh(),
    b = controller.refresh();
  assert.equal(a, b);
  resolve(policy());
  await a;
  assert.equal(calls, 1);
  assert.equal(controller.state.required, true);
  assert.equal(controller.state.checking, false);
  assert.match(controller.state.error, /saved/);
});
test('release metadata is readable before login; clients cannot change it or enable a missing destination', async () => {
  const pg = new PGlite();
  try {
    await pg.exec('create role anon;create role authenticated;create role service_role bypassrls;');
    await pg.exec(readFileSync('supabase/migrations/202610120002_release_policy.sql', 'utf8'));
    await pg.exec('set role anon');
    const rows = (await pg.query('select * from public.app_release_policy order by platform')).rows;
    assert.equal(rows.length, 2);
    assert.ok(rows.every((r) => r.enabled === false));
    await assert.rejects(
      pg.exec("update public.app_release_policy set minimum_version='0.0.0'"),
      /permission denied/
    );
    await assert.rejects(pg.exec('delete from public.app_release_policy'), /permission denied/);
    await pg.exec('reset role;set role authenticated');
    await assert.rejects(
      pg.exec("update public.app_release_policy set enabled=true where platform='android'"),
      /permission denied/
    );
    await pg.exec('reset role;set role service_role');
    await assert.rejects(
      pg.exec("update public.app_release_policy set enabled=true where platform='ios'"),
      /check constraint/
    );
    await pg.exec("update public.app_release_policy set enabled=true where platform='android'");
    assert.equal(
      (await pg.query("select enabled from public.app_release_policy where platform='android'"))
        .rows[0].enabled,
      true
    );
  } finally {
    await pg.close();
  }
});

test('a stalled network or auth request times out instead of indefinitely trapping first launch', async () => {
  let aborted = false;
  await assert.rejects(
    withUpdateTimeout(
      new Promise(() => {}),
      () => {
        aborted = true;
      },
      5
    ),
    /timed out/
  );
  assert.equal(aborted, true);
  assert.equal(
    await withUpdateTimeout(
      Promise.resolve('policy'),
      () => {
        throw new Error('unexpected timeout');
      },
      50
    ),
    'policy'
  );
});
