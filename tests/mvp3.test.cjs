const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  parseReceiptText,
  possibleReceiptDuplicates,
  scanResize,
} = require('../.test-build/utils/receiptScan.js');
const { prepareReceiptScan } = require('../.test-build/services/receiptScanCore.js');
const categories = [
  { id: 1, name: 'Food', type: 'expense', archived: 0 },
  { id: 2, name: 'Transport', type: 'expense', archived: 0 },
  { id: 3, name: 'Health', type: 'expense', archived: 0 },
];
const parse = (text) => parseReceiptText(text, categories);

test('receipt drafts prefer the paid grand total over subtotal, tax, tendered cash and change', () => {
  const result = parse(
    'PARADISE RESTAURANT\nTax Invoice\nDate: 12/10/2026\nBiryani 140.00\nTea 15.00\nSubtotal 155.00\nCGST 3.88\nSGST 3.88\nGrand Total INR 162.76\nCash tendered 200.00\nChange 37.24'
  );
  assert.equal(result.merchant, 'PARADISE RESTAURANT');
  assert.equal(result.amount, '162.76');
  assert.equal(result.date, '2026-10-12');
  assert.equal(result.category, 1);
  assert.equal(result.candidates.length, 1);
  assert.match(result.warnings.join(' '), /day\/month/);
  assert.equal(parse('Cafe Luna\nGrand Total\nRs 155.00\n12 Oct 2026').amount, '155.00');
  assert.equal(parse('Cafe Luna\nGrand Total\nRs 155.00\n12 Oct 2026').date, '2026-10-12');
});

test('scanning never guesses totals from item prices, receipt IDs, negative amounts, quantity totals or foreign currency', () => {
  for (const text of [
    'Cafe\nInvoice 123456789\nTea 15.00\nCoffee 30.00',
    'Cafe\nTotal items 3\nTax 15.00',
    'Cafe\nTotal -15.00',
    'Cafe\nTotal 15.123',
    'Cafe\nTotal 1,20',
    'Cafe\nTotal 10000000001',
    'Cafe\nTotal USD 15.00',
    'Cafe\nTotal €15.00',
  ]) {
    assert.equal(parse(text).amount, '', text);
  }
  const ambiguous = parse('Cafe\nTotal 140.00\nTOTAL 155.00');
  assert.equal(ambiguous.amount, '');
  assert.equal(ambiguous.candidates.length, 2);
  assert.match(ambiguous.warnings.join(' '), /Several totals/);
  assert.equal(parse('Cafe\nGrand total 155.00\nTotal 140.00').amount, '155.00');
  assert.equal(parse('Cafe\nTotal ₹1,25,140.50').amount, '125140.50');
});

test('receipt date extraction preserves historical dates and leaves absent, invalid or conflicting dates blank', () => {
  assert.equal(parse('Cafe\n2024-02-29\nTotal 15.00').date, '2024-02-29');
  for (const date of ['', '29/02/2025', '12/10/26', '2026-10-11\n2026-10-12']) {
    const result = parse(`Cafe\n${date}\nTotal 15.00`);
    assert.equal(result.date, '', date);
    assert.match(result.warnings.join(' '), /purchase date/);
  }
  assert.equal(parse('Cafe\nDate 12-Oct-2026\nTotal 15.00').date, '2026-10-12');
});

test('native digits and Hindi totals become editable drafts, without assigning archived categories', () => {
  const result = parse('बिरयानी रेस्टोरेंट\n१२/१०/२०२६\nकुल योग ₹१५५.५०');
  assert.equal(result.amount, '155.50');
  assert.equal(result.date, '2026-10-12');
  assert.equal(result.category, 1);
  assert.equal(
    parseReceiptText('Paradise Restaurant\nTotal 155', [{ ...categories[0], archived: 1 }])
      .category,
    null
  );
  assert.equal(parse('').merchant, '');
  assert.throws(() => parse('x'.repeat(20001)), /too much text/);
});

