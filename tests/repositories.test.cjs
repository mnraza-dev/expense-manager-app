const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { Repositories } = require('../.test-build/db/repositories.js');
const {
  balance,
  summary,
  minor,
  localDate,
  validDate,
} = require('../.test-build/utils/finance.js');
function adapter(native) {
  return {
    execAsync: async (sql) => {
      native.exec(sql);
    },
    runAsync: async (sql, ...params) => native.prepare(sql).run(...params),
    getAllAsync: async (sql, ...params) => native.prepare(sql).all(...params),
    getFirstAsync: async (sql, ...params) => native.prepare(sql).get(...params) ?? null,
    withTransactionAsync: async (task) => {
      native.exec('BEGIN');
      try {
        await task();
        native.exec('COMMIT');
      } catch (e) {
        native.exec('ROLLBACK');
        throw e;
      }
    },
  };
}
async function setup(path = ':memory:') {
  const native = new DatabaseSync(path);
  const repository = new Repositories(adapter(native));
  await repository.initialize();
  return { native, repository };
}
const account = (name, opening_balance = 0) => ({
  name,
  type: 'bank',
  opening_balance,
  description: '',
});
function entry(s, type, amount, account_id, destination_account_id = null) {
  return {
    type,
    amount,
    account_id,
    destination_account_id,
    category_id: type === 'transfer' ? null : s.categories.find((c) => c.type === type).id,
    description: 'Test entry',
    date: '2026-10-01',
    notes: '',
  };
}
test('money precision, limits and local calendar dates', () => {
  assert.equal(minor('12500.01'), 1250001);
  assert.equal(minor('-1.20', true), -120);
  for (const v of ['1.001', 'NaN', 'Infinity', '1e5', '10000000001', '-2'])
    assert.throws(() => minor(v));
  assert.equal(localDate(new Date(2026, 9, 1, 0, 1)), '2026-10-01');
  assert.equal(validDate('2026-02-29'), false);
  assert.equal(validDate('2024-02-29'), true);
});
test('empty database, migrations and idempotent seeding', async () => {
  const { native, repository: r } = await setup();
  let s = await r.snapshot();
  assert.equal(s.accounts.length, 0);
  assert.equal(s.transactions.length, 0);
  assert.equal(s.categories.length, 18);
  assert.deepEqual(summary([], '2026-10'), { income: 0, expense: 0, net: 0, count: 0, rows: [] });
  await r.initialize();
  assert.equal((await r.snapshot()).categories.length, 18);
  assert.equal(native.prepare('SELECT COUNT(*) n FROM schema_migrations').get().n, 5);
  assert.equal(native.prepare('PRAGMA foreign_keys').get().foreign_keys, 1);
  native.close();
});
test('account create/edit, income, expense, transfers, transaction edits and deletes', async () => {
  const { native, repository: r } = await setup();
  await r.saveAccount(account('Bank', 10000));
  await r.saveAccount(account('Cash', 2000));
  let s = await r.snapshot();
  const a = s.accounts.find((a) => a.name === 'Bank').id,
    b = s.accounts.find((a) => a.name === 'Cash').id;
  await r.saveTransaction(entry(s, 'income', 5000, a));
  await r.saveTransaction(entry(s, 'expense', 1200, a));
  await r.saveTransaction(entry(s, 'transfer', 3000, a, b));
  s = await r.snapshot();
  assert.equal(
    balance(
      s.accounts.find((x) => x.id === a),
      s.transactions
    ),
    10800
  );
  assert.equal(
    balance(
      s.accounts.find((x) => x.id === b),
      s.transactions
    ),
    5000
  );
  assert.equal(summary(s.transactions, '2026-10').income, 5000);
  assert.equal(summary(s.transactions, '2026-10').expense, 1200);
  assert.equal(summary(s.transactions, '2026-10').net, 3800);
  const transfer = s.transactions.find((t) => t.type === 'transfer');
  await r.saveTransaction({ ...entry(s, 'income', 900, b), date: '2026-09-30' }, transfer.id);
  s = await r.snapshot();
  assert.equal(
    balance(
      s.accounts.find((x) => x.id === a),
      s.transactions
    ),
    13800
  );
  assert.equal(
    balance(
      s.accounts.find((x) => x.id === b),
      s.transactions
    ),
    2900
  );
  assert.equal(summary(s.transactions, '2026-10').count, 2);
  assert.equal(summary(s.transactions, '2026-09').income, 900);
  await r.saveAccount(account('Renamed', 15000), a);
  s = await r.snapshot();
  assert.equal(
    balance(
      s.accounts.find((x) => x.id === a),
      s.transactions
    ),
    18800
  );
  const expense = s.transactions.find((t) => t.type === 'expense');
  await r.deleteTransaction(expense.id);
  s = await r.snapshot();
  assert.equal(
    balance(
      s.accounts.find((x) => x.id === a),
      s.transactions
    ),
    20000
  );
  await assert.rejects(r.deleteAccount(a), /Archive/);
  await r.archiveAccount(a, true);
  assert.equal((await r.snapshot()).accounts.find((x) => x.id === a).archived, 1);
  await r.archiveAccount(a, false);
  await r.saveAccount(account('Disposable'));
  s = await r.snapshot();
  await r.deleteAccount(s.accounts.find((x) => x.name === 'Disposable').id);
  assert.equal((await r.snapshot()).accounts.length, 2);
  native.close();
});
test('validation rejects wrong categories, same-account transfers, invalid references and dates', async () => {
  const { native, repository: r } = await setup();
  await r.saveAccount(account('Bank'));
  let s = await r.snapshot();
  const a = s.accounts[0].id;
  const expense = entry(s, 'expense', 100, a);
  await assert.rejects(
    r.saveTransaction({ ...expense, category_id: s.categories.find((c) => c.type === 'income').id })
  );
  await assert.rejects(r.saveTransaction(entry(s, 'transfer', 100, a, a)));
  await assert.rejects(r.saveTransaction({ ...expense, amount: 0 }));
  await assert.rejects(r.saveTransaction({ ...expense, account_id: 999 }));
  await assert.rejects(r.saveTransaction({ ...expense, date: '2026-02-31' }));
  assert.equal((await r.snapshot()).transactions.length, 0);
  await r.saveTransaction(expense);
  await r.archiveCategory(expense.category_id, true);
  await assert.rejects(r.saveTransaction(expense));
  s = await r.snapshot();
  await r.saveTransaction({ ...expense, amount: 200 }, s.transactions[0].id);
  assert.equal((await r.snapshot()).transactions[0].amount, 200);
  await r.saveCategory({ name: 'Custom', type: 'expense', icon: 'tag', color: '#35A78C' });
  s = await r.snapshot();
  const custom = s.categories.find((c) => c.name === 'Custom');
  await r.saveCategory({ ...custom, name: 'Updated' }, custom.id);
  assert.ok((await r.snapshot()).categories.some((c) => c.name === 'Updated'));
  native.close();
});
test('file-backed restart persistence and migration re-run preserve records', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pocketbook-'));
  const path = join(dir, 'ledger.db');
  let { native, repository: r } = await setup(path);
  await r.saveAccount(account('Persistent', 12345));
  let s = await r.snapshot();
  await r.saveTransaction(entry(s, 'expense', 345, s.accounts[0].id));
  await r.saveCategory({ ...s.categories[0], name: 'Renamed default' }, s.categories[0].id);
  await r.setting('theme', 'dark');
  native.close();
  ({ native, repository: r } = await setup(path));
  s = await r.snapshot();
  assert.equal(s.accounts[0].name, 'Persistent');
  assert.equal(s.transactions.length, 1);
  assert.equal(balance(s.accounts[0], s.transactions), 12000);
  assert.equal(s.settings.theme, 'dark');
  assert.ok(s.categories.some((c) => c.name === 'Renamed default'));
  assert.equal(s.categories.length, 18);
  native.close();
  rmSync(dir, { recursive: true });
});

