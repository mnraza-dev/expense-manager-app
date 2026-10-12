# Settler

Settler was previously named Pocketbook. Existing database names, secure-storage keys, backup formats and cloud record identifiers retain their legacy names. Both native platforms now use `com.razatechlabs.settler` as the application identifier. The app accepts both `settler://` and legacy `pocketbook://` links; cloud authentication retains its existing callback URL.

An Android/iOS personal finance app with local accounting, budgets, reports, optional cloud backup/sync, [MVP v4 payment reminders, savings goals, refunds and split expenses](MVP_V4.md), and [on-device receipt scanning](MVP_V3.md), plus [MVP v2 receipts, faster and private voice entry, and expense exports](MVP_V2.md), built with Expo SDK 57, React Native, strict TypeScript and Expo Router. SQLite is the source of truth; Zustand holds a refreshed view of the database. Financial records stay local unless cloud backup or sync is enabled. Receipt attachments remain device-local.

## Install and run

Use Node.js 24 LTS (the repository tests use `node:sqlite`) and Bun. The checked-in Bun lockfile pins dependencies; an npm lockfile is also retained.

```sh
bun install --frozen-lockfile
bun start
bun run android
bun run ios
```

Scan the development server QR code using an Expo Go version compatible with SDK 57. For Android, use a connected device or an Android Studio emulator. For the iOS simulator, install Xcode and select its developer tools. Physical iPhones can open the QR code through Expo Go. If the installed Expo Go version does not support SDK 57, create a development build:

```sh
npx expo run:android
npx expo run:ios
```

These native build commands require the corresponding Android SDK/Xcode. If another Metro server occupies the default port, use `npm start -- --port 8082`.

Native modules were installed with Expo compatibility resolution:

```sh
npx expo install --npm expo-sqlite @react-native-community/datetimepicker react-native-svg
npm install zustand react-hook-form zod @hookform/resolvers lucide-react-native
```

Use `bun install --frozen-lockfile` to reproduce the checked-in Bun versions.

## Implemented

- [MVP v4](MVP_V4.md): local payment notifications, savings targets and contribution history, linked full/partial refunds, and split-category purchases with consistent budgets, reports, exports and recovery.
- Required native updates: a remote minimum-version/build policy blocks outdated checker-enabled releases and opens the configured update destination. See [UPDATES.md](UPDATES.md) for rollout and the limitation of older installs without the checker.
- Four tabs: Home, Transactions, Accounts and Budgets. Reports and Settings are reachable from Home.
- [MVP v3](MVP_V3.md): photograph or select a receipt, create an editable expense draft with its image attached, review uncertain values and possible duplicates, then save. Recognition stays on-device.
- [MVP v2](MVP_V2.md): device-local JPEG/PNG/PDF receipt attachments with image previews and sharing, recent transaction shortcuts, remembered account/category, Save & add another, on-device English/Hindi/Urdu voice drafts, and historical daily/weekly/monthly PDF/Excel expense reports.
- Monthly dashboard with active-account total balance, income, expenses, net cash flow, transaction count, recent activity and expense category breakdown.
- Account creation and editing, opening balances, account transaction history, archive/restore and guarded deletion. Accounts with any transaction history cannot be deleted.
- Expense, income and transfer creation/editing/deletion, calendar picker, local calendar dates, notes, compatible category selection and duplicate submission guards.
- Transactions List/Calendar/Daily views with monthly activity markers, daily date navigation, filtered income/spending/net totals and tap-to-view daily entries. Calendar totals include all matching records beyond the first page; transfers stay separate from income and spending.
- Virtualized, paginated transaction history with description/notes/category/account search, combined type/account/category/date/amount filters, and four stable sort orders. Transfers appear under both associated accounts.
- Seeded income/expense categories, custom categories, editable name/icon/color, archive and restore. Renaming a default category does not recreate it after a restart.
- Light, dark and device appearance preferences stored in SQLite; INR currency formatting.
- Initialization loading state and retry, empty states, validated forms, keyboard handling, safe areas and destructive-action confirmations.

## Directory structure

