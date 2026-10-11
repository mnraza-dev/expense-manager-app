const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { Repositories } = require('../.test-build/db/repositories.js');
const { migrations } = require('../.test-build/db/migrations.js');
const {
  scheduledDate,
  statementPeriod,
  loanForecast,
  interestMinor,
} = require('../.test-build/utils/schedules.js');
const { localDate } = require('../.test-build/utils/finance.js');
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
  await r.saveAccount({ name: 'Bank', type: 'bank', opening_balance: 100000, description: '' });
  await r.saveAccount({ name: 'Cash', type: 'cash', opening_balance: 0, description: '' });
  const s = await r.snapshot(),
    bank = s.accounts.find((a) => a.name === 'Bank').id,
    cash = s.accounts.find((a) => a.name === 'Cash').id,
    expense = s.categories.find((c) => c.type === 'expense').id,
    income = s.categories.find((c) => c.type === 'income').id;
  const transaction = (type, amount, source = bank, destination = null, date = localDate()) => ({
    type,
    amount,
    account_id: source,
    destination_account_id: destination,
    category_id: type === 'transfer' ? null : type === 'income' ? income : expense,
    description: 'Test financial event',
    date,
    notes: '',
  });
  return { n, r, bank, cash, expense, income, transaction };
}
function balanced(n) {
  assert.equal(
    n
      .prepare(
        "SELECT count(*) n FROM (SELECT j.id FROM ledger_journals j JOIN ledger_lines l ON l.journal_id=j.id WHERE j.status='posted' GROUP BY j.id HAVING sum(l.debit)<>sum(l.credit))"
      )
      .get().n,
    0
  );
}
test('legacy conversion reconciles openings, income, expense, transfers and preserves IDs', async () => {
  const n = new DatabaseSync(':memory:');
  n.exec('CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY,applied_at TEXT NOT NULL);');
  n.exec(migrations[0]);
  n.exec(migrations[1]);
  n.prepare('INSERT INTO schema_migrations VALUES (?,?)').run(1, 'old');
  n.prepare('INSERT INTO schema_migrations VALUES (?,?)').run(2, 'old');
  for (const [name, opening] of [
    ['Bank', 100000],
    ['Cash', 5000],
  ])
    n.prepare(
      'INSERT INTO accounts(name,type,opening_balance,created_at,updated_at) VALUES (?,?,?,?,?)'
    ).run(name, 'bank', opening, '2026-01-01', 'old');
  for (const type of ['expense', 'income'])
    n.prepare(
      'INSERT INTO categories(name,type,icon,color,created_at,updated_at) VALUES (?,?,?,?,?,?)'
    ).run(type, type, 'tag', '#35A78C', 'old', 'old');
  for (const [type, amount, dest, cat] of [
    ['income', 50000, null, 2],
    ['expense', 10000, null, 1],
    ['transfer', 20000, 2, null],
  ])
    n.prepare(
      'INSERT INTO transactions(type,amount,account_id,destination_account_id,category_id,description,date,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)'
    ).run(type, amount, 1, dest, cat, type, '2026-02-01', 'old', 'old');
  const failing = adapter(n);
  const run = failing.runAsync;
  failing.runAsync = async (sql, ...args) => {
    if (sql.includes('INSERT INTO ledger_lines')) throw new Error('conversion fault');
    return run(sql, ...args);
  };
  await assert.rejects(new Repositories(failing).initialize(), /conversion fault/);
  assert.equal(n.prepare('SELECT count(*) n FROM schema_migrations').get().n, 2);
  assert.equal(n.prepare('SELECT count(*) n FROM transactions').get().n, 3);
  assert.equal(
    n.prepare("SELECT count(*) n FROM sqlite_master WHERE name='ledger_journals'").get().n,
    0
  );
  const r = new Repositories(adapter(n));
  await r.initialize();
  let s = await r.snapshot();
  assert.equal(s.accounts.find((a) => a.id === 1).ledger_balance, 120000);
  assert.equal(s.accounts.find((a) => a.id === 2).ledger_balance, 25000);
  assert.deepEqual(
    s.transactions.map((t) => t.id),
    [3, 2, 1]
  );
  assert.equal(n.prepare('SELECT count(*) n FROM transaction_journals').get().n, 3);
  const count = n.prepare('SELECT count(*) n FROM ledger_journals').get().n;
  await r.initialize();
  assert.equal(n.prepare('SELECT count(*) n FROM ledger_journals').get().n, count);
  balanced(n);
  const report = await r.report({ start: '2026-02-01', end: '2026-02-28' });
  assert.equal(report.income, 50000);
  assert.equal(report.expense, 10000);
  assert.equal((await r.netWorth('2025-12-31')).incomplete, true);
  n.close();
});
test('journal balance, duplicate prevention, immutable history and currency guards', async () => {
  const { n, r, bank, expense } = await fixture();
  const a = n.prepare('SELECT id FROM ledger_accounts WHERE account_id=?').get(bank).id;
  await r.saveTransaction({
    type: 'expense',
    amount: 500,
    account_id: bank,
    destination_account_id: null,
    category_id: expense,
    description: 'Coffee',
    date: localDate(),
    notes: '',
  });
  const cat = n.prepare('SELECT id FROM ledger_accounts WHERE category_id=?').get(expense).id;
  const input = {
    date: localDate(),
    description: 'Adjustment',
    key: 'manual-test',
    kind: 'adjustment',
    lines: [
      { ledger_account_id: a, debit: 100, credit: 0, currency: 'INR' },
      { ledger_account_id: cat, debit: 0, credit: 100, currency: 'INR' },
    ],
  };
  await assert.rejects(
    r.postJournal({ ...input, lines: [input.lines[0], { ...input.lines[1], credit: 99 }] }),
    /balance/
  );
  await assert.rejects(
    r.postJournal({ ...input, lines: input.lines.map((l) => ({ ...l, currency: 'USD' })) }),
    /Currency/
  );
  const id = await r.postJournal(input);
  await assert.rejects(r.postJournal(input), /already/);
  assert.throws(
    () => n.prepare("UPDATE ledger_journals SET description='Changed' WHERE id=?").run(id),
    /immutable/
  );
  assert.throws(
    () => n.prepare('UPDATE ledger_lines SET debit=20 WHERE journal_id=?').run(id),
    /immutable/
  );
  assert.throws(() => n.prepare('DELETE FROM ledger_journals WHERE id=?').run(id), /immutable/);
  balanced(n);
  n.close();
});
test('transaction correction and void create balanced reversals with audit payloads', async () => {
  const { n, r, bank, transaction } = await fixture();
  await r.saveTransaction(transaction('expense', 500));
  let s = await r.snapshot();
  const id = s.transactions[0].id;
  await r.saveTransaction({ ...transaction('income', 1000), description: 'Corrected' }, id);
  assert.equal((await r.snapshot()).accounts.find((a) => a.id === bank).ledger_balance, 101000);
  assert.equal(
    n.prepare('SELECT count(*) n FROM transaction_journals WHERE transaction_id=?').get(id).n,
    2
  );
  assert.equal(
    n.prepare("SELECT count(*) n FROM ledger_journals WHERE kind='reversal'").get().n,
    1
  );
  await r.deleteTransaction(id);
  assert.equal((await r.snapshot()).transactions.length, 0);
  assert.equal((await r.snapshot()).accounts.find((a) => a.id === bank).ledger_balance, 100000);
  assert.equal(n.prepare('SELECT status FROM transactions WHERE id=?').get(id).status, 'void');
  await assert.rejects(r.deleteTransaction(id));
  balanced(n);
  n.close();
});
test('credit card purchases, interest, payment and statement reconciliation', async () => {
  const { n, r, bank, transaction } = await fixture();
  const card = await r.saveCard({
    name: 'Everyday card',
    nickname: 'Personal',
    credit_limit: 50000,
    closing_day: 31,
    due_day: 10,
    payment_account_id: bank,
    minimum_payment: null,
    opening_balance: 0,
  });
  await r.saveTransaction(transaction('expense', 10000, card, null, '2026-02-10'));
  await r.saveTransaction({
    ...transaction('expense', 1000, card, null, '2026-02-20'),
    component: 'interest',
  });
  await r.saveTransaction(transaction('transfer', 3000, bank, card, '2026-02-25'));
  const current = await r.cardDetails(card);
  assert.equal(current.outstanding, 8000);
  const statementId = await r.createStatement(card, '2026-02', null);
  const s = await r.statement(statementId);
  assert.equal(s.period_end, '2026-02-28');
  assert.equal(s.due_date, '2026-03-10');
  assert.equal(s.purchases, 10000);
  assert.equal(s.interest, 1000);
  assert.equal(s.payments, 3000);
  assert.equal(s.closing, 8000);
  assert.equal(s.minimum_payment, null);
  const report = await r.report({ start: '2026-02-01', end: '2026-02-28' });
  assert.equal(report.expense, 11000);
  assert.equal(report.income, 0);
  balanced(n);
  n.close();
});
test('calendar clamping retains original anchors and statement due dates', () => {
  assert.equal(scheduledDate('2024-01-31', 'monthly', 1), '2024-02-29');
  assert.equal(scheduledDate('2024-01-31', 'monthly', 2), '2024-03-31');
  assert.equal(scheduledDate('2025-01-30', 'monthly', 1), '2025-02-28');
  assert.equal(scheduledDate('2025-01-29', 'monthly', 2), '2025-03-29');
  assert.equal(scheduledDate('2024-02-29', 'yearly', 1), '2025-02-28');
  assert.equal(scheduledDate('2024-02-29', 'yearly', 4), '2028-02-29');
  assert.equal(scheduledDate('2026-12-30', 'weekly', 1), '2027-01-06');
  assert.equal(statementPeriod('2024-02', 31, 31).due, '2024-03-31');
});
test('missed recurring schedules are pending, idempotent, paused and skippable', async () => {
  const { n, r, bank, expense } = await fixture();
  await r.saveRecurring({
    type: 'expense',
    amount: 100,
    account_id: bank,
    category_id: expense,
    loan_id: null,
    description: 'Monthly rent',
    start_date: '2026-01-31',
    end_date: null,
    frequency: 'monthly',
  });
  let recurring = await r.recurring();
  assert.equal((await r.snapshot()).transactions.length, 0);
  const count = recurring.occurrences.length;
  await r.recurring();
  assert.equal((await r.recurring()).occurrences.length, count);
  const due = recurring.occurrences.find((o) => o.scheduled_date <= localDate());
  await r.occurrenceAction(due.id, 'confirm');
  await assert.rejects(r.occurrenceAction(due.id, 'confirm'), /already/);
  assert.equal((await r.snapshot()).transactions.length, 1);
  await r.recurringStatus(recurring.rules[0].id, 'paused');
  const next = recurring.occurrences.find((o) => o.id !== due.id);
  await assert.rejects(r.occurrenceAction(next.id, 'confirm'), /Resume/);
  await r.recurringStatus(recurring.rules[0].id, 'enabled');
  await r.occurrenceAction(next.id, 'skip');
  await r.recurringStatus(recurring.rules[0].id, 'cancelled');
  assert.equal((await r.recurring()).rules[0].status, 'cancelled');
  balanced(n);
  n.close();
});
test('loan interest arithmetic uses explicit equal-principal flat/reducing methods', () => {
  assert.equal(interestMinor(100000, 1200, 1), 1000);
  const reducing = loanForecast({
    principal: 100000,
    originalPrincipal: 100000,
    rateBps: 1200,
    method: 'reducing',
    frequency: 'monthly',
    periods: 2,
    start: '2026-01-31',
  });
  assert.deepEqual(
    reducing.map((p) => p.principal),
    [50000, 50000]
  );
  assert.deepEqual(
    reducing.map((p) => p.interest),
    [1000, 500]
  );
  assert.equal(reducing[0].due_date, '2026-02-28');
  assert.equal(reducing[1].due_date, '2026-03-31');
  const flat = loanForecast({
    principal: 100000,
    originalPrincipal: 100000,
    rateBps: 1200,
    method: 'flat',
    frequency: 'monthly',
    periods: 2,
    start: '2026-01-01',
  });
  assert.deepEqual(
    flat.map((p) => p.interest),
    [1000, 1000]
  );
});
test('borrowed and lent principal, extra repayments, reversal and net worth reconcile', async () => {
  const { n, r, bank, expense, income } = await fixture();
  const loan = await r.createLoan({
    name: 'Borrowed loan',
    direction: 'borrowed',
    label: 'personal',
    principal: 60000,
    start_date: '2026-01-01',
    annual_rate_bps: 1200,
    interest_method: 'reducing',
    frequency: 'monthly',
    term_months: 6,
    payment_account_id: bank,
    counterparty: 'Lender',
    category_id: expense,
    origination_fees: 0,
  });
  assert.equal((await r.loanDetail(loan)).outstanding, 60000);
  let net = await r.netWorth('2026-01-01');
  assert.equal(net.groups[0].net, 0); // Bank opening is explicitly today, outside this historical date.
  const payment = await r.recordLoanPayment(loan, {
    date: '2026-02-01',
    principal: 15000,
    interest: 600,
    fees: 100,
    account_id: bank,
  });
  let detail = await r.loanDetail(loan);
  assert.equal(detail.outstanding, 45000);
  assert.equal(detail.interest_paid, 600);
  assert.equal(detail.fees_paid, 100);
  const report = await r.report({ start: '2026-01-01', end: '2026-02-28' });
  assert.equal(report.expense, 700);
  assert.equal(report.income, 0);
  await assert.rejects(
    r.recordLoanPayment(loan, {
      date: '2026-02-02',
      principal: 50000,
      interest: 0,
      fees: 0,
      account_id: bank,
    }),
    /exceeds/
  );
  await r.recalculateLoan(loan, '2026-02-02', 3);
  detail = await r.loanDetail(loan);
  assert.equal(
    detail.schedule.reduce((s, p) => s + p.principal, 0),
    45000
  );
  assert.equal(detail.needs_recalculation, false);
  await r.reverseLoanPayment(payment);
  assert.equal((await r.loanDetail(loan)).outstanding, 60000);
  const lent = await r.createLoan({
    name: 'Lent loan',
    direction: 'lent',
    label: 'other',
    principal: 10000,
    start_date: localDate(),
    annual_rate_bps: null,
    interest_method: 'none',
    frequency: 'monthly',
    term_months: null,
    payment_account_id: bank,
    counterparty: 'Borrower',
    category_id: income,
    origination_fees: 0,
  });
  await r.recordLoanPayment(lent, {
    date: localDate(),
    principal: 10000,
    interest: 500,
    fees: 0,
    account_id: bank,
  });
  assert.equal((await r.loanDetail(lent)).outstanding, 0);
  net = await r.netWorth(localDate());
  assert.equal(net.groups[0].net, 100500);
  balanced(n);
  n.close();
});

