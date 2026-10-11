const fs = require('node:fs');
const path = require('node:path');
const marker = 'POCKETBOOK_INITIAL_LINK_COMMIT_GUARD';
const guard = `
    // POCKETBOOK_INITIAL_LINK_COMMIT_GUARD: initial URL promises can resolve before commit.
    const initialLinkLifecycle = react_1.default.useRef({ mounted: false, disposed: false, pending: false, value: undefined });
    const deliverUnhandledLink = react_1.default.useCallback((value) => {
        const lifecycle = initialLinkLifecycle.current;
        if (lifecycle.disposed) return;
        if (lifecycle.mounted) setLastUnhandledLink(value);
        else { lifecycle.pending = true; lifecycle.value = value; }
    }, []);
    react_1.default.useEffect(() => {
        const lifecycle = initialLinkLifecycle.current;
        lifecycle.mounted = true;
        lifecycle.disposed = false;
        if (lifecycle.pending) {
            lifecycle.pending = false;
            const currentPath = refContainer.current?.getCurrentRoute()?.path;
            setLastUnhandledLink(lifecycle.value === currentPath ? undefined : lifecycle.value);
            lifecycle.value = undefined;
        }
        return () => { lifecycle.mounted = false; lifecycle.disposed = true; lifecycle.pending = false; lifecycle.value = undefined; };
    }, []);
`;
function patchSource(source) {
  if (source.includes(marker)) return source;
  const start = '    const [lastUnhandledLink, setLastUnhandledLink] = react_1.default.useState();';
  const callback = '    }, setLastUnhandledLink);';
  if (!source.includes(start) || !source.includes(callback))
    throw new Error(
      'Expo Router linking implementation changed. Review the initial-link mount patch before installing.'
    );
  return source.replace(start, start + guard).replace(callback, '    }, deliverUnhandledLink);');
}
if (require.main === module) {
  const entry = require.resolve('expo-router/package.json');
  const target = path.join(path.dirname(entry), 'build/fork/NavigationContainer.js');
  const before = fs.readFileSync(target, 'utf8');
  const after = patchSource(before);
  if (after !== before) fs.writeFileSync(target, after);
  process.stdout.write('Expo Router initial-link mount guard applied.\n');
}
module.exports = { patchSource, guard };
