const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { Repositories } = require('../.test-build/db/repositories.js');
const { migrations } = require('../.test-build/db/migrations.js');
const { budgetStatus, percentage } = require('../.test-build/utils/budgets.js');
const {
  monthRange,
  calendarDays,
  presetRange,
  fillPeriods,
  monthCalendar,
} = require('../.test-build/utils/periods.js');
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
async function fixture(path = ':memory:') {
  const n = new DatabaseSync(path),
    r = new Repositories(adapter(n));
  await r.initialize();
  await r.saveAccount({
    name: 'Everyday Bank',
    type: 'bank',
    opening_balance: 10000,
    description: '',
  });
  await r.saveAccount({ name: 'Pocket Cash', type: 'cash', opening_balance: 0, description: '' });
  const s = await r.snapshot(),
    bank = s.accounts.find((a) => a.name === 'Everyday Bank').id,
    cash = s.accounts.find((a) => a.name === 'Pocket Cash').id,
    food = s.categories.find((c) => c.name === 'Food & Dining').id,
    grocery = s.categories.find((c) => c.name === 'Groceries').id,
    salary = s.categories.find((c) => c.name === 'Salary').id;
  const entry = (
    type,
    amount,
    date = '2026-10-01',
    category = type === 'income' ? salary : food,
    description = 'Lunch',
    notes = ''
  ) => ({
    type,
    amount,
    date,
    category_id: type === 'transfer' ? null : category,
    account_id: bank,
    destination_account_id: type === 'transfer' ? cash : null,
    description,
    notes,
  });
  return { n, r, bank, cash, food, grocery, salary, entry };
}
const budget = (food, grocery) => ({
  name: 'October plan',
  month: '2026-10',
  total_limit_minor: 10000,
  allocations: [
    { category_id: food, limit_minor: 4000 },
    { category_id: grocery, limit_minor: 3000 },
  ],
});

test('calendar weeks use local dates, Monday alignment and leap-year boundaries', () => {
  const february = monthCalendar('2024-02');
  assert.deepEqual(february[0], [
    null,
    null,
    null,
    '2024-02-01',
    '2024-02-02',
    '2024-02-03',
    '2024-02-04',
  ]);
  assert.equal(february.flat().filter(Boolean).length, 29);
  assert.equal(february.flat().filter(Boolean).at(-1), '2024-02-29');
  assert.equal(monthCalendar('2021-02').length, 4);
  assert.equal(monthCalendar('2026-03').length, 6);
  assert.equal(monthCalendar('2026-03')[0][6], '2026-03-01');
  assert.throws(() => monthCalendar('2026-13'), /valid month/);
});

test('calendar totals cover all pages, exclude transfers from cash flow and update after edits and voids', async () => {
  const { n, r, entry } = await fixture();
  try {
    for (let index = 0; index < 60; index++) {
      await r.saveTransaction(
        entry(
          'expense',
          100 + index,
          index % 2 ? '2026-10-31' : '2026-10-01',
          undefined,
          `Calendar ${index}`
        )
      );
    }
    await r.saveTransaction(entry('income', 9000));
    await r.saveTransaction(entry('transfer', 3000));
    await r.saveTransaction(entry('expense', 800, '2026-09-30'));
    await r.saveTransaction(entry('income', 500, '2026-11-01'));
    const days = await r.transactionCalendar('2026-10');
    assert.equal(days.length, 2);
    assert.equal(
      days.reduce((sum, day) => sum + day.count, 0),
      62
    );
    assert.equal(
      days.reduce((sum, day) => sum + day.expense, 0),
      7770
    );
    assert.equal(
      days.reduce((sum, day) => sum + day.income, 0),
      9000
    );
    assert.equal(days[0].transfers, 1);
    assert.equal(
      (await r.searchTransactions({ start: '2026-10-01', end: '2026-10-31' })).rows.length,
      50
    );
    const saved = (await r.searchTransactions({ query: 'Calendar 0' })).rows[0];
    await r.saveTransaction(
      entry('expense', 250, '2026-11-01', undefined, 'Moved calendar entry'),
      saved.id
    );
    assert.equal(
      (await r.transactionCalendar('2026-10')).reduce((sum, day) => sum + day.expense, 0),
      7670
    );
    await r.deleteTransaction(saved.id);
    assert.equal(
      (await r.transactionCalendar('2026-11')).reduce((sum, day) => sum + day.expense, 0),
      0
    );
  } finally {
    n.close();
  }
});