```text
app/
  _layout.tsx                 initialization gate and stack
  index.tsx                  dashboard redirect
  +not-found.tsx
  (tabs)/
    _layout.tsx              five-tab navigation
    index.tsx                dashboard
    transactions.tsx         grouped history, search and filters
    accounts.tsx             active/archived accounts
    reports.tsx              actual monthly expense breakdown
    settings.tsx             appearance and database information
  account/{add,[id]}.tsx
  transaction/{add,[id]}.tsx
  category/index.tsx         category management
src/
  types.ts                   domain models
  db/
    database.ts              expo-sqlite connection
    migrations.ts            versioned schema and seed definitions
    repositories.ts          single database access interface
  store/useFinance.ts        initialization and mutation refresh
  utils/finance.ts           minor units, dates, balances, summaries
  components/
    ui.tsx                   themed shared controls and layout
    TransactionItem.tsx      transaction row
  features/
    AccountForm.tsx
    TransactionForm.tsx
    Breakdown.tsx
tests/repositories.test.cjs
```

## Database and financial rules

The persistent file is `pocketbook.db` in Expo SQLite's application database directory. Foreign keys are enabled at startup. Migration changes, category seeding and settings initialization run atomically. `schema_migrations` tracks applied versions; failed migration changes roll back and can be retried.

Schema versions 1 and 2 live in `src/db/migrations.ts`:

| Table             | Fields and constraints                                                                                                                   |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| accounts          | ID, name, type, integer opening balance, INR currency, description, archive flag, created/updated timestamps                             |
| categories        | ID, name, income/expense type, icon, color, archive flag, timestamps; unique name/type                                                   |
| transactions      | ID, type, positive integer amount, source account FK, destination account FK, category FK, description, calendar date, notes, timestamps |
| app_settings      | unique key and value, including theme, currency and category-seeding marker                                                              |
| schema_migrations | unique version and applied timestamp                                                                                                     |

Transaction checks require a distinct destination and no category for transfers, or a category and no destination for income/expenses. Database triggers enforce category compatibility and preserve types used by historical transactions. Account/category foreign keys restrict deletion. Indexes cover dates, both account references, categories and transaction types. User values are passed through SQL parameters.

Amounts are integer paise. Inputs reject excess decimals, nonnumeric values and amounts above ₹10,000,000,000.00. A total ledger precision check keeps financial aggregates within JavaScript's safe integer range. There is no independently maintained current balance:

```text
current balance = opening balance + income - expenses - outgoing transfers + incoming transfers
net cash flow   = income - expenses
```

Transfers are excluded from income and expense totals. Dashboard totals use active accounts; history retains archived accounts/categories. Archived entries cannot be selected for new transactions; existing transactions can retain their original archived references when edited.

Transaction dates are `YYYY-MM-DD` local calendar dates, never UTC-converted instants. Creation/update audit timestamps use UTC ISO strings. Reports compare the calendar month of the transaction date. Currency is intentionally INR-only in Phase 1; conversion and mixed-currency totals are not implemented.

Repository writes are serialized and transactional where validation and mutations must remain consistent. Ledger writes refresh account/category references, settings, transaction count and at most 18 reusable entry templates; focused screens query the records or SQL totals they need. The database interface is injectable for tests without coupling SQL to screens. See [PERFORMANCE.md](PERFORMANCE.md) for the implemented optimizations and benchmark results.

## Validation

```sh
npm run typecheck
npm run lint
npm test
npx expo install --check
npx expo export --platform ios --platform android --output-dir /private/tmp/pocketbook-export
```

The test suite executes the actual repository and migration SQL against SQLite through a Node adapter, rather than mocking query results. The Phase 1 tests cover money precision and local dates; empty initialization and seed idempotence; account creation/editing, income, expenses, transfers and transaction edits/deletes; validation and archives; file-backed restart persistence; migration rollback/retry; and database constraints. The restart test closes and reopens a real database file and verifies balances, renamed seed categories and preferences.

TypeScript, ESLint and all 18 tests pass. Both iOS and Android development bundles and production Hermes exports were successfully generated. Native device UI, keyboard, accessibility and actual Expo SQLite restart behavior require the device smoke test below: this machine has no connected Android device or usable Xcode simulator. Node SQLite verifies repository behavior but does not substitute for testing the native driver.

### Device smoke test

