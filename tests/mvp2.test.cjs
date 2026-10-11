const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { Repositories } = require('../.test-build/db/repositories.js');
const { validateBackup } = require('../.test-build/services/backup.js');
const { commitReceiptFiles } = require('../.test-build/services/receiptStorage.js');
const { recentEntryTemplates, entryFromTemplate } = require('../.test-build/utils/quickEntry.js');
const {
  receiptName,
  receiptFileName,
  receiptTypeFromHeader,
  validateReceipts,
  MAX_RECEIPT_BYTES,
} = require('../.test-build/utils/receipts.js');
const receipt = (n = 1) => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  name: 'Receipt.pdf',
  mime_type: 'application/pdf',
  size: 123,
});
function adapter(n) {
  return {
    execAsync: async (sql) => n.exec(sql),
    runAsync: async (sql, ...p) => n.prepare(sql).run(...p),
    getAllAsync: async (sql, ...p) => n.prepare(sql).all(...p),
    getFirstAsync: async (sql, ...p) => n.prepare(sql).get(...p) ?? null,
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
  const s = await r.snapshot();
  const input = {
    type: 'expense',
    amount: 1000,
    account_id: s.accounts[0].id,
    destination_account_id: null,
    category_id: s.categories.find((c) => c.type === 'expense').id,
    description: 'Coffee',
    date: '2026-10-11',
    notes: '',
  };
  return { n, r, input };
}
test('receipt limits, safe filenames and file signatures reject unsafe or unsupported attachments', () => {
  assert.equal(receiptName('../invoice\u0000.pdf'), '.._invoice_.pdf');
  assert.match(receiptFileName(receipt()), /^00000000-0000-4000-8000-000000000001.pdf$/);
  assert.equal(
    receiptTypeFromHeader(Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d])),
    'application/pdf'
  );
  assert.equal(receiptTypeFromHeader(Uint8Array.from([0xff, 0xd8, 0xff])), 'image/jpeg');
  assert.equal(
    receiptTypeFromHeader(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    'image/png'
  );
  assert.throws(
    () => receiptTypeFromHeader(new TextEncoder().encode('<html>not a PDF')),
    /not a supported/
  );
  assert.throws(() => receiptFileName({ ...receipt(), id: '../../secrets' }), /identifier/);
  assert.throws(() => validateReceipts([{ ...receipt(), size: MAX_RECEIPT_BYTES + 1 }]), /10 MB/);
  assert.throws(() => validateReceipts([{ ...receipt(), size: 0 }]), /nonempty/);
  assert.throws(() => validateReceipts([{ ...receipt(), mime_type: 'image/svg+xml' }]), /JPEG/);
  assert.throws(() => validateReceipts([receipt(), receipt()]), /twice/);
  assert.throws(
    () => validateReceipts(Array.from({ length: 6 }, (_, i) => receipt(i + 1))),
    /up to 5/
  );
});
test('receipts and ledger commit together, persist across initialization, and appear in paginated rows', async () => {
  const { n, r, input } = await fixture();
  try {
    const id = await r.saveTransaction(input, undefined, [receipt()]);
    assert.deepEqual(
      (await r.receipts(id)).map((row) => ({ ...row })),
      [receipt()]
    );
    assert.equal((await r.snapshot()).transactions[0].receipt_count, 1);
    assert.equal((await r.searchTransactions()).rows[0].receipt_count, 1);
    await r.initialize();
    assert.deepEqual(
      (await r.receipts(id)).map((row) => ({ ...row })),
      [receipt()]
    );
    await r.saveTransaction({ ...input, amount: 1500 }, id);
    assert.deepEqual(
      (await r.receipts(id)).map((row) => ({ ...row })),
      [receipt()],
      'ordinary edits preserve receipts'
    );
    await r.saveTransaction({ ...input, amount: 2000 }, id, [receipt(2)]);
    assert.deepEqual(
      (await r.receipts(id)).map((row) => ({ ...row })),
      [receipt(2)]
    );
    assert.deepEqual(await r.integrity(), []);
    assert.deepEqual(
      (await r.deleteTransaction(id)).map((row) => ({ ...row })),
      [receipt(2)]
    );
    assert.deepEqual(await r.receipts(id), []);
    assert.equal(n.prepare('SELECT count(*) n FROM local_receipts').get().n, 0);
  } finally {
    n.close();
  }
});
test('invalid receipts or a receipt owned by another transaction roll back the entire financial change', async () => {
  const { n, r, input } = await fixture();
  try {
    const id = await r.saveTransaction(input, undefined, [receipt()]);
    const before = await r.backup();
    const journals = n.prepare('SELECT count(*) n FROM ledger_journals').get().n;
    await assert.rejects(
      r.saveTransaction({ ...input, amount: 2000 }, id, [{ ...receipt(), size: 0 }]),
      /nonempty/
    );
    await assert.rejects(r.saveTransaction(input, undefined, [receipt()]), /another transaction/);
    assert.equal((await r.snapshot()).transactions.length, 1);
    assert.equal((await r.snapshot()).transactions[0].amount, 1000);
    assert.equal(n.prepare('SELECT count(*) n FROM ledger_journals').get().n, journals);
    assert.deepEqual(
      validateBackup(await r.backup()).payload.tables,
      validateBackup(before).payload.tables
    );
    assert.deepEqual(
      (await r.receipts(id)).map((row) => ({ ...row })),
      [receipt()]
    );
  } finally {
    n.close();
  }
});
test('financial backups/cloud exclude receipt metadata; same-device restore keeps matching attachments and rejects reused IDs', async () => {
  const { n, r, input } = await fixture();
  try {
    const id = await r.saveTransaction(input, undefined, [receipt()]);
    const backup = await r.backup();
    assert.equal(backup.includes(receipt().id), false);
    assert.equal(backup.includes('local_receipts'), false);
    await r.enableSync('receipt-test-owner');
    const operation = await r.nextOperation('receipt-test-owner');
    assert.equal(JSON.stringify(operation).includes(receipt().id), false);
    await r.replaceBackup(backup, async () => {});
    assert.deepEqual(
      (await r.receipts(id)).map((row) => ({ ...row })),
      [receipt()]
    );
    n.prepare('UPDATE transactions SET created_at=? WHERE id=?').run(
      '2020-01-01T00:00:00.000Z',
      id
    );
    assert.deepEqual(await r.receipts(id), []);
    assert.equal((await r.snapshot()).transactions[0].receipt_count, 0);
  } finally {
    n.close();
  }
});
test('receipt copy or database failures clean only new files; post-commit cleanup failures still report success', async () => {
  const drafts = [receipt(2), receipt(3)].map((r) => ({ ...r, sourceUri: `cache://${r.id}` }));
  const files = new Set([receipt().id]);
  let commits = 0;
  const storage = {
    verify: async () => {},
    copy: async (r) => {
      files.add(r.id);
      if (r.id === receipt(3).id) throw new Error('disk full');
    },
    remove: (r) => files.delete(r.id),
  };
  await assert.rejects(
    commitReceiptFiles(storage, drafts, [receipt()], async () => {
      commits++;
    }),
    /disk full/
  );
  assert.equal(commits, 0);
  assert.deepEqual([...files], [receipt().id]);
  storage.copy = async (r) => {
    files.add(r.id);
  };
  await assert.rejects(
    commitReceiptFiles(storage, drafts, [receipt()], async () => {
      throw new Error('db failed');
    }),
    /db failed/
  );
  assert.deepEqual([...files], [receipt().id]);
  storage.remove = () => {
    throw new Error('cleanup failed');
  };
  assert.equal(
    await commitReceiptFiles(storage, drafts, [receipt()], async (rows) => {
      commits++;
      assert.equal(rows[0].sourceUri, undefined);
      return 42;
    }),
    42
  );
  assert.equal(commits, 1);
});
test('retaining a missing existing receipt does not block saving or explicit removal', async () => {
  let verified = 0;
  const storage = {
    verify: async () => {
      verified++;
      throw new Error('missing');
    },
    copy: async () => {},
    remove: () => {},
  };
  assert.equal(
    await commitReceiptFiles(storage, [receipt()], [receipt()], async (rows) => rows.length),
    1
  );
  assert.equal(verified, 0);
  assert.equal(await commitReceiptFiles(storage, [], [receipt()], async (rows) => rows.length), 0);
});
test('recent shortcuts deduplicate latest details, exclude unusable history, and honor account/type', async () => {
  const { n, r, input } = await fixture();
  try {
    const id = await r.saveTransaction(input);
    const s = await r.snapshot(),
      base = s.transactions[0];
    const history = [
      base,
      { ...base, id: id + 1, amount: 2000, updated_at: '9999' },
      { ...base, id: 20, description: 'Void', status: 'void' },
      { ...base, id: 21, description: 'Loan', loan_id: 7 },
      { ...base, id: 22, description: 'Unavailable', account_id: 999 },
      {
        ...base,
        id: 23,
        description: 'Wrong category',
        category_id: s.categories.find((c) => c.type === 'income').id,
      },
    ];
    const templates = recentEntryTemplates(history, s.accounts, s.categories, 'expense');
    assert.equal(templates.length, 1);
    assert.equal(templates[0].amount, 2000);
    assert.equal(
      recentEntryTemplates(
        history,
        s.accounts.map((a) => ({ ...a, archived: 1 })),
        s.categories,
        'expense'
      ).length,
      0
    );
    assert.equal(
      recentEntryTemplates(
        history,
        s.accounts,
        s.categories.map((c) => ({ ...c, archived: 1 })),
        'expense'
      ).length,
      0
    );
    assert.equal(recentEntryTemplates(history, s.accounts, s.categories, 'income').length, 0);
    assert.equal(recentEntryTemplates(history, s.accounts, s.categories, 'expense', 999).length, 0);
    const next = entryFromTemplate(
      { ...templates[0], notes: 'Private old memo', receipt_count: 2 },
      '2026-10-12'
    );
    assert.equal(next.amount, '20.00');
    assert.equal(next.date, '2026-10-12');
    assert.equal(next.notes, '');
    assert.equal(next.receipt_count, undefined);
    assert.equal(next.id, undefined);
  } finally {
    n.close();
  }
});
test('recent transfers require active distinct destinations and card purchases stay eligible', async () => {
  const { n, r, input } = await fixture();
  try {
    await r.saveTransaction(input);
    const s = await r.snapshot(),
      base = s.transactions[0];
    const card = { ...s.accounts[0], id: 2, kind: 'liability', subtype: 'credit_card' };
    const loan = { ...card, id: 3, subtype: 'loan_borrowed' };
    const accounts = [...s.accounts, card, loan];
    assert.equal(
      recentEntryTemplates([{ ...base, account_id: card.id }], accounts, s.categories, 'expense')
        .length,
      1
    );
    assert.equal(
      recentEntryTemplates([{ ...base, account_id: loan.id }], accounts, s.categories, 'expense')
        .length,
      0
    );
    const transfer = {
      ...base,
      type: 'transfer',
      category_id: null,
      destination_account_id: card.id,
    };
    assert.equal(recentEntryTemplates([transfer], accounts, s.categories, 'transfer').length, 1);
    for (const destination of [null, 999, base.account_id, loan.id])
      assert.equal(
        recentEntryTemplates(
          [{ ...transfer, destination_account_id: destination }],
          accounts,
          s.categories,
          'transfer'
        ).length,
        0
      );
    assert.equal(
      recentEntryTemplates(
        [transfer],
        accounts.map((a) => (a.id === card.id ? { ...a, archived: 1 } : a)),
        s.categories,
        'transfer'
      ).length,
      0
    );
    assert.equal(
      recentEntryTemplates(
        [transfer],
        accounts.map((a) => (a.id === card.id ? { ...a, currency: 'USD' } : a)),
        s.categories,
        'transfer'
      ).length,
      0
    );
    assert.equal(
      recentEntryTemplates(
        Array.from({ length: 12 }, (_, i) => ({
          ...base,
          id: i + 10,
          description: `Merchant ${i}`,
        })),
        accounts,
        s.categories,
        'expense'
      ).length,
      6
    );
  } finally {
    n.close();
  }
});
