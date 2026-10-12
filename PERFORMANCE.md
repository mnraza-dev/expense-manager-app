# Performance changes — 12 October 2026

Startup and ordinary writes no longer hydrate the entire transaction history into Zustand. The store loads account balances, categories, settings, a SQL transaction count and up to six reusable templates per transaction type. Home queries monthly totals and five recent entries; account details query the latest 50 entries and link to the account's complete paginated history.

Editing an old transaction, reviewing a refund and checking scanned-receipt duplicates use targeted SQL queries. They continue to work for records outside recent history. Full snapshots remain available for compatibility, with split attachment changed from repeated filtering to a single indexed pass.

Sync outbox capture reads changed rows and their required UUID mappings instead of reading every table and remapping the whole dataset on each write. Mapping lookup and remote-record materialization use Maps. Tombstones, pending revisions and atomic write/outbox rollback are covered by regression tests. Full remote adoption retains staging and financial integrity validation.

Local indexes cover journal-line lookup, entry history and receipt duplicate matching. They are installed idempotently on initialization, restore, staging validation and cloud rebuild; financial schema and cloud payload version remain 5.

Focused queries retain visible data during refresh, discard stale responses and invalidate only their ledger, budget or planning domain. Restores invalidate all domains. Transaction history retains loaded pages after returning from an editor and refreshes the loaded window after changes so pagination does not retain deleted entries or skip moved rows. Unchanged store rows retain object identity, and transaction rows are memoized with individual reference-name selectors.

## Local benchmark

Node v24.20.0 / SQLite 3.53.4, synthetic balanced journals, 10% split transactions. Each dataset was measured once using separate identical file-backed databases for the original and optimized repositories. Startup timings cover the initial store read, not database opening, native app launch or UI rendering. Save-and-refresh includes the local write and store read. Synced save includes local outbox capture, without a refresh or network request. SQL counts include read/write calls, excluding transaction boundaries and initialization.

| Transactions | Startup read, before → after | Local save + refresh, before → after | Sync-enabled save, before → after |
| ------------ | ---------------------------- | ------------------------------------ | --------------------------------- |
| 1,000        | 5.7 → 2.1 ms                 | 7.4 → 4.2 ms                         | 89.3 → 2.4 ms                     |
| 10,000       | 530.0 → 21.1 ms              | 499.7 → 23.1 ms                      | 917.2 → 3.5 ms                    |
| 50,000       | 954,714.5 → 153.1 ms         | 984,662.1 → 160.4 ms                 | 5,754.1 → 11.4 ms                 |

The 50,000-record original snapshot exhibited a severe slowdown in repeated split filtering; its unusually long timings are single-run observations, not a reliable device speedup estimate. Use the work/row counts as the more reproducible comparison: at 50,000 transactions the store read returned **60,026 → 31 rows** and its serialized result shrank from **19,716,717 → 5,532 bytes**. These bytes measure the result payload, not heap memory. A synced save made **265,108 → 56 SQL calls**, returned **530,114 → 36 rows**, and produced the same five outgoing changes.

The fixture has one bank account, 24 repeating descriptions and established UUID mappings. The 50,000-record sync case simulates those mappings directly; it does not bypass or increase the existing 10,000-record initial-sync limit in the app. Account balance aggregation and template selection still perform SQL work proportional to history; the optimization bounds data transferred into JavaScript, rather than making every query constant-time. Full cloud downloads and validated rebuilds are still full-dataset operations.

Raw results: [docs/performance/2026-10-12.json](docs/performance/2026-10-12.json).

To measure the current implementation (Node 24+):

```sh
npm test
npm run benchmark:performance -- --output /private/tmp/settler-performance.json
```

For a before/after run, compile the original revision into a separate directory with its dependencies resolvable, then add `--baseline /path/to/original/.test-build`. The benchmark only creates synthetic temporary databases and removes them when finished.

## Validation and remaining device work

127 SQLite, accounting, sync and store regression tests pass. Added checks cover bounded reads, old-entry/refund context, receipt matching, index query plans, sync deltas/tombstones/rollback, UUID reference resolution, pagination after deletion, targeted invalidation, refresh races and saved-change refresh failures. TypeScript and ESLint pass; both iOS and Android production Hermes exports pass.

No physical-device timing, heap or frame measurements have been collected. Before shipping, profile cold launch, repeated saves with sync enabled, scrolling, filter changes and returning from old-entry/refund editors on a lower-memory Android phone with realistic history. Include split/refund accounting and scanned receipts in that check. The previously generated 1.3.0 AAB predates these changes; a new native release build is needed to distribute them.