1. Launch the app, confirm the five tabs and create Bank (₹1,000) and Cash (₹200).
2. Add ₹500 income and ₹100 expense to Bank; transfer ₹300 from Bank to Cash. Expect Bank ₹1,100, Cash ₹500, total ₹1,600; monthly income ₹500, expense ₹100, net ₹400.
3. Edit the transfer to ₹200. Expect Bank ₹1,200 and Cash ₹400. Delete the expense; expect Bank ₹1,300 and expense ₹0.
4. Exercise search, every filter and month navigation. Rename a default category; create and archive a custom category.
5. Confirm that deleting an account with history fails and that archiving preserves transactions. Restore it.
6. Switch appearance, force-close the app, relaunch and verify entries, balances, preferences and the renamed category remain.
7. Check calendar entry, keyboard behavior and screen reader labels on both platforms.

## Remaining limitations

- No authentication, cloud sync, bank connections, subscriptions, lock screen, export or backup. Uninstalling may delete the local database. Local storage does not protect against device compromise.
- Native device smoke testing remains outstanding. Production bundles do not prove native runtime correctness.
- History is paginated and virtualized; dashboard/report/budget totals use SQL aggregation. Global state holds references and bounded templates. Native startup, scrolling and memory measurements remain pending; local benchmark results are in [PERFORMANCE.md](PERFORMANCE.md).
- Compatible dependency security fixes removed the initial critical finding. The final npm audit still reports 31 advisories (21 high, 10 moderate) in the Expo/React Native tooling tree (including advisories without a compatible patched upstream version). Review these before release; forced downgrades or an untested SDK migration were not applied.
- Passcode/biometric protection and immutable double-entry audit journals are implemented; see SECURITY.md and the later phase sections below.

## Phase 2: budgets, reports and advanced search

Phase 2 reuses the existing database connection, repositories, themes, components and transaction editors. The five tabs remain Home, Transactions, Accounts, Reports and Settings. Open **Monthly budgets & spending progress** from Home, or **Monthly budgets & progress** from Reports. The budget pages use stack routes rather than adding a crowded sixth tab.

### Budget policy and migration

Migration 2 is appended to `src/db/migrations.ts`; it never resets Phase 1 tables or records.

- `budgets`: ID, name, monthly period type, unique period start, month-end period end, positive integer total limit, INR currency and timestamps.
- `budget_categories`: ID, budget/category foreign keys, positive integer category limit and timestamps; unique `(budget_id, category_id)`. Budget deletion cascades to allocations only.
- Triggers reject income category allocations and preserve the type of expense categories used by budgets. Category deletion is restricted by foreign keys.
- New transaction indexes cover `(type, date, category_id)` and `(amount, date, id)`.
- A persisted `budget_warning_percent` preference defaults to 80%; Settings offers 70%, 80% and 90%.

Exactly **one monthly budget per month** is allowed, enforced by a database uniqueness constraint. Budgets may have no category allocations. Allocations are portions of the total monthly limit, and their combined value must not exceed that limit. Expenses in unallocated categories still consume the total limit. Income and transfers never change expense spending.

Budget cards show total/category spending, percentage, remaining funds or excess, capped progress bars, and textual status. Warning starts at the configured threshold; exactly 100% is near the limit, and spending greater than 100% is exceeded. Unbudgeted spending is shown explicitly. Archived categories remain visible in existing allocations; new allocations require active expense categories. Budget history supports viewing and editing past months.

### Reports and charts

Report presets include this/previous month, last 3/6 months including the current month, this/previous year, and inclusive custom ranges of up to 10 years. Presets use full calendar periods, including future dates. Average daily expenses equal expenses divided by **all inclusive calendar days**, with that rule labelled on screen.

SQL calculates income, expenses, transaction counts, category totals, daily/monthly aggregates, highest spending days, category changes across months and the ten most recent transactions in the selected range. Transfers are counted as transactions but excluded from cash flow. Daily chart buckets are used for ranges within one month; multi-month ranges use monthly buckets. Missing periods are filled with zeroes, never fabricated activity.

Charts use Three.js with Expo GL for interactive rings and Reanimated with `react-native-svg` for bars, trends and progress tracks. Insights, Daily Transactions and the main budget card share these components. Charts support tapping data and scrolling through periods, readable legends, currency axes, the existing light/dark themes and native data tables. See [CHARTS.md](CHARTS.md) for lifecycle behavior, signed values, native rebuild requirements and verification limits. Category drilldown shows monthly amount changes. Budget comparison charts pair category allocations with actual expenses.

