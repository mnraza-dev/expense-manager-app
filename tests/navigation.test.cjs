const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { readFileSync } = require('node:fs');
const { guard, patchSource } = require('../scripts/patch-expo-router.cjs');
function lifecycle(path) {
  let committed = false;
  const updates = [],
    effects = [];
  const context = {
    react_1: {
      default: {
        useRef: (current) => ({ current }),
        useCallback: (fn) => fn,
        useEffect: (fn) => effects.push(fn),
      },
    },
    refContainer: { current: { getCurrentRoute: () => ({ path }) } },
    setLastUnhandledLink: (value) => {
      assert.ok(committed, 'State update before commit');
      updates.push(value);
    },
  };
  vm.runInNewContext(guard + '\nglobalThis.deliver = deliverUnhandledLink;', context);
  let cleanup;
  return {
    updates,
    deliver: context.deliver,
    mount: () => {
      committed = true;
      cleanup = effects[0]();
    },
    unmount: () => {
      cleanup();
      committed = false;
    },
  };
}
test('initial native URL promise resolves before commit without React state updates', async () => {
  const component = lifecycle('/');
  await Promise.resolve('/cloud/callback').then(component.deliver);
  assert.deepEqual(component.updates, []);
  component.mount();
  assert.deepEqual(component.updates, ['/cloud/callback']);
  component.deliver('/transaction/add');
  assert.deepEqual(component.updates, ['/cloud/callback', '/transaction/add']);
});
test('late native URL resolutions are ignored after unmount', async () => {
  const component = lifecycle('/');
  component.mount();
  component.unmount();
  await Promise.resolve('/cloud/callback').then(component.deliver);
  assert.deepEqual(component.updates, []);
});
test('queued links already handled by the initial route clear tracking', () => {
  const component = lifecycle('/cloud/callback');
  component.deliver('/cloud/callback');
  component.mount();
  assert.deepEqual(component.updates, [undefined]);
});
test('Strict Mode effect cleanup and replay resumes committed link delivery', () => {
  const component = lifecycle('/');
  component.mount();
  component.unmount();
  component.mount();
  component.deliver('/cloud/callback');
  assert.deepEqual(component.updates, ['/cloud/callback']);
});
test('Router mount patch is repeatable and refuses an unknown upstream shape', () => {
  const source =
    '    const [lastUnhandledLink, setLastUnhandledLink] = react_1.default.useState();\n    }, setLastUnhandledLink);';
  const patched = patchSource(source);
  assert.equal(patchSource(patched), patched);
  assert.ok(patched.includes('}, deliverUnhandledLink);'));
  assert.throws(() => patchSource('unknown implementation'), /implementation changed/);
  assert.ok(
    readFileSync(require.resolve('expo-router/build/fork/NavigationContainer'), 'utf8').includes(
      'POCKETBOOK_INITIAL_LINK_COMMIT_GUARD'
    )
  );
});