test('calendar markers share list search, account, category, amount and date filters', async () => {
  const { n, r, entry, bank, cash, food, grocery } = await fixture();
  try {
    await r.saveTransaction(entry('expense', 100, '2026-10-01', food, '100% lunch'));
    await r.saveTransaction(entry('expense', 200, '2026-10-02', grocery, 'Groceries'));
    await r.saveTransaction(entry('income', 9000));
    await r.saveTransaction(entry('transfer', 300));
    for (const filters of [
      { query: '%' },
      { account_id: bank, type: 'expense', min_amount: 150, max_amount: 250 },
      { account_id: cash },
      { category_id: food },
      { start: '2026-10-02', end: '2026-10-31' },
    ]) {
      const list = await r.searchTransactions({
        ...filters,
        start: filters.start ?? '2026-10-01',
        end: filters.end ?? '2026-10-31',
      });
      const days = await r.transactionCalendar('2026-10', filters);
      assert.equal(
        days.reduce((sum, day) => sum + day.count, 0),
        list.count
      );
    }
    assert.deepEqual(await r.transactionCalendar('2026-10', { start: '2026-11-01' }), []);
    assert.throws(() => r.transactionCalendar('2026-10', { start: '2026-02-29' }), /date range/);
    assert.throws(() => r.transactionCalendar('2026-10', { min_amount: -1 }), /amount/);
  } finally {
    n.close();
  }
});
test('budget status below, at, above, zero limits and configurable warning', () => {
  assert.equal(budgetStatus(100, 79).status, 'normal');
  assert.equal(budgetStatus(100, 80).status, 'warning');
  assert.equal(budgetStatus(100, 100).remaining, 0);
  assert.equal(budgetStatus(100, 100).status, 'warning');
  assert.equal(budgetStatus(100, 101).excess, 1);
  assert.equal(budgetStatus(100, 101).bar, 100);
  assert.equal(budgetStatus(0, 20).status, 'unbudgeted');
  assert.equal(budgetStatus(100, 70, 60).status, 'warning');
  assert.equal(percentage(25, 100), 25);
  assert.equal(percentage(0, 0), 0);
});
test('monthly budgets, category progress and mutation recalculation', async () => {
  const { n, r, food, grocery, entry } = await fixture();
  assert.equal((await r.budgetProgress('2026-10')).budget, null);
  const id = await r.saveBudget(budget(food, grocery));
  let p = await r.budgetProgress('2026-10');
  assert.equal(p.spent, 0);
  assert.equal(p.categories.length, 2);
  await r.saveTransaction(entry('expense', 4500));
  await r.saveTransaction(entry('expense', 500, '2026-10-31', grocery));
  await r.saveTransaction(entry('expense', 300, '2026-09-30'));
  await r.saveTransaction(entry('income', 8000));
  await r.saveTransaction(entry('transfer', 1000));
  p = await r.budgetProgress('2026-10');
  assert.equal(p.spent, 5000);
  assert.equal(p.categories.find((c) => c.category_id === food).spent, 4500);
  assert.equal(budgetStatus(4000, 4500).status, 'exceeded');
  assert.equal(p.categories.find((c) => c.category_id === grocery).spent, 500);
  const transaction = (await r.snapshot()).transactions.find((t) => t.amount === 4500);
  await r.saveTransaction({ ...entry('expense', 2000, '2026-10-01', grocery) }, transaction.id);
  p = await r.budgetProgress('2026-10');
  assert.equal(p.categories.find((c) => c.category_id === food).spent, 0);
  assert.equal(p.categories.find((c) => c.category_id === grocery).spent, 2500);
  await r.deleteTransaction(transaction.id);
  assert.equal((await r.budgetProgress('2026-10')).spent, 500);
  await r.saveBudget({ ...budget(food, grocery), name: 'Updated', allocations: [] }, id);
  p = await r.budgetProgress('2026-10');
  assert.equal(p.categories.length, 0);
  assert.equal(p.unbudgeted[0].amount, 500);
  await r.deleteBudget(id);
  assert.equal((await r.budgetProgress('2026-10')).budget, null);
  assert.equal(n.prepare('SELECT count(*) n FROM budget_categories').get().n, 0);
  assert.equal((await r.snapshot()).transactions.length, 4);
  n.close();
});
test('duplicate budgets, duplicate allocations, invalid amounts and expense-only references', async () => {
  const { n, r, food, grocery, salary } = await fixture();
  const b = budget(food, grocery);
  const id = await r.saveBudget(b);
  await assert.rejects(r.saveBudget(b), /already exists/);
  await assert.rejects(
    r.saveBudget({
      ...b,
      month: '2026-11',
      allocations: [{ category_id: salary, limit_minor: 100 }],
    }),
    /expense/
  );
  await assert.rejects(
    r.saveBudget({
      ...b,
      month: '2026-11',
      allocations: [{ category_id: 99999, limit_minor: 100 }],
    })
  );
  await assert.rejects(r.saveBudget({ ...b, total_limit_minor: 0 }, id));
  await assert.rejects(
    r.saveBudget({ ...b, allocations: [b.allocations[0], b.allocations[0]] }, id),
    /only one/
  );
  await assert.rejects(r.saveBudget({ ...b, total_limit_minor: 1000 }, id), /within/);
  assert.equal((await r.getBudget(id)).allocations.length, 2);
  await r.archiveCategory(food, true);
  await r.saveBudget(b, id);
  await assert.rejects(r.saveBudget({ ...b, month: '2026-11' }), /active/);
  n.close();
});
test('report aggregates, transfer exclusion, percentages, daily averages and zero months', async () => {
  const { n, r, entry, food, grocery } = await fixture();
  await r.saveTransaction(entry('income', 12000, '2026-09-30'));
  await r.saveTransaction(entry('expense', 3000, '2026-10-01', food));
  await r.saveTransaction(entry('expense', 1000, '2026-10-31', grocery));
  await r.saveTransaction(entry('transfer', 700, '2026-10-01'));
  await r.saveTransaction(entry('income', 8000, '2026-11-01'));
  let report = await r.report({ start: '2026-10-01', end: '2026-10-31' });
  assert.equal(report.expense, 4000);
  assert.equal(report.income, 0);
  assert.equal(report.net, -4000);
  assert.equal(report.count, 3);
  assert.equal(report.days, 31);
  assert.equal(report.dailyAverage, 4000 / 31);
  assert.equal(
    report.categories.filter((c) => c.type === 'expense').reduce((s, c) => s + c.amount, 0),
    report.expense
  );
  assert.equal(report.periods.length, 31);
  assert.equal(report.highestDays[0].date, '2026-10-01');
  assert.equal(report.periods[1].expense, 0);
  report = await r.report({ start: '2026-09-01', end: '2026-12-31' });
  assert.equal(report.income, 20000);
  assert.equal(report.periods.length, 4);
  assert.equal(report.periods[3].expense, 0);
  assert.equal(report.periods[0].income, 12000);
  assert.equal(report.categoryMonths.length, 2);
  await r.saveBudget(budget(food, grocery));
  report = await r.report({ start: '2026-10-01', end: '2026-10-01' });
  assert.equal(report.budgetComparisons.find((c) => c.category_id === food).spent, 3000);
  assert.equal(report.budgetComparisons.find((c) => c.category_id === grocery).spent, 0);
  const empty = await r.report({ start: '2025-01-01', end: '2025-01-31' });
  assert.equal(empty.count, 0);
  assert.equal(empty.categories.length, 0);
  assert.equal(empty.dailyAverage, 0);
  assert.equal(empty.highestDays.length, 0);
  n.close();
});
test('leap years, year transitions, inclusive custom ranges and report presets', async () => {
  assert.equal(monthRange('2024-02').end, '2024-02-29');
  assert.equal(monthRange('2025-02').end, '2025-02-28');
  assert.equal(calendarDays({ start: '2024-02-28', end: '2024-03-01' }), 3);
  assert.deepEqual(presetRange('3-months', new Date(2026, 0, 15)), {
    start: '2025-11-01',
    end: '2026-01-31',
  });
  assert.deepEqual(presetRange('previous-year', new Date(2026, 0, 15)), {
    start: '2025-01-01',
    end: '2025-12-31',
  });
  assert.equal(fillPeriods({ start: '2025-12-01', end: '2026-02-28' }, [], false).length, 3);
  const { n, r, entry } = await fixture();
  await r.saveTransaction(entry('expense', 100, '2024-02-29'));
  await r.saveTransaction(entry('expense', 200, '2024-03-01'));
  const report = await r.report({ start: '2024-02-29', end: '2024-02-29' });
  assert.equal(report.expense, 100);
  assert.equal(report.dailyAverage, 100);
  await assert.rejects(async () => r.report({ start: '2024-02-30', end: '2024-03-01' }));
  n.close();
});
test('search descriptions, notes, category and both account names with literal special characters', async () => {
  const { n, r, entry, grocery } = await fixture();
  await r.saveTransaction(
    entry('expense', 100, '2026-10-01', grocery, '100%_coffee', "Trip's notes")
  );
  await r.saveTransaction(entry('transfer', 500, '2026-10-02', null, 'Move cash'));
  for (const query of ['coffee', 'TRIP', 'groCERies', 'everyday bank', '100%_', '%_', "Trip's"]) {
    assert.ok((await r.searchTransactions({ query })).count >= 1, query);
  }
  assert.equal((await r.searchTransactions({ query: 'Pocket Cash' })).count, 1);
  assert.equal((await r.searchTransactions({ query: "' OR 1=1 --" })).count, 0);
  assert.equal((await r.searchTransactions({ query: 'missing' })).count, 0);
  n.close();
});
test('combined filters, amount bounds, stable sorting, pagination and clearing', async () => {
  const { n, r, entry, bank, food, grocery } = await fixture();
  await r.saveTransaction(entry('expense', 200, '2026-10-01', food, 'First'));
  await r.saveTransaction(entry('expense', 200, '2026-10-01', food, 'Second'));
  await r.saveTransaction(entry('expense', 300, '2026-10-02', grocery, 'Third'));
  await r.saveTransaction(entry('income', 400, '2026-09-30'));
  assert.equal(
    (
      await r.searchTransactions({
        type: 'expense',
        account_id: bank,
        category_id: food,
        start: '2026-10-01',
        end: '2026-10-01',
        min_amount: 200,
        max_amount: 200,
      })
    ).count,
    2
  );
  assert.equal((await r.searchTransactions({ min_amount: 201, max_amount: 350 })).count, 1);
  assert.equal((await r.searchTransactions({ sort: 'newest' })).rows[0].description, 'Third');
  assert.equal((await r.searchTransactions({ sort: 'oldest' })).rows[0].type, 'income');
  assert.equal((await r.searchTransactions({ sort: 'highest' })).rows[0].amount, 400);
  const low = (await r.searchTransactions({ sort: 'lowest' })).rows;
  assert.equal(low[0].description, 'Second');
  assert.equal(low[1].description, 'First');
  const page = await r.searchTransactions({}, 1, 2);
  assert.equal(page.count, 4);
  assert.equal(page.rows.length, 2);
  assert.equal((await r.searchTransactions({})).count, 4);
  await assert.rejects(async () => r.searchTransactions({ min_amount: 500, max_amount: 100 }));
  n.close();
});
test('upgrade Phase 1 file preserves data and budgets survive a restart', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pocketbook-phase2-')),
    path = join(dir, 'finance.db');
  let n = new DatabaseSync(path);
  n.exec(
    'PRAGMA foreign_keys=ON;CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY,applied_at TEXT NOT NULL);'
  );
  n.exec(migrations[0]);
  n.prepare('INSERT INTO schema_migrations VALUES (1,?)').run('2026-01-01');
  n.prepare(
    'INSERT INTO accounts(name,type,opening_balance,created_at,updated_at) VALUES (?,?,?,?,?)'
  ).run('Original Bank', 'bank', 12345, 'now', 'now');
  n.prepare(
    'INSERT INTO categories(name,type,icon,color,created_at,updated_at) VALUES (?,?,?,?,?,?)'
  ).run('Original expense', 'expense', 'tag', '#35A78C', 'now', 'now');
  n.prepare(
    'INSERT INTO transactions(type,amount,account_id,category_id,description,date,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)'
  ).run('expense', 345, 1, 1, 'Historical purchase', '2026-10-01', 'now', 'now');
  n.prepare("INSERT INTO app_settings VALUES ('theme','dark')").run();
  let r = new Repositories(adapter(n));
  await r.initialize();
  assert.equal((await r.snapshot()).transactions[0].description, 'Historical purchase');
  assert.equal((await r.snapshot()).settings.theme, 'dark');
  const id = await r.saveBudget({
    name: 'Preserved plan',
    month: '2026-10',
    total_limit_minor: 1000,
    allocations: [{ category_id: 1, limit_minor: 500 }],
  });
  n.close();
  n = new DatabaseSync(path);
  r = new Repositories(adapter(n));
  await r.initialize();
  assert.equal((await r.getBudget(id)).budget.name, 'Preserved plan');
  assert.equal((await r.budgetProgress('2026-10')).spent, 345);
  assert.equal(n.prepare('SELECT count(*) n FROM schema_migrations').get().n, 5);
  assert.equal((await r.snapshot()).accounts[0].opening_balance, 12345);
  n.close();
  rmSync(dir, { recursive: true });
});