For reports with partial budget months, comparisons show the **full monthly allocation** against **only spending in the selected report range**. Limits are not prorated; the screen explains this. Report category percentages use the corresponding range's total, and expense category sums equal the expense summary.

MVP v4 adds linked refunds and split-category expenses. Refunds reduce expenses on their own dates without counting as income; category allocations feed the centralized spending queries. See [MVP_V4.md](MVP_V4.md).

### Search, filters and refresh

Transactions search descriptions, notes, category names, source accounts and transfer destination accounts after a 250 ms debounce. SQL parameters and escaped LIKE wildcards treat quotes, `%`, `_` and backslashes as literal search input. Case-insensitive matching follows SQLite's built-in LIKE behavior (ASCII case folding; full Unicode case folding is not added).

The filter modal supports inclusive amount/date bounds and combined type/account/category filters, Apply, Cancel and Clear all. Active filters have removable indicators. Newest, oldest, highest and lowest sort orders include stable date/ID tie-breakers. Lists load 50 records per page and preserve search/filter state when opening and returning from an editor.

Focused queries use independent ledger, budget and planning invalidation revisions. Bill/goal changes invalidate planning queries; budget changes invalidate budget queries; preferences refresh settings only. Cloud adoption and data restore invalidate all domains. Same-query refreshes retain visible data, while query changes hide unrelated results and late responses are discarded. Transaction history preserves its loaded pages and refreshes that window after edits/deletions. Errors provide retry actions. If a committed ledger change cannot refresh its references, a visible retry banner distinguishes a saved change from a failed write.

### Phase 2 file map

| Area                                | Files                                                                                                                                                 |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Migration and database interface    | `src/db/migrations.ts`, `src/db/adapter.ts`                                                                                                           |
| Aggregation, budget CRUD and search | `src/db/analyticsRepository.ts`, `src/db/repositories.ts`                                                                                             |
| Calculations and calendar rules     | `src/utils/budgets.ts`, `src/utils/periods.ts`, `src/utils/reports.ts`, existing `finance.ts`                                                         |
| Budget routes/form                  | `app/budget/index.tsx`, `add.tsx`, `[id].tsx`, `src/features/BudgetForm.tsx`                                                                          |
| Reports and search screens          | `app/(tabs)/reports.tsx`, `transactions.tsx`                                                                                                          |
| Navigation/preferences integration  | `app/(tabs)/index.tsx`, `settings.tsx`, `src/features/TransactionForm.tsx`                                                                            |
| Reusable UI                         | `BudgetProgressCard.tsx`, `charts.tsx`, `DateRangeSelector.tsx`, `MonthSelector.tsx`, `QueryState.tsx`, `TransactionFilterSheet.tsx`, shared `ui.tsx` |
| Refresh and types                   | `src/hooks/useDatabaseQuery.ts`, `src/store/useFinance.ts`, `src/types.ts`                                                                            |
| Tests and dependencies              | `tests/phase2.test.cjs`, `tests/repositories.test.cjs`, `package.json`, `package-lock.json`                                                           |

### Validation and manual checks

```sh
npm ci
npm start
npm run android
npm run ios
npm run typecheck
npm run lint
npm test
npx expo install --npm --check
npx expo export --platform ios --platform android --output-dir /private/tmp/pocketbook-phase2-export
```

**18 automated tests pass**, including all Phase 1 regressions and Phase 2 progress thresholds, no budget/no spending cases, multiple allocations, category reassignment, transaction edits/deletion, month boundaries, leap years, income/expense aggregation, transfer exclusion, empty/multi-month reports, daily averages, combined filters, amount bounds, stable sorting/pagination, special-character search, migration from a real Phase 1 file, duplicate budget/reference constraints, atomic rollback after an allocation write failure, and budget restart persistence. TypeScript and ESLint pass. Production Hermes exports compile for both iOS and Android.

Native visual/touch testing remains outstanding: no connected Android device or usable iOS simulator is available in this environment. Production compilation and Node SQLite tests do not prove native driver/UI behavior.

On a device:

