const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { randomBytes } = require('node:crypto');
const { Repositories } = require('../.test-build/db/repositories.js');
const { DataRepository } = require('../.test-build/db/dataRepository.js');
const { migrations } = require('../.test-build/db/migrations.js');
const { validateBackup } = require('../.test-build/services/backup.js');
const { digest, encryptBackup, decryptBackup } = require('../.test-build/security/crypto.js');
const {
  LockCore,
  shouldRelock,
  authenticateBiometric,
} = require('../.test-build/security/lockCore.js');
const { csvCell, transactionCSV } = require('../.test-build/utils/export.js');
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
async function fixture() {
  const n = new DatabaseSync(':memory:'),
    r = new Repositories(adapter(n));
  await r.initialize();
  await r.saveAccount({ name: 'Bank', type: 'bank', opening_balance: 100000, description: '' });
  const s = await r.snapshot(),
    bank = s.accounts[0].id,
    expense = s.categories.find((c) => c.type === 'expense').id,
    income = s.categories.find((c) => c.type === 'income').id;
  const tx = (type, amount, date = localDate()) => ({
    type,
    amount,
    account_id: bank,
    destination_account_id: null,
    category_id: type === 'expense' ? expense : income,
    description: 'Unicode ₹, "quote"\nnext line',
    notes: '=HYPERLINK("evil")',
    date,
  });
  return { n, r, bank, expense, income, tx };
}
const resign = (b) => {
  b.sha256 = digest(JSON.stringify(b.payload));
  return JSON.stringify(b);
};
test('CSV escapes Unicode, delimiters, newlines and formula prefixes with numeric decimals', () => {
  assert.equal(csvCell('a,"b"\nc'), '"a,""b""\nc"');
  for (const text of ['=1+1', '+SUM(1)', '-1+2', '@evil', '\t =evil', '\r\n+evil'])
    assert.ok(csvCell(text).startsWith('"\''));
  assert.equal(csvCell(123), '"123"');
  const csv = transactionCSV([
    {
      id: 1,
      date: '2026-01-02',
      type: 'expense',
      description: '₹ भोजन',
      amount: 12345,
      currency: 'INR',
      account: 'Bank',
      destination: null,
      category: 'Food',
      notes: '=evil',
      created_at: '2026-01-02T00:00:00.000Z',
    },
  ]);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.includes('"123.45"'));
  assert.ok(csv.includes('"\'=evil"'));
  assert.ok(csv.endsWith('\r\n'));
});
test('selected export filters are inclusive, combined and exclude void transactions', async () => {
  const { n, r, bank, expense, tx } = await fixture();
  await r.saveTransaction(tx('expense', 100, '2026-01-01'));
  await r.saveTransaction(tx('expense', 200, '2026-01-02'));
  await r.saveTransaction(tx('income', 300, '2026-01-02'));
  const rows = await r.exportTransactions({
    start: '2026-01-02',
    end: '2026-01-02',
    account: bank,
    category: expense,
    type: 'expense',
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].amount, 200);
  assert.equal(rows[0].currency, 'INR');
  assert.equal(Object.hasOwn(rows[0], 'payload'), false);
  await r.deleteTransaction(rows[0].id);
  assert.equal((await r.exportTransactions({ type: 'expense' })).length, 1);
  await assert.rejects(r.exportTransactions({ start: '2026-02-30' }));
  await assert.rejects(r.exportTransactions({ start: '2026-02-01', end: '2026-01-01' }));
  n.close();
});
test('complete backup round trip preserves cards, loans, budgets, occurrence history and audit records', async () => {
  const { n, r, bank, expense, tx } = await fixture();
  const card = await r.saveCard({
    name: 'Card',
    nickname: '',
    credit_limit: 50000,
    closing_day: 31,
    due_day: 10,
    payment_account_id: bank,
    minimum_payment: null,
    opening_balance: 0,
  });
  await r.saveTransaction({ ...tx('expense', 1234), account_id: card });
  await r.createStatement(card, '2026-10', null);
  const loan = await r.createLoan({
    name: 'Debt',
    direction: 'borrowed',
    label: 'personal',
    principal: 10000,
    start_date: localDate(),
    annual_rate_bps: 1200,
    interest_method: 'flat',
    frequency: 'monthly',
    term_months: 2,
    payment_account_id: bank,
    counterparty: 'Lender',
    category_id: expense,
    origination_fees: 0,
  });
  await r.recordLoanPayment(loan, {
    date: localDate(),
    principal: 1000,
    interest: 100,
    fees: 10,
    account_id: bank,
  });
  await r.saveRecurring({
    type: 'expense',
    amount: 200,
    account_id: bank,
    category_id: expense,
    loan_id: null,
    description: 'Rent',
    start_date: localDate(),
    end_date: null,
    frequency: 'monthly',
  });
  await r.occurrenceAction((await r.recurring()).occurrences[0].id, 'confirm');
  await r.saveBudget({
    name: 'Budget',
    month: localDate().slice(0, 7),
    total_limit_minor: 10000,
    allocations: [{ category_id: expense, limit_minor: 5000 }],
  });
  const original = await r.backup(),
    backup = validateBackup(original);
  assert.equal(backup.payload.schemaVersion, 4);
  assert.ok(backup.payload.tables.ledger_lines.length);
  assert.equal(Object.hasOwn(backup.payload.tables, 'lock'), false);
  const stage = new DatabaseSync(':memory:');
  await new DataRepository(adapter(stage)).validateInDatabase(original);
  stage.close();
  await r.saveTransaction(tx('expense', 999));
  let recovery;
  await r.replaceBackup(original, async (text) => {
    recovery = text;
  });
  assert.equal(
    validateBackup(recovery).payload.tables.transactions.length,
    backup.payload.tables.transactions.length + 1
  );
  const restored = validateBackup(await r.backup());
  assert.deepEqual(restored.payload.tables, backup.payload.tables);
  assert.deepEqual(await r.integrity(), []);
  await r.initialize();
  assert.equal((await r.loanDetail(loan)).outstanding, 9000);
  n.close();
});
test('backup rejects corruption, unsupported versions, incomplete data and invalid references before commit', async () => {
  const { n, r, tx } = await fixture();
  await r.saveTransaction(tx('expense', 100));
  const original = await r.backup();
  const corrupt = JSON.parse(original);
  corrupt.payload.tables.transactions[0].amount = 200;
  assert.throws(() => validateBackup(JSON.stringify(corrupt)), /checksum/);
  const unsupported = JSON.parse(original);
  unsupported.formatVersion = 2;
  assert.throws(() => validateBackup(JSON.stringify(unsupported)), /Unsupported/);
  const missing = JSON.parse(original);
  delete missing.payload.tables.loans;
  assert.throws(() => validateBackup(resign(missing)), /complete/);
  const orphan = JSON.parse(original);
  orphan.payload.tables.transactions[0].account_id = 99999;
  const stage = new DatabaseSync(':memory:');
  await assert.rejects(new DataRepository(adapter(stage)).validateInDatabase(resign(orphan)));
  stage.close();
  const before = JSON.stringify(validateBackup(await r.backup()).payload.tables);
  await assert.rejects(r.replaceBackup(resign(orphan), async () => {}));
  assert.equal(JSON.stringify(validateBackup(await r.backup()).payload.tables), before);
  const extra = JSON.parse(original);
  extra.payload.tables.accounts[0].sql = 'DROP TABLE accounts';
  await assert.rejects(
    r.replaceBackup(resign(extra), async () => {}),
    /columns/
  );
  assert.equal(JSON.stringify(validateBackup(await r.backup()).payload.tables), before);
  n.close();
});
test('recovery-write failure and mid-restore insert failure preserve the live database', async () => {
  const { n, r, tx } = await fixture();
  await r.saveTransaction(tx('expense', 321));
  const text = await r.backup();
  await assert.rejects(
    r.replaceBackup(text, async () => {
      throw new Error('storage full');
    }),
    /storage full/
  );
  const a = adapter(n),
    run = a.runAsync;
  a.runAsync = async (sql, ...p) => {
    if (sql.startsWith('INSERT INTO ledger_lines')) throw new Error('interrupted write');
    return run(sql, ...p);
  };
  await assert.rejects(
    new Repositories(a).replaceBackup(text, async () => {}),
    /interrupted/
  );
  assert.equal(n.prepare('PRAGMA foreign_keys').get().foreign_keys, 1);
  assert.deepEqual(
    validateBackup(await r.backup()).payload.tables,
    validateBackup(text).payload.tables
  );
  assert.deepEqual(await r.integrity(), []);
  n.close();
});
test('encrypted backups authenticate password, ciphertext and metadata', async () => {
  const text = '{"financial":"₹ private"}',
    password = 'correct long backup password';
  const encrypted = await encryptBackup(text, password, randomBytes);
  assert.equal(encrypted.includes('₹ private'), false);
  assert.equal(await decryptBackup(encrypted, password), text);
  await assert.rejects(decryptBackup(encrypted, 'wrong password'), /Incorrect/);
  const tampered = JSON.parse(encrypted);
  tampered.ciphertext = (tampered.ciphertext[0] === '0' ? '1' : '0') + tampered.ciphertext.slice(1);
  await assert.rejects(decryptBackup(JSON.stringify(tampered), password), /Incorrect/);
  tampered.iterations = 1;
  await assert.rejects(decryptBackup(JSON.stringify(tampered), password), /Unsupported/);
  await assert.rejects(encryptBackup(text, 'short', randomBytes), /12/);
});
test('passcode verifier, throttling, change and disable persist without plaintext', async () => {
  let value = null,
    time = 100000;
  const storage = {
    get: async () => value,
    set: async (v) => {
      value = v;
    },
    remove: async () => {
      value = null;
    },
  };
  const lock = new LockCore(storage, randomBytes, () => time);
  await lock.load();
  await assert.rejects(lock.enable('1234'));
  await lock.enable('739182');
  assert.equal(value.includes('739182'), false);
  await assert.rejects(lock.check('000000'), /Incorrect/);
  const second = new LockCore(storage, randomBytes, () => time);
  await second.load();
  await assert.rejects(second.check('739182'), /Try again/);
  time += 10000;
  await second.check('739182');
  assert.equal(second.record.failures, 0);
  await second.change('739182', '918273');
  assert.equal(value.includes('918273'), false);
  await second.check('918273');
  await second.configure('918273', true, 30);
  assert.equal(second.record.biometric, true);
  await second.disable('918273');
  assert.equal(value, null);
  assert.equal(shouldRelock(1000, 30999, 30), false);
  assert.equal(shouldRelock(1000, 31000, 30), true);
  assert.equal(shouldRelock(1000, 1000, 0), true);
});
test('each supported schema upgrades without removing records; future versions fail closed', async () => {
  for (let version = 1; version <= 4; version++) {
    const n = new DatabaseSync(':memory:');
    n.exec('CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY,applied_at TEXT NOT NULL)');
    for (let i = 0; i < version; i++) {
      n.exec(migrations[i]);
      n.prepare('INSERT INTO schema_migrations VALUES (?,?)').run(i + 1, 'old');
    }
    const repo = new Repositories(adapter(n));
    await repo.initialize();
    await repo.saveAccount({
      name: 'Preserved',
      type: 'cash',
      opening_balance: 123,
      description: '',
    });
    await repo.initialize();
    assert.equal((await repo.snapshot()).accounts[0].ledger_balance, 123);
    assert.equal(n.prepare('SELECT count(*) n FROM schema_migrations').get().n, 4);
    n.prepare('INSERT INTO schema_migrations VALUES (?,?)').run(99, 'future');
    await assert.rejects(repo.initialize(), /Unsupported/);
    assert.equal((await repo.snapshot()).accounts[0].name, 'Preserved');
    n.close();
  }
});

