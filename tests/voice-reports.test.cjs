const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const XLSX = require('xlsx');
const { Repositories } = require('../.test-build/db/repositories.js');
const { withOutbox } = require('../.test-build/cloud/outbox.js');
const { parseVoiceExpenses } = require('../.test-build/utils/voiceExpenses.js');
const { startOfflineSpeech } = require('../.test-build/services/offlineSpeech.js');
const {
  expensePeriodRange,
  moveExpensePeriod,
  expenseGroups,
  expenseCurrencyTotals,
} = require('../.test-build/utils/expenseReports.js');
const { expenseReportHTML } = require('../.test-build/utils/expensePDF.js');
const { transactionWorkbook } = require('../.test-build/utils/workbook.js');
test('iOS speech patch refuses an unsupported offline locale before preparing any recognition request', () => {
  const { patchSource, anchor } = require('../scripts/patch-offline-speech.cjs');
  const source = patchSource(anchor);
  assert.ok(
    source.indexOf('recognizer.supportsOnDeviceRecognition else') <
      source.indexOf('Self.prepareRequest')
  );
  assert.ok(source.includes('reset(andEmitEnd: true)'));
  assert.equal(patchSource(source), source);
  assert.throws(() => patchSource('changed upstream'), /native code changed/);
  const fs = require('node:fs'),
    path = require('node:path');
  const installed = fs.readFileSync(
    path.join(
      path.dirname(require.resolve('expo-speech-recognition/package.json')),
      'ios/ExpoSpeechRecognizer.swift'
    ),
    'utf8'
  );
  assert.ok(installed.includes('SETTLER_REQUIRE_OFFLINE_SPEECH'));
});
const categories = [
  { id: 1, name: 'Food', type: 'expense', archived: 0 },
  { id: 2, name: 'Transport', type: 'expense', archived: 0 },
];
const parse = (text, date = '2026-10-11') => parseVoiceExpenses(text, categories, date);
test('the requested voice sentence becomes two reviewed expenses on the current local date', () => {
  const result = parse('I have ate biryani for 140 rupee and taken tea for 15 rupee today.');
  assert.deepEqual(
    result.expenses.map(({ description, amount, date, category }) => ({
      description,
      amount,
      date,
      category,
    })),
    [
      { description: 'biryani', amount: '140.00', date: '2026-10-11', category: 1 },
      { description: 'tea', amount: '15.00', date: '2026-10-11', category: 1 },
    ]
  );
  assert.deepEqual(result.warnings, []);
  assert.equal(parse('Tea 15 rupees today', '2027-01-01').expenses[0].date, '2027-01-01');
});
test('Hindi, Urdu, mixed phrases, native digits and common spoken number words parse on-device', () => {
  const phrases = [
    'आज मैंने १४० रुपये की बिरयानी खाई और १५ रुपये की चाय ली',
    'آج میں نے ۱۴۰ روپے کی بریانی کھائی اور ۱۵ روپے کی چائے پی',
    'aaj biryani 140 rupees aur chai 15 rupees',
    'biryani one hundred and forty rupees and tea fifteen rupees today',
    'आज बिरयानी एक सौ चालीस रुपये और चाय पंद्रह रुपये',
    'آج بریانی ایک سو چالیس روپے اور چائے پندرہ روپے',
  ];
  for (const phrase of phrases) {
    const result = parse(phrase);
    assert.deepEqual(
      result.expenses.map((e) => e.amount),
      ['140.00', '15.00'],
      phrase
    );
    assert.ok(
      result.expenses.every((e) => e.date === '2026-10-11' && e.category === 1),
      phrase
    );
    assert.deepEqual(result.warnings, [], phrase);
  }
});
test('calendar references handle year/leap boundaries; ambiguous Hindi/Urdu dates require review', () => {
  assert.equal(parse('Tea 15 rupees yesterday', '2027-01-01').expenses[0].date, '2026-12-31');
  assert.equal(
    parse('Tea 15 rupees day before yesterday', '2024-03-01').expenses[0].date,
    '2024-02-28'
  );
  assert.equal(parse('Tea 15 rupees 2 days ago', '2024-03-01').expenses[0].date, '2024-02-28');
  assert.equal(parse('Tea 15 rupees tomorrow', '2026-12-31').expenses[0].date, '2027-01-01');
  for (const phrase of [
    'kal chai 15 rupees',
    'कल चाय १५ रुपये',
    'کل چائے ۱۵ روپے',
    'Tea 15 rupees 2026-02-30',
  ]) {
    const result = parse(phrase);
    assert.equal(result.expenses[0].date, '');
    assert.ok(result.warnings.length);
  }
  const separate = parse('Tea 15 rupees yesterday and biryani 140 rupees today');
  assert.deepEqual(
    separate.expenses.map((e) => e.date),
    ['2026-10-10', '2026-10-11']
  );
});
test('unrecognized amounts are surfaced, currency prefixes/decimals work, and unsafe input does not become an expense', () => {
  assert.equal(parse('Lunch ₹140.50 today').expenses[0].amount, '140.50');
  assert.equal(parse('Lunch Rs 1,200 today').expenses[0].amount, '1200.00');
  for (const text of [
    'Tea 0 rupees',
    'Tea -15 rupees',
    'Tea minus fifteen rupees',
    'Tea 15 to 20 rupees',
    'Tea 15.123 rupees',
    'Tea 10000000001 rupees',
    'Tea cost something',
  ]) {
    const result = parse(text);
    assert.equal(result.expenses.length, 0, text);
    assert.ok(result.warnings.length, text);
  }
  const multiple = parse('Tea 15 rupees coffee 30 rupees');
  assert.equal(multiple.expenses.length, 0);
  assert.ok(multiple.warnings.length);
  assert.throws(() => parse('x'.repeat(4001)), /4,000/);
  assert.throws(
    () => parse(Array.from({ length: 21 }, () => 'Tea 15 rupees').join(' and ')),
    /20 expenses/
  );
});
test('offline voice never starts a network-capable Android recognizer, persists no audio, and guards cancellation', async () => {
  const calls = [];
  let permission = true;
  const engine = {
    supportsOnDeviceRecognition: () => true,
    getStateAsync: async () => 'inactive',
    getSupportedLocales: async () => ({ locales: ['en-IN', 'hi-IN'], installedLocales: ['en-IN'] }),
    requestMicrophonePermissionsAsync: async () => ({ granted: permission }),
    start: (options) => calls.push(options),
  };
  await assert.rejects(
    startOfflineSpeech(
      engine,
      'android',
      32,
      'en-IN',
      () => true,
      async () => {}
    ),
    /Android 13/
  );
  await assert.rejects(
    startOfflineSpeech(
      engine,
      'android',
      33,
      'hi-IN',
      () => true,
      async () => {}
    ),
    /not installed/
  );
  assert.equal(calls.length, 0);
  permission = false;
  await assert.rejects(
    startOfflineSpeech(
      engine,
      'android',
      33,
      'en-IN',
      () => true,
      async () => {}
    ),
    /denied/
  );
  permission = true;
  assert.equal(
    await startOfflineSpeech(
      engine,
      'android',
      33,
      'en-IN',
      () => false,
      async () => {}
    ),
    false
  );
  assert.equal(
    await startOfflineSpeech(
      engine,
      'ios',
      18,
      'ur-PK',
      () => true,
      async () => {}
    ),
    true
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0].requiresOnDeviceRecognition, true);
  assert.equal(calls[0].recordingOptions.persist, false);
  assert.equal(calls[0].lang, 'ur-PK');
  await assert.rejects(
    startOfflineSpeech(
      null,
      'ios',
      18,
      'en-IN',
      () => true,
      async () => {}
    ),
    /native Settler/
  );
});
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
test('voice expense batch commits one balanced cloud operation, and failure rolls back all entries and outbox changes', async () => {
  const n = new DatabaseSync(':memory:'),
    r = new Repositories(withOutbox(adapter(n)));
  try {
    await r.initialize();
    await r.saveAccount({ name: 'Bank', type: 'bank', opening_balance: 100000, description: '' });
    const s = await r.snapshot(),
      category = s.categories.find((c) => c.type === 'expense').id;
    await r.enableSync('voice-owner');
    const initial = await r.nextOperation('voice-owner');
    await r.acknowledge(initial, 1);
    const input = {
      type: 'expense',
      amount: 14000,
      account_id: s.accounts[0].id,
      destination_account_id: null,
      category_id: category,
      description: 'Biryani',
      date: '2026-10-11',
      notes: '',
    };
    const ids = await r.saveExpenseBatch([input, { ...input, description: 'Tea', amount: 1500 }]);
    assert.equal(new Set(ids).size, 2);
    assert.equal((await r.snapshot()).accounts[0].ledger_balance, 84500);
    assert.deepEqual(await r.integrity(), []);
    assert.equal((await r.syncState()).pending, 1);
    const op = await r.nextOperation('voice-owner');
    assert.equal(op.changes.filter((c) => c.entity === 'transactions').length, 2);
    const journals = n.prepare('SELECT count(*) n FROM ledger_journals').get().n;
    await assert.rejects(r.saveExpenseBatch([input, { ...input, category_id: 99999 }]), /category/);
    assert.equal((await r.snapshot()).transactions.length, 2);
    assert.equal(n.prepare('SELECT count(*) n FROM ledger_journals').get().n, journals);
    assert.equal((await r.syncState()).pending, 1);
    await assert.rejects(r.saveExpenseBatch([]), /1 and 20/);
    await assert.rejects(r.saveExpenseBatch([{ ...input, type: 'income' }]), /expenses/);
  } finally {
    n.close();
  }
});
const exportRow = (id, date, amount = 100, type = 'expense', currency = 'INR') => ({
  id,
  date,
  amount,
  type,
  currency,
  description: 'Tea',
  account: 'Bank',
  destination: null,
  category: 'Food',
  notes: '',
  created_at: '2026-10-11T00:00:00Z',
});
test('daily, Monday-based weekly and monthly ranges navigate historical/leap/year periods correctly', () => {
  assert.deepEqual(expensePeriodRange('daily', '2026-10-11'), {
    start: '2026-10-11',
    end: '2026-10-11',
  });
  assert.deepEqual(expensePeriodRange('weekly', '2026-10-11'), {
    start: '2026-10-05',
    end: '2026-10-11',
  });
  assert.deepEqual(expensePeriodRange('weekly', '2027-01-01'), {
    start: '2026-12-28',
    end: '2027-01-03',
  });
  assert.deepEqual(expensePeriodRange('monthly', '2024-02-29'), {
    start: '2024-02-01',
    end: '2024-02-29',
  });
  assert.equal(moveExpensePeriod('monthly', '2026-01-31', 1), '2026-02-01');
  assert.equal(moveExpensePeriod('weekly', '2027-01-01', -1), '2026-12-25');
  assert.deepEqual(expensePeriodRange('all', ''), {});
  assert.throws(() => expensePeriodRange('weekly', '2026-02-30'), /valid/);
});
test('expense summaries exclude income/transfers, preserve currency boundaries and cover month-spanning weeks', () => {
  const rows = [
    exportRow(1, '2026-12-31', 14000),
    exportRow(2, '2027-01-01', 1500),
    exportRow(3, '2027-01-01', 90000, 'income'),
    exportRow(4, '2027-01-01', 90000, 'transfer'),
    exportRow(5, '2027-01-01', 500, 'expense', 'USD'),
  ];
  assert.deepEqual(expenseGroups(rows, 'weekly'), [
    { period: '2026-12-28', currency: 'INR', amount: 15500, count: 2 },
    { period: '2026-12-28', currency: 'USD', amount: 500, count: 1 },
  ]);
  assert.equal(expenseGroups(rows, 'daily').length, 3);
  assert.equal(expenseGroups(rows, 'monthly').length, 3);
  assert.deepEqual(expenseCurrencyTotals(rows), [
    { currency: 'INR', amount: 15500 },
    { currency: 'USD', amount: 500 },
  ]);
  assert.throws(
    () =>
      expenseGroups(
        [exportRow(1, '2026-10-11', Number.MAX_SAFE_INTEGER), exportRow(2, '2026-10-11', 1)],
        'daily'
      ),
    /precision/
  );
});
test('Excel expense summaries are numeric, sorted and keep multilingual user text literal', () => {
  const rows = [
    exportRow(1, '2026-10-11', 14000),
    {
      ...exportRow(2, '2026-10-11', 1500),
      description: '=HYPERLINK("evil") چائے चाय',
      notes: '<script>unsafe</script>',
    },
  ];
  const book = XLSX.read(transactionWorkbook(rows), { type: 'array' });
  for (const name of ['Daily Expenses', 'Weekly Expenses', 'Monthly Expenses']) {
    assert.equal(book.Sheets[name].C2.t, 'n');
    assert.equal(book.Sheets[name].C2.v, 155);
    assert.equal(book.Sheets[name].D2.v, 2);
  }
  assert.equal(book.Sheets.Transactions.D3.t, 's');
  assert.equal(book.Sheets.Transactions.D3.f, undefined);
  assert.equal(book.Sheets.Transactions.D3.v, rows[1].description);
});
test('PDF report escapes all user content, includes expense detail/totals and enforces a safe size limit', () => {
  const row = {
    ...exportRow(1, '2026-10-11', 15500),
    description: '<script>bad</script> چائے चाय',
    account: 'A&B',
    notes: '"private"',
  };
  const html = expenseReportHTML(
    [row, exportRow(2, '2026-10-11', 10000, 'income')],
    'Expenses <October>',
    'daily'
  );
  assert.ok(html.includes('&lt;script&gt;bad&lt;/script&gt;'));
  assert.equal(html.includes('<script>'), false);
  assert.ok(html.includes('A&amp;B'));
  assert.ok(html.includes('INR 155.00'));
  assert.ok(html.includes('1 entries'));
  assert.ok(html.includes('چائے चाय'));
  assert.ok(html.includes('&lt;October&gt;'));
  assert.throws(
    () =>
      expenseReportHTML(
        Array.from({ length: 1001 }, (_, i) => exportRow(i, '2026-10-11')),
        'Large',
        'all'
      ),
    /1,000/
  );
  assert.ok(expenseReportHTML([], 'Empty', 'monthly').includes('No expenses'));
});