1. Create a monthly budget with your own limit and two expense category allocations. Try an allocation sum greater than the total, duplicate month and an income category; each must be rejected.
2. Add expenses below, exactly at and above an allocation. Add income and transfers; these must leave spending unchanged.
3. Edit an expense's category/date/amount and delete an expense. Revisit budgets and reports to confirm progress and charts update.
4. Navigate budget months, edit a past budget, and delete a budget after confirmation. Check that transactions remain.
5. Select every report preset and a custom range spanning February 29 and a year boundary. Tap chart data and legends, view data tables, and inspect category changes and highest spending days.
6. Combine transaction filters and amount bounds, exercise each sorting mode, search notes/category/account names and literal special characters, and open an editor then return with filters intact.
7. Force-close/relaunch to verify budgets, allocations, records and warning preference persist. Check chart gestures, labels, keyboard behavior, safe areas and light/dark appearance on both platforms.

## Phase 3: ledger and advanced finance

Schema migration **3** adds immutable journals/lines and mappings, card statement periods, recurring rules/occurrences, loans, versioned forecasts and actual payments. Existing accounts, transactions, categories and budgets retain their IDs and data. Conversion reconciles existing balances before committing; failures roll back the entire migration. Corrections create reversals and replacements, and deletion voids a transaction while retaining its audit history. See [ACCOUNTING.md](ACCOUNTING.md) for posting, migration and calculation rules.

Open **Finance tools** from Home or Settings for ledger activity, cards/statements, recurring transactions, loans and net worth. The existing five tabs remain. Cards record purchases, explicit interest/fees and asset-account payments; statements derive totals from persisted activity. Loan principal movements stay out of expense reporting. Net worth reconstructs dated asset/liability balances, including receivables and archived accounts, and identifies incomplete historical reconstruction.

Implementation: `src/db/ledgerRepository.ts` handles posting, reversals, conversion and dated balances; `advancedRepository.ts` handles cards, statements, recurrence and loans. `src/utils/schedules.ts` contains anchored calendars and integer interest calculations. Routes live under `app/ledger`, `card`, `statement`, `recurring`, `loan`, `net-worth` and `finance`. Existing transaction/account editors and reports use the new ledger-backed model.

Validation: **28 automated tests** cover the earlier phases plus balanced/immutable journals, duplicate prevention, reversal auditing, conversion reconciliation and rollback, cards/statements, calendar clamping, missed/idempotent occurrences, interest arithmetic, extra repayments/recalculation, borrowed/lent balances, net worth, currency rejection, advanced restart persistence and atomic posting failure. TypeScript, ESLint and iOS/Android production Hermes exports pass. Run `npm test`, `npm run typecheck` and `npm run lint`.

Current limits:

- INR is the supported posting currency. Currency fields and grouped net worth prevent implicit conversion; exchange rates are not implemented.
- Recurrences require user confirmation. Missed occurrences generate in batches of 120; retry loads more. Pending items take priority in the 500-item view. Loan recurrence posts principal only; record actual interest/fees separately.
- Loan forecasts use equal-principal installments with explicitly selected none, flat simple or reducing simple interest. Compound interest, annuity schedules and automatic penalties are not provided. Extra payments require explicit forecast recalculation.
- Statements use one closing day and due day. Minimum payments are supplied, and interest/fees are recorded explicitly. Statements include carried balances and must not be summed as separate debts.
- Ledger activity shows the latest 200 journals, and card detail shows the latest 100 transactions. All persisted history remains in SQLite.
- Legacy opening dates are reconstructed assumptions. Corrections restate past reports/statements; accounting periods are not locked.
- Native device interaction and SQLite-driver smoke testing remain pending. Production exports verify compilation, not runtime behavior.

Device checks: migrate an existing database and reconcile account/report totals; purchase with a card and pay from its linked asset; generate a month-end statement; confirm/skip a missed recurrence and restart; record/reverse an extra loan payment and recalculate; inspect dated net worth and negative chart values. Check keyboard, accessibility labels, safe areas and light/dark appearance on both iOS and Android.

## Phase 4: exports, recovery and app lock

Settings now links to **Export, backup, restore & integrity** and **Passcode & biometric app lock**. Selected transactions export as UTF-8 CSV or a genuine SheetJS `.xlsx` workbook. Amount cells are numeric; transfers remain separate from monthly income/expenses. Workbook sheets include Transactions, referenced Accounts/Categories and Monthly Summary. CSV protects formula-like text. These exports are not complete backups.