test('advanced records persist across restart and failed posting is atomic', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pocketbook-advanced-'));
  try {
    const path = join(dir, 'finance.db');
    const { n, r, bank, expense, transaction } = await fixture(path);
    const card = await r.saveCard({
      name: 'Persistent card',
      nickname: '',
      credit_limit: 50000,
      closing_day: 31,
      due_day: 10,
      payment_account_id: bank,
      minimum_payment: null,
      opening_balance: 0,
    });
    await r.saveTransaction(transaction('expense', 1234, card));
    await r.saveRecurring({
      type: 'expense',
      amount: 500,
      account_id: bank,
      category_id: expense,
      loan_id: null,
      description: 'Persistent rule',
      start_date: localDate(),
      end_date: null,
      frequency: 'monthly',
    });
    const occurrence = (await r.recurring()).occurrences[0];
    await r.occurrenceAction(occurrence.id, 'confirm');
    const count = n.prepare('SELECT count(*) n FROM ledger_journals').get().n;
    n.exec(
      "CREATE TRIGGER fail_post BEFORE UPDATE OF status ON ledger_journals WHEN NEW.status='posted' BEGIN SELECT RAISE(ABORT,'injected posting failure'); END;"
    );
    await assert.rejects(r.saveTransaction(transaction('expense', 321)), /injected/);
    assert.equal(n.prepare('SELECT count(*) n FROM ledger_journals').get().n, count);
    assert.equal((await r.snapshot()).transactions.length, 2);
    n.exec('DROP TRIGGER fail_post');
    n.close();
    const reopened = new DatabaseSync(path),
      repo = new Repositories(adapter(reopened));
    await repo.initialize();
    assert.equal((await repo.cards())[0].outstanding, 1234);
    assert.equal(
      (await repo.recurring()).occurrences.find((o) => o.id === occurrence.id).status,
      'completed'
    );
    await assert.rejects(repo.occurrenceAction(occurrence.id, 'confirm'), /already/);
    assert.equal(reopened.prepare('SELECT count(*) n FROM ledger_journals').get().n, count);
    balanced(reopened);
    reopened.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('interest-only payments and recurring loan principal remain distinct', async () => {
  const { n, r, bank, expense } = await fixture();
  const loan = await r.createLoan({
    name: 'Recurring debt',
    direction: 'borrowed',
    label: 'other',
    principal: 10000,
    start_date: localDate(),
    annual_rate_bps: null,
    interest_method: 'none',
    frequency: 'monthly',
    term_months: null,
    payment_account_id: bank,
    counterparty: '',
    category_id: expense,
    origination_fees: 0,
  });
  await r.recordLoanPayment(loan, {
    date: localDate(),
    principal: 0,
    interest: 100,
    fees: 50,
    account_id: bank,
  });
  assert.equal((await r.loanDetail(loan)).outstanding, 10000);
  await r.saveRecurring({
    type: 'loan_payment',
    amount: 1000,
    account_id: bank,
    category_id: null,
    loan_id: loan,
    description: 'Principal repayment',
    start_date: localDate(),
    end_date: null,
    frequency: 'monthly',
  });
  const occurrence = (await r.recurring()).occurrences[0];
  await r.occurrenceAction(occurrence.id, 'confirm');
  assert.equal((await r.loanDetail(loan)).outstanding, 9000);
  assert.ok((await r.recurring()).occurrences.find((o) => o.id === occurrence.id).loan_payment_id);
  await assert.rejects(r.occurrenceAction(occurrence.id, 'confirm'), /already/);
  assert.equal((await r.report({ start: localDate(), end: localDate() })).expense, 150);
  balanced(n);
  n.close();
});