test('budget updates roll back on a failed allocation write', async () => {
  const { n, r, food, grocery } = await fixture();
  const input = budget(food, grocery);
  const id = await r.saveBudget(input);
  const original = r.db.runAsync;
  r.db.runAsync = async (sql, ...params) => {
    if (sql.startsWith('INSERT INTO budget_categories')) throw new Error('Simulated write failure');
    return original(sql, ...params);
  };
  await assert.rejects(
    r.saveBudget({ ...input, name: 'Should roll back', total_limit_minor: 15000 }, id),
    /Simulated/
  );
  r.db.runAsync = original;
  const saved = await r.getBudget(id);
  assert.equal(saved.budget.name, input.name);
  assert.equal(saved.budget.total_limit_minor, 10000);
  assert.equal(saved.allocations.length, 2);
  n.close();
});

test('budget database constraints enforce uniqueness and expense categories', async () => {
  const { n, r, food, grocery, salary } = await fixture();
  const id = await r.saveBudget(budget(food, grocery));
  assert.throws(
    () =>
      n
        .prepare(
          'INSERT INTO budget_categories(budget_id,category_id,limit_minor,created_at,updated_at) VALUES (?,?,?,?,?)'
        )
        .run(id, salary, 100, 'now', 'now'),
    /expense/
  );
  assert.throws(
    () =>
      n
        .prepare(
          'INSERT INTO budget_categories(budget_id,category_id,limit_minor,created_at,updated_at) VALUES (?,?,?,?,?)'
        )
        .run(id, 99999, 100, 'now', 'now'),
    /FOREIGN KEY/
  );
  assert.throws(
    () =>
      n
        .prepare(
          'INSERT INTO budget_categories(budget_id,category_id,limit_minor,created_at,updated_at) VALUES (?,?,?,?,?)'
        )
        .run(id, food, 100, 'now', 'now'),
    /UNIQUE/
  );
  assert.throws(
    () => n.prepare("UPDATE categories SET type='income' WHERE id=?").run(food),
    /budget/
  );
  const b = (await r.getBudget(id)).budget;
  assert.throws(
    () =>
      n
        .prepare(
          'INSERT INTO budgets(name,period_start,period_end,total_limit_minor,created_at,updated_at) VALUES (?,?,?,?,?,?)'
        )
        .run('Duplicate', b.period_start, b.period_end, 100, 'now', 'now'),
    /UNIQUE/
  );
  n.close();
});

test('literal backslash search and category percentages retain accurate totals', async () => {
  const { n, r, entry, food, grocery } = await fixture();
  await r.saveTransaction(entry('expense', 100, '2026-10-01', food, 'Receipt C:\\food\\'));
  await r.saveTransaction(entry('expense', 200, '2026-10-02', grocery, 'Other receipt'));
  assert.equal((await r.searchTransactions({ query: 'C:\\food\\' })).count, 1);
  const report = await r.report({ start: '2026-10-01', end: '2026-10-31' });
  const percentages = report.categories.map((c) => percentage(c.amount, report.expense));
  assert.ok(Math.abs(percentages.reduce((s, p) => s + p, 0) - 100) < 1e-10);
  assert.equal(
    report.categories.reduce((s, c) => s + c.amount, 0),
    report.expense
  );
  n.close();
});
