# Charts, categories and typing

Insights shows cash-flow bars, curved income/spending trends and a category ring. Daily Transactions adds a cash-movement ring beside exact income, spending and net amounts. The main Budgets card has a used/remaining ring; category budgets and comparison rows retain animated progress tracks.

`src/components/charting/ringScene.ts` builds actual beveled Three.js geometry. `ringRuntime.ts` renders through [Expo GL](https://docs.expo.dev/versions/v57.0.0/sdk/gl-view/), raycasts taps and coalesces drag frames. Geometry is reused for selection changes and disposed on data replacement or unmount. Rendering pauses on blur, background, app lock and required-update blocking. Selection animations end after 420 ms; there is no idle render loop. Reanimated animates SVG bars, line reveals, progress tracks and amount transitions using the system reduced-motion setting.

Colors come from the existing theme tokens. Financial figures remain native text. Long ranges are grouped into at most 40 adjacent chart buckets with totals preserved; native data tables retain the underlying values. Category rings group long lists into five categories plus Other. Signed category totals use a labelled list instead of misleading ring percentages. Daily refund credits are explicitly labelled, transfers stay out of cash flow, and budget excess remains visible even when the ring reaches 100%.

## Native installation

Expo GL and Android keyboard resize configuration require a new native build. A Metro reload alone cannot add the native module. Installations without Expo GL, or devices whose renderer fails, retain the SVG ring fallback. These changes do not generate a new release AAB automatically.

## Categories and keyboards

Category editing offers named Lucide icons. Explicit saved choices win; generic legacy icons infer the category's meaning. Category grids, transaction rows, budget cards and chart legends share the resolver. The existing theme is unchanged, and onboarding/settings copy uses plain feature descriptions.

`KeyboardLayout.tsx` provides keyboard avoidance and focused-field scrolling for shared forms, transaction search, filter sheets and app unlock. It removes listeners and pending frames when unmounted. Sheet closure and unlock hiding dismiss the keyboard. Android uses resize mode, while iOS uses padding avoidance.

## Verification

Automated coverage includes category inference, theme colors, signed chart domains, grouping totals, Three.js geometry disposal, finite rendering, selection reuse, drag coalescing and renderer failure. TypeScript, ESLint, the financial regression suite and Android/iOS Hermes exports are also checked. The runtime tests use a fake GPU renderer; they do not verify native shaders or device performance.

Native visual, gesture, keyboard and performance QA remains pending. Computer-use access to Brave was not approved, so the browser preview has not been visually inspected. On a phone, check light/dark appearance, reduced motion, large text, rapid month/day switches, negative totals, app background/lock, horizontal ring gestures versus vertical scrolling, and amount/notes/filter/search/passcode entry with the keyboard open.

For a synthetic preview using the actual Three.js scene and renderer:

```sh
node scripts/preview-charts.cjs
python3 -m http.server 8497 --bind 127.0.0.1 --directory /private/tmp/settler-charts-preview
```

Open `http://127.0.0.1:8497`. This preview checks the renderer separately from the native screen layout and Reanimated components.