test('failed migration rolls back and can be retried safely', async () => {
  const native = new DatabaseSync(':memory:');
  const db = adapter(native);
  const original = db.execAsync;
  let fail = true;
  db.execAsync = async (sql) => {
    if (fail && sql.includes('CREATE TABLE accounts')) {
      native.exec('CREATE TABLE interrupted(value TEXT)');
      throw new Error('Simulated migration failure');
    }
    await original(sql);
  };
  const r = new Repositories(db);
  await assert.rejects(r.initialize(), /Simulated/);
  assert.equal(
    native.prepare("SELECT count(*) n FROM sqlite_master WHERE name='interrupted'").get().n,
    0
  );
  assert.equal(native.prepare('SELECT count(*) n FROM schema_migrations').get().n, 0);
  fail = false;
  await r.initialize();
  assert.equal((await r.snapshot()).categories.length, 18);
  native.close();
});

test('database constraints preserve foreign keys and transaction shape', async () => {
  const { native, repository: r } = await setup();
  await r.saveAccount(account('Bank'));
  const s = await r.snapshot(),
    a = s.accounts[0].id;
  const expense = entry(s, 'expense', 100, a);
  await r.saveTransaction(expense);
  assert.throws(() => native.prepare('DELETE FROM accounts WHERE id=?').run(a), /FOREIGN KEY/);
  assert.throws(
    () => native.prepare("UPDATE categories SET type='income' WHERE id=?").run(expense.category_id),
    /historical/
  );
  assert.throws(() => native.prepare('UPDATE transactions SET amount=1.5').run(), /CHECK/);
  assert.throws(() => native.prepare("UPDATE transactions SET type='transfer'").run(), /CHECK/);
  assert.equal((await r.snapshot()).transactions[0].amount, 100);
  native.close();
});
