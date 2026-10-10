# Pocketbook

An Android/iOS personal finance MVP built with Expo SDK 57, React Native, strict TypeScript and Expo Router. SQLite is the source of truth; Zustand holds a refreshed view of the database. No financial records are sent to a server.

## Install and run

Use Node.js 24 LTS (the repository tests use `node:sqlite`) and npm. The npm lockfile is authoritative.

```sh
npm ci
npm start
npm run android
npm run ios
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

Use `npm ci` to reproduce the checked-in versions. Legacy Bun lockfiles are not the package manager source for this implementation.

## Implemented

- Five tabs: Home, Transactions, Accounts, Reports and Settings.
- Monthly dashboard with active-account total balance, income, expenses, net cash flow, transaction count, recent activity and expense category breakdown.
- Account creation and editing, opening balances, account transaction history, archive/restore and guarded deletion. Accounts with any transaction history cannot be deleted.
- Expense, income and transfer creation/editing/deletion, calendar picker, local calendar dates, notes, compatible category selection and duplicate submission guards.
- Newest-first transaction history grouped by date, description search, type/account/category filters and inclusive date ranges. Transfers appear under both associated accounts.
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

Schema version 1 lives in `src/db/migrations.ts`:

| Table | Fields and constraints |
| --- | --- |
| accounts | ID, name, type, integer opening balance, INR currency, description, archive flag, created/updated timestamps |
| categories | ID, name, income/expense type, icon, color, archive flag, timestamps; unique name/type |
| transactions | ID, type, positive integer amount, source account FK, destination account FK, category FK, description, calendar date, notes, timestamps |
| app_settings | unique key and value, including theme, currency and category-seeding marker |
| schema_migrations | unique version and applied timestamp |

Transaction checks require a distinct destination and no category for transfers, or a category and no destination for income/expenses. Database triggers enforce category compatibility and preserve types used by historical transactions. Account/category foreign keys restrict deletion. Indexes cover dates, both account references, categories and transaction types. User values are passed through SQL parameters.

Amounts are integer paise. Inputs reject excess decimals, nonnumeric values and amounts above ₹10,000,000,000.00. A total ledger precision check keeps financial aggregates within JavaScript's safe integer range. There is no independently maintained current balance:

```text
current balance = opening balance + income - expenses - outgoing transfers + incoming transfers
net cash flow   = income - expenses
```

Transfers are excluded from income and expense totals. Dashboard totals use active accounts; history retains archived accounts/categories. Archived entries cannot be selected for new transactions; existing transactions can retain their original archived references when edited.

Transaction dates are `YYYY-MM-DD` local calendar dates, never UTC-converted instants. Creation/update audit timestamps use UTC ISO strings. Reports compare the calendar month of the transaction date. Currency is intentionally INR-only in Phase 1; conversion and mixed-currency totals are not implemented.

Repository writes are serialized, transactional where validation and mutations must remain consistent, and followed by a fresh SQLite snapshot. The database interface is injectable for tests and leaves room for a later ledger or sync layer without coupling SQL to screens.

## Validation

```sh
npm run typecheck
npm run lint
npm test
npx expo install --check
npx expo export --platform ios --platform android --output-dir /private/tmp/pocketbook-export
```

The test suite executes the actual repository and migration SQL against SQLite through a Node adapter, rather than mocking query results. Seven tests cover money precision and local dates; empty initialization and seed idempotence; account creation/editing, income, expenses, transfers and transaction edits/deletes; validation and archives; file-backed restart persistence; migration rollback/retry; and database constraints. The restart test closes and reopens a real database file and verifies balances, renamed seed categories and preferences.

TypeScript, ESLint and all seven tests pass. Both iOS and Android development bundles and production Hermes exports were successfully generated. Native device UI, keyboard, accessibility and actual Expo SQLite restart behavior require the device smoke test below: this machine has no connected Android device or usable Xcode simulator. Node SQLite verifies repository behavior but does not substitute for testing the native driver.

### Device smoke test

1. Launch the app, confirm the five tabs and create Bank (₹1,000) and Cash (₹200).
2. Add ₹500 income and ₹100 expense to Bank; transfer ₹300 from Bank to Cash. Expect Bank ₹1,100, Cash ₹500, total ₹1,600; monthly income ₹500, expense ₹100, net ₹400.
3. Edit the transfer to ₹200. Expect Bank ₹1,200 and Cash ₹400. Delete the expense; expect Bank ₹1,300 and expense ₹0.
4. Exercise search, every filter and month navigation. Rename a default category; create and archive a custom category.
5. Confirm that deleting an account with history fails and that archiving preserves transactions. Restore it.
6. Switch appearance, force-close the app, relaunch and verify entries, balances, preferences and the renamed category remain.
7. Check calendar entry, keyboard behavior and screen reader labels on both platforms.

## Remaining limitations

- No authentication, cloud sync, bank connections, subscriptions, advanced budgets, lock screen, export or backup. Uninstalling may delete the local database. Local storage does not protect against device compromise.
- Native device smoke testing remains outstanding. Production bundles do not prove native runtime correctness.
- History currently loads into memory and renders through a ScrollView. Large ledgers should add repository pagination and virtualized lists before scaling beyond personal MVP use.
- Compatible dependency security fixes removed the initial critical finding. The final npm audit still reports 31 advisories (21 high, 10 moderate) in the Expo/React Native tooling tree (including advisories without a compatible patched upstream version). Review these before release; forced downgrades or an untested SDK migration were not applied.
- Biometric/passcode protection and a future double-entry ledger are extension points, not implemented features.