test('unavailable, cancelled and failed biometrics keep authentication closed', async () => {
  let calls = 0;
  await assert.rejects(
    authenticateBiometric(
      async () => false,
      async () => {
        calls++;
        return true;
      }
    ),
    /unavailable/
  );
  assert.equal(calls, 0);
  await assert.rejects(
    authenticateBiometric(
      async () => true,
      async () => false
    ),
    /did not complete/
  );
  await authenticateBiometric(
    async () => true,
    async () => true
  );
});

test('Excel export is a real workbook with numeric amounts and literal untrusted text', () => {
  const XLSX = require('xlsx');
  const { transactionWorkbook } = require('../.test-build/utils/workbook.js');
  const bytes = transactionWorkbook([
    {
      id: 1,
      date: '2026-01-02',
      type: 'expense',
      description: '=HYPERLINK("evil")',
      amount: 12345,
      currency: 'INR',
      account: 'Bank',
      destination: null,
      category: 'Food',
      notes: '@SUM(1)',
      created_at: '2026-01-02T00:00:00Z',
    },
  ]);
  assert.deepEqual(Array.from(bytes.slice(0, 2)), [80, 75]);
  const workbook = XLSX.read(bytes, { type: 'array' });
  assert.deepEqual(workbook.SheetNames, [
    'Transactions',
    'Accounts',
    'Categories',
    'Monthly Summary',
    'Daily Expenses',
    'Weekly Expenses',
    'Monthly Expenses',
  ]);
  assert.equal(workbook.Sheets.Transactions.E2.t, 'n');
  assert.equal(workbook.Sheets.Transactions.E2.v, 123.45);
  assert.equal(workbook.Sheets.Transactions.D2.t, 's');
  assert.equal(workbook.Sheets.Transactions.D2.f, undefined);
  assert.equal(workbook.Sheets['Monthly Summary'].D2.v, 123.45);
});

test('cancelled destructive restore does not write or create a recovery copy', async () => {
  const { restoreWithConfirmation } = require('../.test-build/services/restorePolicy.js');
  let writes = 0;
  assert.equal(
    await restoreWithConfirmation(
      async () => false,
      async () => {
        writes++;
      }
    ),
    false
  );
  assert.equal(writes, 0);
  assert.equal(
    await restoreWithConfirmation(
      async () => true,
      async () => {
        writes++;
      }
    ),
    true
  );
  assert.equal(writes, 1);
});
test('diagnostics report projection inconsistencies without modifying records', async () => {
  const { n, r, tx } = await fixture();
  await r.saveTransaction(tx('expense', 100));
  n.exec('UPDATE transactions SET amount=101');
  const before = await r.backup();
  assert.ok((await r.integrity()).some((i) => i.code === 'transaction_ledger_mismatch'));
  assert.deepEqual(
    validateBackup(await r.backup()).payload.tables,
    validateBackup(before).payload.tables
  );
  n.close();
});