Complete format-1 JSON backups preserve every supported financial table, audit history, relationships and preferences. SHA-256 detects accidental corruption. Optional AES-256-GCM encryption uses a supplied password and PBKDF2-HMAC-SHA256 with 600,000 iterations. Passwords and lock credentials are not backed up. Restore supports explicit replacement only, validates a staging database, saves a persistent pre-restore recovery copy, then replaces live data transactionally. Cancellation and failures preserve current data. The private recovery copy can be shared from the data screen.

The app lock uses SecureStore, a salted PBKDF2 passcode verifier, persisted attempt throttling, an enrollment-bound biometric token and a global navigation gate. Cold launches lock; background content is hidden immediately, with configurable relock timing. Forgotten credentials have no destructive reset shortcut: retain an external backup. This does not encrypt the financial SQLite database. Native builds include Face ID permission configuration.

Phase 4 used financial schema 3; optional cloud added metadata in schema 4, and MVP v4 now upgrades to schema 5. Migration history now rejects unknown/gapped versions, checks references and creates a native SQLite pre-upgrade recovery copy before upgrading existing installations. Initialization failure provides retry and recovery-copy sharing, without resetting the database. Integrity diagnostics report foreign keys, journal balance/currency, transaction-to-ledger consistency, reversal integrity, loan balances/components, recurring duplicates/links, statement references, dates, monetary precision and budget allocations. They never silently repair records.

Validation: **40 automated tests pass**, including all prior phases, selected export, real workbook parsing, backup round trips, corrupted/unsupported files, reference validation, recovery-write failure, interrupted replacement rollback, encryption authentication, passcode verification/throttling/change, unavailable biometrics, relock policy, restore cancellation and read-only diagnostics. TypeScript and ESLint pass; both iOS and Android production Hermes exports compile. These checks do not replace real-device testing.

Limits: backups support schema 5 and validated upgrades from schema 3/4, up to 20 MB and 250,000 records; CSV/workbook exports support 50,000 selected transactions. Merge, bank connections and currency conversion are not implemented; optional cloud recovery is described in CLOUD.md. Receipt attachments are device-local and excluded from financial backups/exports. Progress screens prevent navigation during data operations. Shared-file cache older than 24 hours is pruned on later exports; recipient copies and persistent recovery files remain sensitive.

See [SECURITY.md](SECURITY.md) for format, cryptography, credential recovery, storage/privacy assumptions and dependency advisories. The dependency audit currently reports 34 advisories (12 moderate, 22 high); SDK-compatible updates and native regression testing are still needed before release.

Native verification remains pending: this machine has no usable iOS simulator and ADB lists no connected Android devices. On real iOS and Android devices, test CSV/XLSX opening and sharing, encrypted/plain backup round trips, cancellation, low storage and interrupted restore, wrong passwords, SecureStore failures, valid/invalid passcodes, biometric cancellation/enrollment changes, background/resume timing, deep links while locked and privacy snapshots. Face ID requires a development/native build, not Expo Go.

```sh
npm start
npm run ios
npm run android
npm test
npm run typecheck
npm run lint
npx expo export --platform ios --platform android --output-dir /private/tmp/pocketbook-phase4-export
```

## Optional cloud and interface redesign

Cloud backup/authentication/sync implementation and deployment instructions are in [CLOUD.md](CLOUD.md). No remote project has been provisioned; cloud access defaults to free once configured. SQLite schema 4 adds sync metadata without changing financial tables. Local backups and exports remain available offline.

The four-tab interface, design decisions, preserved secondary workflows and device QA checklist are in [DESIGN.md](DESIGN.md). Native visual/performance verification remains outstanding without a usable simulator or attached device.

For a signed Android App Bundle, keep `release.keystore` locally and set `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, and `ANDROID_KEY_PASSWORD` in `.env` (or the process environment). From the project root, run `bun run android:aab` (or `npm run android:aab`). The command sets `NODE_ENV=production`, regenerates Android resources, builds all four Android architectures with limited native compiler parallelism and release signing, verifies the signature against the keystore, and copies the result to `builds/settler-1.3.0.aab`. Node.js, Android SDK and Java must be installed. Run only one build at a time. Keystores and bundle output are ignored by Git.
