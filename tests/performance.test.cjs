const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { randomUUID } = require('node:crypto');
const { Repositories } = require('../.test-build/db/repositories.js');
const { withOutbox } = require('../.test-build/cloud/outbox.js');
const { canonicalize, materialize } = require('../.test-build/cloud/model.js');
const { createFinanceStore } = require('../.test-build/store/financeStore.js');
const { recentEntryTemplates } = require('../.test-build/utils/quickEntry.js');
const { possibleReceiptDuplicates } = require('../.test-build/utils/receiptScan.js');
const {
  transactionRequest,
  retainTransactions,
} = require('../.test-build/utils/transactionPages.js');
function adapter(n, trace = []) {
  return {
    execAsync: async (s) => {
      trace.push({ sql: s, rows: 0 });
      n.exec(s);
    },
    runAsync: async (s, ...p) => {
      trace.push({ sql: s, rows: 0 });
      return n.prepare(s).run(...p);
    },
    getAllAsync: async (s, ...p) => {
      const rows = n.prepare(s).all(...p);
      trace.push({ sql: s, rows: rows.length });
      return rows;
    },
    getFirstAsync: async (s, ...p) => {
      const row = n.prepare(s).get(...p) ?? null;
      trace.push({ sql: s, rows: row ? 1 : 0 });
      return row;
    },
    withTransactionAsync: async (f) => {
      n.exec('BEGIN');
      try {
        await f();
        n.exec('COMMIT');
      } catch (e) {
        n.exec('ROLLBACK');
        throw e;
      }
    },
  };
}
async function fixture() {
  const n = new DatabaseSync(':memory:'),
    trace = [],
    r = new Repositories(withOutbox(adapter(n, trace)));
  await r.initialize();
  await r.saveAccount({ name: 'Bank', type: 'bank', opening_balance: 100000, description: '' });
  const s = await r.snapshot(),
    bank = s.accounts[0].id,
    cats = s.categories.filter((c) => c.type === 'expense'),
    income = s.categories.find((c) => c.type === 'income').id;
  return {
    n,
    r,
    trace,
    bank,
    cats,
    income,
    tx: (amount = 100, date = '2026-10-01') => ({
      type: 'expense',
      amount,
      account_id: bank,
      destination_account_id: null,
      category_id: cats[0].id,
      description: 'Purchase',
      date,
      notes: '',
    }),
  };
}
const range = { start: '2026-10-01', end: '2026-10-31' };
test('bounded metadata and SQL dashboard match full-history accounting, including split refunds', async () => {
  const d = await fixture();
  for (let i = 0; i < 35; i++)
    await d.r.saveTransaction({ ...d.tx(100 + i), description: `Expense ${i}` });
  const purchase = await d.r.saveTransaction({
    ...d.tx(1000),
    splits: [
      { category_id: d.cats[0].id, amount: 600 },
      { category_id: d.cats[1].id, amount: 400 },
    ],
  });
  await d.r.saveTransaction({ ...d.tx(200), refund_of_id: purchase });
  const full = await d.r.snapshot(),
    references = await d.r.referenceSnapshot(),
    dashboard = await d.r.dashboard('2026-10'),
    report = await d.r.report(range);
  assert.equal(references.transactionCount, full.transactions.length);
  assert.equal(Object.hasOwn(references, 'transactions'), false);
  assert.equal(references.templates.length, 6);
  assert.deepEqual(
    references.templates.map((t) => t.id),
    recentEntryTemplates(full.transactions, full.accounts, full.categories, 'expense').map(
      (t) => t.id
    )
  );
  assert.equal(dashboard.expense, report.expense);
  assert.equal(dashboard.income, report.income);
  assert.equal(dashboard.count, report.count);
  assert.deepEqual(
    dashboard.recent.map((t) => t.id),
    full.transactions.slice(0, 5).map((t) => t.id)
  );
  assert.equal((await d.r.transactionContext(purchase)).existing.splits.length, 2);
  assert.equal((await d.r.transactionContext(purchase)).refunds[0].refund_of_id, purchase);
  const refund = full.transactions.find((t) => t.refund_of_id);
  const context = await d.r.transactionContext(refund.id);
  assert.equal(context.original.id, purchase);
  assert.equal(context.existing.id, refund.id);
  assert.deepEqual(await d.r.integrity(), []);
  d.n.close();
});
test('templates preserve account-specific history, duplicate semantics, archived exclusions and stable ordering', async () => {
  const d = await fixture();
  await d.r.saveAccount({ name: 'Other bank', type: 'bank', opening_balance: 0, description: '' });
  const other = (await d.r.snapshot()).accounts.find((a) => a.id !== d.bank).id;
  await d.r.saveTransaction({
    ...d.tx(),
    type: 'income',
    category_id: d.income,
    description: 'Income template',
  });
  await d.r.saveTransaction({
    ...d.tx(),
    type: 'transfer',
    category_id: null,
    destination_account_id: other,
    description: 'Transfer template',
  });
  const historical = await d.r.saveTransaction({
    ...d.tx(),
    description: 'Remembered old account',
  });
  for (let i = 0; i < 20; i++)
    await d.r.saveTransaction({ ...d.tx(), account_id: other, description: `Other ${i}` });
  assert.equal((await d.r.entryTemplates(d.bank))[0].id, historical);
  const snapshot = await d.r.snapshot();
  for (const type of ['expense', 'income', 'transfer'])
    assert.deepEqual(
      (await d.r.entryTemplates()).filter((t) => t.type === type).map((t) => t.id),
      recentEntryTemplates(snapshot.transactions, snapshot.accounts, snapshot.categories, type).map(
        (t) => t.id
      )
    );
  const duplicates = await d.r.receiptDuplicates(100, '2026-10-01', other);
  assert.deepEqual(
    duplicates.map((t) => t.id),
    possibleReceiptDuplicates(snapshot.transactions, {
      amount: '1.00',
      date: '2026-10-01',
      account: other,
    }).map((t) => t.id)
  );
  await d.r.deleteTransaction(duplicates[0].id);
  assert.ok(
    !(await d.r.receiptDuplicates(100, '2026-10-01', other)).some((t) => t.id === duplicates[0].id)
  );
  await d.r.archiveAccount(other, true);
  assert.ok(
    (await d.r.entryTemplates()).every(
      (t) => t.account_id !== other && t.destination_account_id !== other
    )
  );
  assert.deepEqual(await d.r.receiptDuplicates(0, 'bad', other), []);
  d.n.close();
});
test('journal lookups and exact receipt matches use local indexes; schema remains compatible', async () => {
  const d = await fixture();
  const journal = d.n
    .prepare('EXPLAIN QUERY PLAN SELECT * FROM ledger_lines WHERE journal_id=?')
    .all(1);
  assert.ok(journal.some((p) => p.detail.includes('ledger_lines_journal')));
  const duplicates = d.n
    .prepare(
      "EXPLAIN QUERY PLAN SELECT * FROM transactions WHERE status='posted' AND type='expense' AND refund_of_id IS NULL AND amount=? AND date=? AND account_id=? ORDER BY date DESC,id DESC LIMIT 5"
    )
    .all(100, '2026-10-01', d.bank);
  assert.ok(duplicates.some((p) => p.detail.includes('transactions_receipt_match')));
  assert.equal(d.n.prepare('SELECT MAX(version) n FROM schema_migrations').get().n, 5);
  await d.r.initialize();
  assert.deepEqual(await d.r.integrity(), []);
  d.n.close();
});
test('outbox capture reads only dirty records and their mappings while retaining canonical references', async () => {
  const d = await fixture(),
    owner = randomUUID();
  for (let i = 0; i < 60; i++)
    await d.r.saveTransaction({ ...d.tx(), description: `Historical ${i}` });
  await d.r.enableSync(owner);
  let op = await d.r.nextOperation(owner);
  await d.r.acknowledge(op, 1);
  d.trace.length = 0;
  const id = await d.r.saveTransaction({ ...d.tx(123), description: 'New entry' });
  const capture = d.trace.filter((t) =>
    /^SELECT \* FROM (transactions|accounts|categories|ledger_lines|ledger_journals|sync_mappings)(\s|$)/.test(
      t.sql
    )
  );
  assert.ok(
    capture.every((t) => /WHERE/.test(t.sql)),
    capture.map((t) => t.sql).join('\n')
  );
  assert.ok(capture.reduce((s, t) => s + t.rows, 0) < 35);
  op = await d.r.nextOperation(owner);
  const changed = op.changes.find(
    (c) => c.entity === 'transactions' && c.data.description === 'New entry'
  );
  assert.equal(changed.data.id, changed.id);
  assert.match(changed.data.account_id, /^[a-f0-9-]{36}$/);
  assert.equal(changed.expected_revision, 0);
  assert.ok(op.changes.some((c) => c.entity === 'transaction_journals'));
  await d.r.saveTransaction({ ...d.tx(124), description: 'Corrected entry' }, id);
  const pending = d.n.prepare('SELECT payload FROM sync_outbox ORDER BY rowid DESC LIMIT 1').get();
  assert.equal(
    JSON.parse(pending.payload).changes.find((c) => c.entity === 'transactions').expected_revision,
    -1
  );
  await d.r.acknowledge(op, 2);
  const next = await d.r.nextOperation(owner);
  assert.equal(next.changes.find((c) => c.entity === 'transactions').expected_revision, 2);
  assert.deepEqual(await d.r.integrity(), []);
  d.n.close();
});
test('incremental mapping preserves deleted allocation tombstones and rolls back a failed outbox write', async () => {
  const d = await fixture(),
    owner = randomUUID();
  await d.r.enableSync(owner);
  await d.r.acknowledge(await d.r.nextOperation(owner), 1);
  const budget = await d.r.saveBudget({
    name: 'October',
    month: '2026-10',
    total_limit_minor: 1000,
    allocations: [{ category_id: d.cats[0].id, limit_minor: 500 }],
  });
  const created = await d.r.nextOperation(owner);
  await d.r.acknowledge(created, 2);
  const global = created.changes.find((c) => c.entity === 'budget_categories').id;
  await d.r.deleteBudget(budget);
  const removed = await d.r.nextOperation(owner);
  assert.equal(removed.changes.find((c) => c.entity === 'budget_categories').id, global);
  assert.equal(removed.changes.find((c) => c.entity === 'budget_categories').deleted, true);
  d.n.exec(
    "CREATE TRIGGER fail_outbox BEFORE INSERT ON sync_outbox BEGIN SELECT RAISE(ABORT,'outbox failed'); END"
  );
  const before = (await d.r.snapshot()).transactions.length;
  await assert.rejects(d.r.saveTransaction(d.tx()), /outbox failed/);
  assert.equal((await d.r.snapshot()).transactions.length, before);
  assert.deepEqual(await d.r.integrity(), []);
  d.n.close();
});
test('bulk UUID materialization keeps cyclic references and rejects a cross-entity mapping', async () => {
  const d = await fixture();
  await d.r.saveTransaction(d.tx());
  const canonical = await d.r.canonicalSnapshot();
  const records = canonical.map((c) => ({ ...c, revision: 1, deleted: false }));
  const result = materialize(records, []);
  assert.equal(result.tables.transactions[0].account_id, result.tables.accounts[0].id);
  const mapping = result.mappings.find((m) => m.entity === 'accounts');
  assert.throws(() => materialize(records, [{ ...mapping, entity: 'categories' }]), /unresolved/);
  const tx = result.tables.transactions[0];
  assert.equal(
    canonicalize('transactions', tx, result.mappings).id,
    records.find((r) => r.entity === 'transactions').id
  );
  d.n.close();
});
test('history windows refresh all loaded pages after edits and avoid gaps on continued pagination', async () => {
  const d = await fixture();
  for (let i = 0; i < 125; i++)
    await d.r.saveTransaction({ ...d.tx(100 + i), description: `Row ${i}` });
  const key = {},
    loaded = { key, page: 1, revision: 1 };
  assert.deepEqual(transactionRequest(key, 2, 1, loaded), {
    page: 2,
    append: true,
    offset: 100,
    limit: 50,
  });
  assert.deepEqual(transactionRequest(key, 1, 2, loaded), {
    page: 1,
    append: false,
    offset: 0,
    limit: 100,
  });
  assert.deepEqual(transactionRequest({}, 3, 1, loaded), {
    page: 0,
    append: false,
    offset: 0,
    limit: 50,
  });
  const window = await d.r.transactionWindow({}, 100);
  assert.equal(window.rows.length, 100);
  assert.equal(window.count, 125);
  await d.r.deleteTransaction(window.rows[0].id);
  const refreshed = await d.r.transactionWindow({}, 100),
    next = await d.r.searchTransactions({}, 100, 50);
  assert.equal(new Set([...refreshed.rows, ...next.rows].map((t) => t.id)).size, 124);
  const unchanged = retainTransactions(
    refreshed.rows,
    refreshed.rows.map((t) => ({ ...t }))
  );
  assert.equal(unchanged[0], refreshed.rows[0]);
  const changed = retainTransactions(refreshed.rows, [{ ...refreshed.rows[0], receipt_count: 1 }]);
  assert.notEqual(changed[0], refreshed.rows[0]);
  d.n.close();
});
function metadata() {
  return {
    accounts: [],
    categories: [],
    settings: { theme: 'system' },
    templates: [],
    transactionCount: 0,
  };
}
test('planning and budget writes invalidate only their views; dataset restore refreshes every domain', async () => {
  let reads = 0;
  const store = createFinanceStore({
    initialize: async () => {},
    snapshot: async () => {
      reads++;
      return metadata();
    },
    settings: async () => ({}),
  });
  await store.getState().initialize();
  await store.getState().mutatePlanning(async () => {});
  await store.getState().mutateBudget(async () => {});
  assert.equal(reads, 1);
  assert.equal(store.getState().revision, 0);
  assert.equal(store.getState().planningRevision, 1);
  assert.equal(store.getState().budgetRevision, 1);
  await store.getState().mutate(async () => {}, 'all');
  assert.equal(reads, 2);
  assert.equal(store.getState().revision, 1);
  assert.equal(store.getState().planningRevision, 2);
  assert.equal(store.getState().budgetRevision, 2);
});
test('newer metadata wins concurrent refreshes; unchanged arrays keep their identities', async () => {
  const pending = [];
  const store = createFinanceStore({
    initialize: async () => {},
    snapshot: () => new Promise((resolve, reject) => pending.push({ resolve, reject })),
    settings: async () => ({}),
  });
  const a = store.getState().refresh(),
    b = store.getState().refresh();
  pending[1].resolve({ ...metadata(), transactionCount: 2 });
  await b;
  pending[0].resolve({ ...metadata(), transactionCount: 1 });
  await a;
  assert.equal(store.getState().transactionCount, 2);
  const before = store.getState().accounts,
    settings = store.getState().settings;
  const c = store.getState().refresh();
  pending[2].resolve({ ...metadata(), transactionCount: 2 });
  await c;
  assert.equal(store.getState().accounts, before);
  assert.equal(store.getState().settings, settings);
  const old = store.getState().refresh(),
    newer = store.getState().refresh();
  pending[4].resolve({ ...metadata(), transactionCount: 3 });
  await newer;
  pending[3].reject(new Error('stale failure'));
  await old;
  assert.equal(store.getState().transactionCount, 3);
});
test('a failed financial refresh reports a saved change; a failed write emits no invalidation', async () => {
  const store = createFinanceStore({
    initialize: async () => {},
    snapshot: async () => {
      throw new Error('read');
    },
    settings: async () => ({}),
  });
  await store.getState().mutate(async () => {});
  assert.equal(store.getState().revision, 1);
  assert.match(store.getState().refreshError, /saved locally/);
  await assert.rejects(
    store.getState().mutate(async () => {
      throw new Error('write');
    }),
    /write/
  );
  assert.equal(store.getState().revision, 1);
});