test('duplicate review matches posted expenses by current amount, date and account, excluding income, transfers and voids', () => {
  const base = {
    id: 1,
    type: 'expense',
    status: 'posted',
    amount: 15500,
    date: '2026-10-12',
    account_id: 1,
  };
  const rows = [
    base,
    { ...base, id: 2, status: 'void' },
    { ...base, id: 3, type: 'income' },
    { ...base, id: 4, type: 'transfer' },
    { ...base, id: 5, account_id: 2 },
    { ...base, id: 6, date: '2026-10-11' },
  ];
  const input = { amount: '155.00', date: '2026-10-12', account: 1 };
  assert.deepEqual(
    possibleReceiptDuplicates(rows, input).map((t) => t.id),
    [1]
  );
  assert.equal(possibleReceiptDuplicates(rows, { ...input, amount: '156' }).length, 0);
  assert.equal(possibleReceiptDuplicates(rows, { ...input, date: '' }).length, 0);
  assert.equal(possibleReceiptDuplicates(rows, { ...input, amount: '-155' }).length, 0);
});

test('image limits bound processing and preserve aspect ratio for large landscape and portrait receipts', () => {
  assert.deepEqual(scanResize(4000, 3000), { width: 2400 });
  assert.deepEqual(scanResize(3000, 4000), { height: 2400 });
  assert.equal(scanResize(1200, 1600), undefined);
  for (const size of [
    [0, 10],
    [10000, 10000],
    [1.5, 2],
    [NaN, 10],
  ])
    assert.throws(() => scanResize(...size), /24 megapixels/);
});

function scanIO(overrides = {}) {
  const deleted = [],
    calls = [];
  const io = {
    imageInfo: async () => {
      calls.push('info');
      return { width: 4000, height: 3000 };
    },
    normalize: async (_, resize) => {
      assert.deepEqual(resize, { width: 2400 });
      calls.push('normalize');
      return 'normalized';
    },
    recognize: async () => {
      calls.push('recognize');
      return { text: 'Cafe\n2026-10-12\nTotal 155.00', truncated: false };
    },
    waitForAccess: async () => {
      calls.push('access');
    },
    receipt: (uri) => {
      calls.push('receipt');
      return { id: 'receipt', sourceUri: uri };
    },
    discard: (uri) => deleted.push(uri),
    ...overrides,
  };
  return { io, deleted, calls };
}
test('successful OCR transfers only the normalized image to the review, cleans the original, and checks foreground access', async () => {
  const { io, deleted, calls } = scanIO();
  const draft = await prepareReceiptScan(io, 'original', 'latin', categories, () => true);
  assert.equal(draft.receipt.sourceUri, 'normalized');
  assert.equal(draft.amount, '155.00');
  assert.deepEqual(deleted, ['original']);
  assert.deepEqual(calls, ['info', 'normalize', 'recognize', 'access', 'receipt']);
});
test('unsupported OCR and truncated recognition preserve the image with a blank manual draft', async () => {
  for (const recognize of [
    async () => {
      throw new Error('unsupported locale');
    },
    async () => ({ text: 'Cafe\nTotal 15', truncated: true }),
  ]) {
    const { io, deleted } = scanIO({ recognize });
    const draft = await prepareReceiptScan(io, 'original', 'devanagari', categories, () => true);
    assert.equal(draft.amount, '');
    assert.equal(draft.date, '');
    assert.equal(draft.receipt.sourceUri, 'normalized');
    assert.ok(draft.warnings.length);
    assert.deepEqual(deleted, ['original']);
  }
});
test('cancelled scans and validation failures remove owned cache images and never create a reviewed receipt', async () => {
  let active = true;
  const { io, deleted } = scanIO({
    recognize: async () => {
      active = false;
      return { text: 'Cafe\nTotal 15', truncated: false };
    },
  });
  assert.equal(await prepareReceiptScan(io, 'original', 'latin', categories, () => active), null);
  assert.deepEqual(deleted, ['normalized', 'original']);
  const failed = scanIO({
    imageInfo: async () => {
      throw new Error('invalid image');
    },
  });
  await assert.rejects(
    prepareReceiptScan(failed.io, 'original', 'latin', categories, () => true),
    /invalid image/
  );
  assert.deepEqual(failed.deleted, ['original']);
  const cancelled = scanIO();
  assert.equal(
    await prepareReceiptScan(cancelled.io, 'original', 'latin', categories, () => false),
    null
  );
  assert.deepEqual(cancelled.calls, ['info']);
  assert.deepEqual(cancelled.deleted, ['original']);
});
