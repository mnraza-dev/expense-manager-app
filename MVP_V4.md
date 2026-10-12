# Settler MVP v4 — reminders, savings goals, refunds and split expenses

App version 1.3.0, Android version code 5, package `com.razatechlabs.settler`. SQLite financial schema and cloud sync schema advance to 5. Existing IDs, balances, receipt attachments and immutable ledger history are preserved during migration. Native initialization retains its pre-upgrade recovery copy.

## Bills and payment reminders

Open **Bills & payment reminders** from Overview or Finance tools. Create, edit, delete or mark a manual bill handled. Handling a reminder does not record a payment; enter the financial transaction separately. Enabled expense/loan recurring rules contribute upcoming anchored dates, and generated unpaid credit-card statements contribute their due dates. Pause/cancel a recurring rule or complete/skip its occurrence to remove its future alert. Card payments and linked refunds reduce statement amounts due. Overdue manual bills and statements remain visible in the app; past notifications are not replayed.

Notifications are explicitly enabled on each device. The permission request occurs only when the user enables them. Choose the due date, one day before or three days before, at 9 AM in the device's local timezone. If the lead time has already passed, the scheduler uses the due date's 9 AM when still in the future. Text shows a generic payment reminder and contains no bill name, account or amount. Notifications open the app normally; app-lock protection still applies. No push token or notification server is used.

The next 60 days of payments are considered; the earliest 60 future alerts are scheduled. Opening/resuming the app, local changes and foreground hourly refresh reconcile pending alerts. Edits, handling/deletion, pause/cancellation, restore and cloud download cancel stale scheduled alerts. Duplicate identifiers are reused. Device settings and battery restrictions can affect delivery; alerts are reminders rather than guaranteed exact-time alarms. Reopen Settler periodically to replenish the pending horizon, and after changing timezone. Notification preferences are device-local and excluded from financial backups and cloud sync.

[Expo Notifications](https://docs.expo.dev/versions/latest/sdk/notifications/) is installed at the SDK-compatible version and configured in `app.json`. Rebuild the native binary to add the module; a Metro reload cannot add it. Older binaries can still open the app and show a rebuild/retry error when notification APIs are unavailable.

## Savings goals

Open **Savings goals** from Overview or Finance tools. Create/edit a named target with an optional calendar deadline, add earmarked contributions, record withdrawals and view history. Progress displays saved amount, remaining amount, target status and past target dates. Archive/restore goals without removing contributions. Contributions can be removed after confirmation when the resulting total remains valid.

These are planning records for money already held, not new assets or automatic transfers. Goals do not change account balances, spending, income or net worth. Record real account movements in Transactions. A goal's earmarked balance cannot go below zero or exceed the supported monetary limit; it may exceed its target. Goals do not verify that the corresponding money is available in an account.

## Split-category expenses

In a new or existing standard expense, choose **Split across categories**. Enter 2–20 unique expense categories with positive amounts that sum exactly to the overall amount. Income, transfers, interest, fees and loan components cannot be split. Existing historical categories can be retained; new expense allocations use active categories.

A split expense remains one transaction with one receipt collection. It creates a balanced journal containing one debit per category and a single account credit. Edits reverse the old journal and post a replacement; unchanged allocation IDs are preserved for cloud sync. Budgets and category reports use the allocated amounts, while transaction counts and overall spending count the purchase once. Category filters and search find all allocated categories. Selected exports retain one row per transaction and include category names with allocation amounts; filtering by a category selects the whole transaction.

## Linked full and partial refunds

Open a posted standard purchase and choose **Record a full or partial refund**. The draft defaults to the remaining refundable amounts. Edit the amount and category allocations for a partial refund. Refunds must use the purchase's original account/categories and a date on or after its purchase date. Archived original accounts/categories are supported for returns. Card refunds reduce debt; asset-account refunds increase the balance. Interest, fees and loan components use their existing correction workflows.

Refunds are recorded as linked positive-amount expense records in storage, with their posting direction reversed. Reports use a negative expense amount on the refund date; income stays unchanged. Refunds from older purchases can therefore produce negative net spending for a day/month/category. Category views show an amount table when a pie chart would include negative values. CSV/XLSX/PDF exports include signed refund amounts; CSV and workbook transactions include the original transaction link.

Refunds cannot exceed the unrefunded purchase amount in any category. Purchases with active refunds must have those refunds reversed before they can be edited or deleted. Deleting a refund reverses its journal and releases refundable capacity; historical postings remain immutable. The cloud server validates the combined refund totals across devices, so simultaneous returns that exceed a purchase create a conflict for review.

## Recovery, cloud and verification

Schema-5 JSON backups include splits, refund links, goals/contributions and bills. Schema-3 and schema-4 backups are checksum-checked before an in-memory upgrade, then validated in a staging database. Receipt files and device notification preferences retain their existing local-only policy. Restoring a backup reconciles device alerts through the existing mutation refresh.

Deploy `supabase/migrations/202610120001_mvp4.sql` before using v1.3 cloud sync. It extends cloud record definitions, financial graph validation and backup schema support. Old financial snapshots without refund fields materialize with null links. Pending schema-4 operations retain their original fingerprints/receipts, and incoming legacy transactions are normalized during insertion. Upgrade devices together; older app versions cannot consume schema-5 snapshots. This repository change does not deploy a remote Supabase project.

Verification: 117 automated tests pass; TypeScript and ESLint pass. Both iOS and Android production Hermes bundles compile. Physical-device interaction and notification delivery remain pending.

Automated coverage includes balanced split journals, category budgets/filtering, rollback, preserved split IDs, refund-date reporting, per-category caps, correction/deletion guards, archived purchase refunds, card statement credits, signed exports, goal balances, backup round trips and older-schema recovery, malformed backup rejection, month-end recurrence dates, notification timing/caps/reconciliation and real PostgreSQL cloud validation with concurrent refunds.

Run:

```sh
npm run typecheck
npm run lint
npm test
npx expo export --platform ios --platform android --output-dir /private/tmp/settler-mvp4-export
```

Physical-device acceptance before distribution:

1. Rebuild/install on Android and iOS. Enable/deny permissions, change lead time, edit/delete/handle a bill, and confirm alerts persist across restart and show generic text while locked. Check foreground/background delivery and timezone changes.
2. Set up an anchored month-end rent or EMI recurrence; complete/skip/pause it. Generate a card statement, record a payment/refund and verify its reminder is removed when paid.
3. Create a savings target, add/withdraw savings, edit its deadline, archive/restore and restart. Account balances and financial reports must remain unchanged.
4. Save a split receipt, reopen/edit it, and inspect each category's budget/report totals. Reject mismatched totals and duplicate categories. Confirm one account movement and one receipt collection.
5. Record partial and full refunds of ordinary/split/card purchases. Reject over-refunds and earlier dates. Check negative spending in a later month, exports, linked-history navigation and reversing a refund.
6. Restore legacy and new backups, including interrupted restore. Enable cloud on two devices with the migration deployed, verify all four features round-trip and review an over-refund conflict. Notification scheduling remains independently enabled per device.

## Required update rollout

This release includes a native minimum-version gate for future mandatory updates. See [UPDATES.md](UPDATES.md) for the separate public-policy migration, distribution links, cached offline enforcement and the limitation of already-installed releases that contain no checker.
