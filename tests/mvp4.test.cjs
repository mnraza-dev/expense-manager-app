const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { randomUUID } = require('node:crypto');
const { readFileSync, readdirSync } = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');
const XLSX = require('xlsx');
const { Repositories } = require('../.test-build/db/repositories.js');
const { DataRepository } = require('../.test-build/db/dataRepository.js');
const { withOutbox } = require('../.test-build/cloud/outbox.js');
const { migrations } = require('../.test-build/db/migrations.js');
const { validateBackup } = require('../.test-build/services/backup.js');
const { digest } = require('../.test-build/security/crypto.js');
const { summary, localDate } = require('../.test-build/utils/finance.js');
const { expenseGroups } = require('../.test-build/utils/expenseReports.js');
const { transactionWorkbook } = require('../.test-build/utils/workbook.js');
const { expenseReportHTML } = require('../.test-build/utils/expensePDF.js');
const { remainingRefundParts } = require('../.test-build/utils/expenseAllocations.js');
const { reminderPlan, reconcileReminders } = require('../.test-build/utils/reminderPlan.js');
function adapter(n) {
  return {
    execAsync: async (s) => n.exec(s),
    runAsync: async (s, ...p) => n.prepare(s).run(...p),
    getAllAsync: async (s, ...p) => n.prepare(s).all(...p),
    getFirstAsync: async (s, ...p) => n.prepare(s).get(...p) ?? null,
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
    r = new Repositories(withOutbox(adapter(n)));
  await r.initialize();
  await r.saveAccount({ name: 'Bank', type: 'bank', opening_balance: 100000, description: '' });
  const snap = await r.snapshot(),
    bank = snap.accounts[0].id,
    cats = snap.categories.filter((c) => c.type === 'expense');
  const tx = (amount = 1000, date = '2026-10-01') => ({
    type: 'expense',
    amount,
    account_id: bank,
    destination_account_id: null,
    category_id: cats[0].id,
    description: 'Purchase',
    date,
    notes: '',
  });
  return { n, r, bank, cats, tx };
}
const range = { start: '2026-10-01', end: '2026-10-31' };
test('one split purchase posts one balanced journal and distributes budgets, reports and category filters', async () => {
  const { n, r, cats, tx } = await fixture();
  const parts = [
    { category_id: cats[0].id, amount: 600 },
    { category_id: cats[1].id, amount: 400 },
  ];
  const id = await r.saveTransaction({ ...tx(), splits: parts });
  assert.equal(n.prepare('SELECT count(*) n FROM transactions').get().n, 1);
  assert.equal(
    n
      .prepare(
        'SELECT count(*) n FROM ledger_lines WHERE journal_id=(SELECT journal_id FROM transaction_journals WHERE transaction_id=?)'
      )
      .get(id).n,
    3
  );
  assert.equal((await r.snapshot()).accounts[0].ledger_balance, 99000);
  const report = await r.report(range);
  assert.equal(report.expense, 1000);
  assert.equal(report.count, 1);
  assert.equal(report.categories.find((c) => c.id === cats[1].id).amount, 400);
  await r.saveBudget({
    name: 'October',
    month: '2026-10',
    total_limit_minor: 2000,
    allocations: [{ category_id: cats[1].id, limit_minor: 500 }],
  });
  const budget = await r.budgetProgress('2026-10');
  assert.equal(budget.categories[0].spent, 400);
  assert.equal(budget.spent, 1000);
  assert.equal((await r.searchTransactions({ category_id: cats[1].id })).count, 1);
  assert.equal((await r.searchTransactions({ query: cats[1].name })).count, 1);
  assert.equal((await r.exportTransactions({ category: cats[1].id })).length, 1);
  assert.deepEqual(await r.integrity(), []);
  n.close();
});
test('split validation and failed posting are atomic; editing preserves audit history and split IDs', async () => {
  const { n, r, cats, tx } = await fixture();
  await assert.rejects(
    r.saveTransaction({
      ...tx(),
      splits: [
        { category_id: cats[0].id, amount: 500 },
        { category_id: cats[1].id, amount: 400 },
      ],
    }),
    /add up/
  );
  await assert.rejects(
    r.saveTransaction({
      ...tx(),
      splits: [
        { category_id: cats[0].id, amount: 500 },
        { category_id: cats[0].id, amount: 500 },
      ],
    }),
    /different/
  );
  assert.equal(n.prepare('SELECT count(*) n FROM transactions').get().n, 0);
  const id = await r.saveTransaction({
    ...tx(),
    splits: [
      { category_id: cats[0].id, amount: 600 },
      { category_id: cats[1].id, amount: 400 },
    ],
  });
  const before = n.prepare('SELECT id FROM expense_splits ORDER BY id').all();
  await r.saveTransaction(
    {
      ...tx(1200),
      splits: [
        { category_id: cats[0].id, amount: 600 },
        { category_id: cats[1].id, amount: 600 },
      ],
    },
    id
  );
  assert.deepEqual(n.prepare('SELECT id FROM expense_splits ORDER BY id').all(), before);
  assert.equal(
    n.prepare('SELECT count(*) n FROM ledger_journals WHERE reversal_of IS NOT NULL').get().n,
    1
  );
  n.exec(
    "CREATE TRIGGER fail_split BEFORE INSERT ON ledger_lines WHEN NEW.debit=999 BEGIN SELECT RAISE(ABORT,'simulated'); END"
  );
  await assert.rejects(
    r.saveTransaction(
      {
        ...tx(1499),
        splits: [
          { category_id: cats[0].id, amount: 999 },
          { category_id: cats[1].id, amount: 500 },
        ],
      },
      id
    ),
    /simulated/
  );
  assert.equal((await r.report(range)).expense, 1200);
  assert.deepEqual(await r.integrity(), []);
  n.close();
});
test('partial linked refunds reduce spending on their own date and never become income', async () => {
  const { n, r, cats, tx } = await fixture();
  const id = await r.saveTransaction({
    ...tx(),
    splits: [
      { category_id: cats[0].id, amount: 600 },
      { category_id: cats[1].id, amount: 400 },
    ],
  });
  const refund = await r.saveTransaction({ ...tx(300, '2026-11-01'), refund_of_id: id });
  assert.equal((await r.snapshot()).accounts[0].ledger_balance, 99300);
  assert.equal((await r.report(range)).expense, 1000);
  const nov = await r.report({ start: '2026-11-01', end: '2026-11-30' });
  assert.equal(nov.expense, -300);
  assert.equal(nov.income, 0);
  assert.equal(nov.net, 300);
  assert.equal((await r.transactionCalendar('2026-11'))[0].expense, -300);
  assert.equal(summary((await r.snapshot()).transactions, '2026-11').expense, -300);
  const snapshot = await r.snapshot(),
    original = snapshot.transactions.find((t) => t.id === id);
  assert.deepEqual(
    remainingRefundParts(original, snapshot.transactions).map((p) => p.amount),
    [300, 400]
  );
  await assert.rejects(r.saveTransaction({ ...tx(301), refund_of_id: id }), /remaining/);
  await assert.rejects(r.deleteTransaction(id), /linked refunds/);
  await assert.rejects(r.saveTransaction(tx(), id), /linked refunds/);
  await r.deleteTransaction(refund);
  assert.equal((await r.snapshot()).accounts[0].ledger_balance, 99000);
  await r.deleteTransaction(id);
  assert.equal((await r.snapshot()).accounts[0].ledger_balance, 100000);
  assert.deepEqual(await r.integrity(), []);
  n.close();
});
test('split refunds enforce per-category caps, compatible source and purchase dates', async () => {
  const { n, r, cats, tx } = await fixture();
  const id = await r.saveTransaction({
    ...tx(),
    splits: [
      { category_id: cats[0].id, amount: 600 },
      { category_id: cats[1].id, amount: 400 },
    ],
  });
  await assert.rejects(
    r.saveTransaction({ ...tx(500), category_id: cats[1].id, refund_of_id: id }),
    /remaining/
  );
  await assert.rejects(
    r.saveTransaction({ ...tx(50, '2026-09-30'), refund_of_id: id }),
    /purchase/
  );
  await assert.rejects(
    r.saveTransaction({ ...tx(50), category_id: cats[2].id, refund_of_id: id }),
    /remaining/
  );
  const refund = await r.saveTransaction({
    ...tx(),
    refund_of_id: id,
    splits: [
      { category_id: cats[0].id, amount: 600 },
      { category_id: cats[1].id, amount: 400 },
    ],
  });
  await assert.rejects(r.saveTransaction({ ...tx(1), refund_of_id: id }), /remaining/);
  await assert.rejects(r.saveTransaction({ ...tx(1), refund_of_id: refund }), /purchase/);
  assert.equal((await r.report(range)).expense, 0);
  assert.deepEqual(await r.integrity(), []);
  n.close();
});
test('card refunds reduce debt and appear as statement credits, including after closing', async () => {
  const { n, r, bank, tx } = await fixture();
  const card = await r.saveCard({
    name: 'Card',
    nickname: '',
    credit_limit: 100000,
    opening_balance: 0,
    closing_day: 5,
    due_day: 28,
    payment_account_id: bank,
    minimum_payment: null,
  });
  const id = await r.saveTransaction({ ...tx(), account_id: card });
  const statementId = await r.createStatement(card, '2026-10', null);
  await r.saveTransaction({ ...tx(200, '2026-10-02'), account_id: card, refund_of_id: id });
  const s = await r.statement(statementId);
  assert.equal(s.purchases, 1000);
  assert.equal(s.credits, 200);
  assert.equal(s.closing, 800);
  await r.saveTransaction({ ...tx(300, '2026-10-10'), account_id: card, refund_of_id: id });
  const s2 = await r.statement(statementId);
  assert.equal(s2.paid_after, 300);
  assert.equal(s2.remaining, 500);
  assert.deepEqual(await r.integrity(), []);
  n.close();
});
test('refund exports stay signed with their original link and split category details', async () => {
  const { n, r, cats, tx } = await fixture();
  const id = await r.saveTransaction({
    ...tx(),
    splits: [
      { category_id: cats[0].id, amount: 600 },
      { category_id: cats[1].id, amount: 400 },
    ],
  });
  await r.saveTransaction({ ...tx(200), refund_of_id: id });
  const rows = await r.exportTransactions({});
  assert.equal(rows[1].amount, -200);
  assert.equal(rows[1].refund_of_id, id);
  assert.match(rows[0].category, /INR 6.00/);
  assert.equal(expenseGroups(rows, 'monthly')[0].amount, 800);
  const book = XLSX.read(transactionWorkbook(rows), { type: 'array' });
  const monthly = XLSX.utils.sheet_to_json(book.Sheets['Monthly Summary']);
  assert.equal(monthly[0].Expenses, 8);
  assert.equal(monthly[0].Income, 0);
  assert.match(expenseReportHTML(rows, 'monthly', '2026-10-01'), /INR 8.00/);
  n.close();
});
test('savings goals persist add/withdraw history without changing ledger balances', async () => {
  const { n, r } = await fixture();
  const id = await r.saveGoal({
    name: 'Emergency fund',
    target_amount: 100000,
    due_date: '2027-01-01',
  });
  await r.contribute({
    goal_id: id,
    amount: 20000,
    direction: 'add',
    date: '2026-10-01',
    notes: 'First deposit',
  });
  await r.contribute({
    goal_id: id,
    amount: 5000,
    direction: 'withdraw',
    date: '2026-10-02',
    notes: '',
  });
  assert.equal((await r.goal(id)).goal.saved, 15000);
  assert.equal((await r.snapshot()).accounts[0].ledger_balance, 100000);
  await assert.rejects(
    r.contribute({
      goal_id: id,
      amount: 15001,
      direction: 'withdraw',
      date: '2026-10-03',
      notes: '',
    }),
    /balance/
  );
  await assert.rejects(
    r.deleteContribution((await r.goal(id)).contributions.find((c) => c.direction === 'add').id),
    /balance/
  );
  await r.archiveGoal(id, true);
  await assert.rejects(
    r.contribute({ goal_id: id, amount: 1, direction: 'add', date: '2026-10-03', notes: '' }),
    /active/
  );
  await r.initialize();
  assert.equal((await r.goals())[0].saved, 15000);
  assert.deepEqual(await r.integrity(), []);
  n.close();
});
test('MVP v4 backups restore splits, refunds, bills and goal contributions atomically', async () => {
  const a = await fixture(),
    b = await fixture();
  const id = await a.r.saveTransaction({
    ...a.tx(),
    splits: [
      { category_id: a.cats[0].id, amount: 600 },
      { category_id: a.cats[1].id, amount: 400 },
    ],
  });
  await a.r.saveTransaction({ ...a.tx(200), refund_of_id: id });
  const goal = await a.r.saveGoal({ name: 'Travel', target_amount: 100000, due_date: null });
  await a.r.contribute({
    goal_id: goal,
    amount: 1000,
    direction: 'add',
    date: '2026-10-01',
    notes: '',
  });
  await a.r.saveBill({ name: 'Rent', amount: 10000, due_date: '2026-11-01' });
  const text = await a.r.backup(),
    staging = new DatabaseSync(':memory:');
  staging.exec('PRAGMA foreign_keys=ON');
  await new DataRepository(adapter(staging)).validateInDatabase(text);
  staging.close();
  await b.r.replaceBackup(text, async (recovery) =>
    assert.equal(validateBackup(recovery).payload.schemaVersion, 5)
  );
  assert.equal((await b.r.goals())[0].saved, 1000);
  assert.equal((await b.r.bills())[0].name, 'Rent');
  assert.equal((await b.r.report(range)).expense, 800);
  assert.deepEqual(await b.r.integrity(), []);
  a.n.close();
  b.n.close();
});
test('schema 3 and 4 backups upgrade without losing financial records', async () => {
  const a = await fixture();
  await a.r.saveTransaction(a.tx());
  for (const version of [3, 4]) {
    const legacy = JSON.parse(await a.r.backup());
    legacy.payload.schemaVersion = version;
    for (const table of ['expense_splits', 'savings_goals', 'goal_contributions', 'bill_reminders'])
      delete legacy.payload.tables[table];
    for (const tx of legacy.payload.tables.transactions) delete tx.refund_of_id;
    legacy.sha256 = digest(JSON.stringify(legacy.payload));
    const staging = new DatabaseSync(':memory:');
    staging.exec('PRAGMA foreign_keys=ON');
    const validated = await new DataRepository(adapter(staging)).validateInDatabase(
      JSON.stringify(legacy)
    );
    assert.equal(validated.payload.schemaVersion, 5);
    assert.equal(staging.prepare('SELECT count(*) n FROM transactions').get().n, 1);
    staging.close();
  }
  a.n.close();
});
test('schema 4 installation migration preserves IDs, balances and legacy postings', async () => {
  const n = new DatabaseSync(':memory:');
  n.exec(
    'PRAGMA foreign_keys=ON; CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY,applied_at TEXT NOT NULL)'
  );
  for (let i = 0; i < 4; i++) {
    n.exec(migrations[i]);
    n.prepare('INSERT INTO schema_migrations VALUES(?,?)').run(i + 1, 'old');
  }
  n.exec("INSERT INTO accounts VALUES(1,'Cash','cash',5000,'INR','',0,'2026-01-01','2026-01-01')");
  const r = new Repositories(adapter(n));
  await r.initialize();
  assert.equal((await r.snapshot()).accounts[0].ledger_balance, 5000);
  assert.deepEqual(await r.integrity(), []);
  n.close();
});
test('manual and recurring reminders handle month-end schedules, completed occurrences and status changes', async () => {
  const { n, r, bank, cats } = await fixture();
  await r.saveBill({ name: 'Rent', amount: 10000, due_date: '2026-02-01' });
  await r.saveRecurring({
    type: 'expense',
    amount: 500,
    account_id: bank,
    category_id: cats[0].id,
    loan_id: null,
    description: 'Monthly bill',
    start_date: '2026-01-31',
    end_date: null,
    frequency: 'monthly',
  });
  const due = await r.dueReminders('2026-02-01');
  assert.ok(due.some((d) => d.due_date === '2026-02-28'));
  assert.ok(due.some((d) => d.due_date === '2026-03-31'));
  await r.billStatus((await r.bills())[0].id, 'done');
  assert.ok(!(await r.dueReminders('2026-02-01')).some((d) => d.source === 'bill'));
  const scheduled = await r.recurring();
  const feb = scheduled.occurrences.find((o) => o.scheduled_date === '2026-02-28');
  await r.occurrenceAction(feb.id, 'skip');
  assert.ok(
    !(await r.dueReminders('2026-02-01')).some(
      (d) => d.source === 'recurring' && d.due_date === '2026-02-28'
    )
  );
  const rule = n.prepare('SELECT id FROM recurring_rules').get().id;
  await r.recurringStatus(rule, 'paused');
  assert.equal((await r.dueReminders('2026-02-01')).length, 0);
  n.close();
});
test('reminder planning uses local 9 AM, skips past alerts, deduplicates and caps pending notifications', () => {
  const row = (i, date) => ({
    key: `bill:${i}`,
    name: 'Private',
    amount: 100,
    due_date: date,
    source: 'bill',
    source_id: i,
  });
  const now = new Date(2026, 9, 12, 10),
    rows = [row(1, '2026-10-15'), row(2, '2026-10-12')];
  const plan = reminderPlan(rows, 1, now);
  assert.equal(plan.length, 1);
  assert.equal(plan[0].at, new Date(2026, 9, 14, 9).getTime());
  assert.equal(
    reminderPlan([row(1, '2026-10-13')], 3, now)[0].at,
    new Date(2026, 9, 13, 9).getTime()
  );
  assert.equal(reminderPlan([rows[0], rows[0]], 0, now).length, 1);
  assert.equal(
    reminderPlan(
      Array.from({ length: 100 }, (_, i) => row(i, '2026-10-15')),
      1,
      now
    ).length,
    60
  );
  assert.throws(() => reminderPlan(rows, -1, now));
});
test('reminder reconciliation removes stale app alerts and avoids duplicating existing notifications', async () => {
  const cancelled = [],
    added = [],
    port = {
      scheduled: async () => ['other-app', 'settler-bill-old', 'settler-bill-kept'],
      cancel: async (id) => cancelled.push(id),
      schedule: async (row) => added.push(row.identifier),
    };
  await reconcileReminders(
    [
      { identifier: 'settler-bill-kept', at: 1 },
      { identifier: 'settler-bill-new', at: 2 },
    ],
    port
  );
  assert.deepEqual(cancelled, ['settler-bill-old']);
  assert.deepEqual(added, ['settler-bill-new']);
});
async function backend() {
  const pg = new PGlite();
  await pg.exec(
    "create role authenticated;create role anon;create role service_role;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit integer,allowed_mime_types text[]);create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;create function storage.foldername(name text) returns text[] language sql immutable as $$select string_to_array(name,'/')$$;grant usage on schema auth,storage,public to authenticated,anon;grant select,insert on storage.objects to authenticated;"
  );
  for (const file of readdirSync('supabase/migrations').sort())
    await pg.exec(readFileSync('supabase/migrations/' + file, 'utf8'));
  return pg;
}
async function flush(pg, device, owner) {
  for (;;) {
    const op = await device.r.nextOperation(owner);
    if (!op) break;
    const receipt = (
      await pg.query('select public.apply_sync($1::jsonb) result', [JSON.stringify(op)])
    ).rows[0].result;
    if (receipt.status === 'conflict') return receipt;
    await device.r.acknowledge(op, receipt.revision);
  }
  const snap = (await pg.query('select public.cloud_snapshot(0) result')).rows[0].result;
  await device.r.applyRemote(snap.records, snap.revision, owner, false);
  return snap;
}
test('cloud round trips all MVP v4 data and rejects concurrent over-refunds from two devices', async () => {
  const pg = await backend(),
    a = await fixture(),
    b = await fixture(),
    owner = randomUUID();
  try {
    await pg.query('insert into auth.users values($1)', [owner]);
    await pg.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
    await pg.exec('set role authenticated');
    const original = await a.r.saveTransaction({
      ...a.tx(),
      splits: [
        { category_id: a.cats[0].id, amount: 600 },
        { category_id: a.cats[1].id, amount: 400 },
      ],
    });
    const goal = await a.r.saveGoal({ name: 'Trip', target_amount: 50000, due_date: null });
    await a.r.contribute({
      goal_id: goal,
      amount: 1000,
      direction: 'add',
      date: localDate(),
      notes: '',
    });
    await a.r.saveBill({ name: 'Rent', amount: 10000, due_date: '2026-11-01' });
    await a.r.enableSync(owner);
    const remote = await flush(pg, a, owner);
    assert.equal(remote.schema_version, 5);
    await b.r.applyRemote(remote.records, remote.revision, owner, true, async () => {});
    assert.equal((await b.r.goals())[0].saved, 1000);
    assert.equal((await b.r.bills())[0].name, 'Rent');
    assert.deepEqual(await b.r.integrity(), []);
    const oa = (await a.r.snapshot()).transactions.find((t) => !t.refund_of_id),
      ob = (await b.r.snapshot()).transactions.find((t) => !t.refund_of_id);
    assert.equal(oa.id, original);
    await a.r.saveTransaction({ ...a.tx(400), refund_of_id: oa.id });
    await b.r.saveTransaction({
      ...b.tx(400),
      account_id: ob.account_id,
      category_id: ob.category_id,
      refund_of_id: ob.id,
    });
    const first = await flush(pg, a, owner);
    assert.ok(first.records);
    const conflict = await flush(pg, b, owner);
    assert.equal(conflict.status, 'conflict');
    assert.equal(conflict.reason, 'refund_exceeds_purchase');
    assert.equal((await a.r.report(range)).expense, 600);
    assert.deepEqual(await a.r.integrity(), []);
  } finally {
    a.n.close();
    b.n.close();
    await pg.close();
  }
});

test('backup validation rejects duplicated balanced lines and inconsistent split allocations', async () => {
  const { n, r, cats, tx } = await fixture();
  const id = await r.saveTransaction({
    ...tx(),
    splits: [
      { category_id: cats[0].id, amount: 600 },
      { category_id: cats[1].id, amount: 400 },
    ],
  });
  const original = JSON.parse(await r.backup());
  for (const kind of ['lines', 'split']) {
    const b = structuredClone(original);
    if (kind === 'lines') {
      const journal = b.payload.tables.transaction_journals.find(
        (row) => row.transaction_id === id
      ).journal_id;
      let lastId = Math.max(...b.payload.tables.ledger_lines.map((row) => row.id));
      const copies = b.payload.tables.ledger_lines
        .filter((row) => row.journal_id === journal)
        .map((row) => ({ ...row, id: ++lastId }));
      b.payload.tables.ledger_lines.push(...copies);
    } else b.payload.tables.expense_splits[0].amount++;
    b.sha256 = digest(JSON.stringify(b.payload));
    const staging = new DatabaseSync(':memory:');
    staging.exec('PRAGMA foreign_keys=ON');
    await assert.rejects(
      new DataRepository(adapter(staging)).validateInDatabase(JSON.stringify(b)),
      /financial validation/
    );
    staging.close();
  }
  n.close();
});

test('refund edits remain capped after other refunds, and archived purchase categories remain usable', async () => {
  const { n, r, cats, tx, bank } = await fixture();
  const original = await r.saveTransaction(tx());
  await r.archiveCategory(cats[0].id, true);
  await r.archiveAccount(bank, true);
  const a = await r.saveTransaction({ ...tx(400), refund_of_id: original });
  const b = await r.saveTransaction({ ...tx(500), refund_of_id: original });
  await assert.rejects(r.saveTransaction({ ...tx(501), refund_of_id: original }, a), /remaining/);
  await r.saveTransaction({ ...tx(500), refund_of_id: original }, a);
  assert.equal((await r.report(range)).expense, 0);
  await r.deleteTransaction(b);
  assert.equal((await r.report(range)).expense, 500);
  assert.deepEqual(await r.integrity(), []);
  n.close();
});

test('pending legacy sync operations normalize refund fields and retain idempotency receipts', async () => {
  const pg = await backend(),
    a = await fixture(),
    owner = randomUUID();
  try {
    await pg.query('insert into auth.users values($1)', [owner]);
    await pg.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
    await pg.exec('set role authenticated');
    await a.r.saveTransaction(a.tx());
    await a.r.enableSync(owner);
    const op = await a.r.nextOperation(owner);
    op.schema_version = 4;
    for (const change of op.changes)
      if (change.entity === 'transactions') delete change.data.refund_of_id;
    const send = async () =>
      (await pg.query('select public.apply_sync($1::jsonb) result', [JSON.stringify(op)])).rows[0]
        .result;
    const first = await send();
    assert.equal(first.status, 'applied', JSON.stringify(first));
    assert.deepEqual(await send(), first);
    await a.r.acknowledge(op, first.revision);
    const remote = (await pg.query('select public.cloud_snapshot(0) result')).rows[0].result;
    assert.equal(remote.records.find((r) => r.entity === 'transactions').data.refund_of_id, null);
    await a.r.applyRemote(remote.records, remote.revision, owner, false);
    assert.deepEqual(await a.r.integrity(), []);
  } finally {
    a.n.close();
    await pg.close();
  }
});
