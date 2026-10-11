const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createBackAction } = require('../.test-build/utils/navigation.js');

function navigation(hasHistory) {
  const actions = [];
  return {
    actions,
    router: {
      canGoBack: () => hasHistory,
      back: () => actions.push('back'),
      replace: (route) => actions.push(route),
    },
  };
}

test('directly opened forms replace with their destination without issuing GO_BACK', () => {
  for (const destination of [
    '/(tabs)/budgets',
    '/(tabs)/accounts',
    '/(tabs)/transactions',
    '/card',
    '/recurring',
    '/loan',
  ]) {
    const { router, actions } = navigation(false);
    createBackAction(router, destination).back();
    assert.deepEqual(actions, [destination]);
  }
});

test('normal navigation returns through existing history', () => {
  const { router, actions } = navigation(true);
  createBackAction(router, '/(tabs)').back();
  assert.deepEqual(actions, ['back']);
});

test('rapid return taps dispatch only once before navigation state updates', () => {
  const { router, actions } = navigation(true);
  const action = createBackAction(router, '/(tabs)');
  action.back();
  action.back();
  action.back();
  assert.deepEqual(actions, ['back']);
});

test('save completion after leaving is ignored and refocusing enables back again', async () => {
  const { router, actions } = navigation(false);
  const action = createBackAction(router, '/(tabs)/budgets');
  action.pause();
  await Promise.resolve().then(action.back);
  assert.deepEqual(actions, []);
  action.reset();
  action.back();
  assert.deepEqual(actions, ['/(tabs)/budgets']);
});

test('failed return dispatch permits a retry', () => {
  const { router, actions } = navigation(false);
  let fail = true;
  const action = createBackAction(
    {
      ...router,
      replace: (route) => {
        if (fail) throw new Error('Navigation unavailable');
        router.replace(route);
      },
    },
    '/(tabs)'
  );
  assert.throws(action.back, /Navigation unavailable/);
  fail = false;
  action.back();
  assert.deepEqual(actions, ['/(tabs)']);
});
