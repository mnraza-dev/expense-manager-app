/* global __dirname */
// Synthetic financial datasets only. Run npm test first to compile the repositories.
const fs = require('node:fs'),
  path = require('node:path'),
  os = require('node:os');
const { DatabaseSync } = require('node:sqlite');
const { performance } = require('node:perf_hooks');
const { randomUUID } = require('node:crypto');
const { Buffer } = require('node:buffer');
const current = path.resolve(__dirname, '../.test-build');
const baselineAt = process.argv.indexOf('--baseline');
const baseline = baselineAt < 0 ? null : path.resolve(process.argv[baselineAt + 1]);
const outputAt = process.argv.indexOf('--output');
const output = outputAt < 0 ? null : path.resolve(process.argv[outputAt + 1]);
const { Repositories } = require(path.join(current, 'db/repositories.js'));
const { TABLES } = require(path.join(current, 'services/backup.js'));
const { uuidSQL } = require(path.join(current, 'cloud/localSchema.js'));
function adapter(n, stats) {
  return {
    execAsync: async (s) => n.exec(s),
    runAsync: async (s, ...p) => {
      stats.sql++;
      return n.prepare(s).run(...p);
    },
    getAllAsync: async (s, ...p) => {
      stats.sql++;
      const rows = n.prepare(s).all(...p);
      stats.rows += rows.length;
      return rows;
    },
    getFirstAsync: async (s, ...p) => {
      stats.sql++;
      const row = n.prepare(s).get(...p) ?? null;
      stats.rows += row ? 1 : 0;
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
async function seed(file, count) {
  const n = new DatabaseSync(file),
    stats = { sql: 0, rows: 0 },
    r = new Repositories(adapter(n, stats));
  await r.initialize();
  await r.saveAccount({
    name: 'Synthetic bank',
    type: 'bank',
    opening_balance: 0,
    description: '',
  });
  const references = await r.referenceSnapshot(),
    bank = references.accounts[0].id,
    cats = references.categories.filter((c) => c.type === 'expense');
  const tx = {
    type: 'expense',
    amount: 100,
    account_id: bank,
    destination_account_id: null,
    category_id: cats[0].id,
    description: 'Synthetic entry',
    date: '2026-10-01',
    notes: '',
  };
  await r.saveTransaction(tx);
  await r.saveTransaction({
    ...tx,
    amount: 200,
    splits: [
      { category_id: cats[0].id, amount: 100 },
      { category_id: cats[1].id, amount: 100 },
    ],
  });
  const accountLedger = n.prepare('SELECT id FROM ledger_accounts WHERE account_id=?').get(bank).id;
  const categoryLedger = n
    .prepare('SELECT id FROM ledger_accounts WHERE category_id=?')
    .get(cats[0].id).id;
  const secondLedger = n
    .prepare('SELECT id FROM ledger_accounts WHERE category_id=?')
    .get(cats[1].id).id;
  n.exec(`BEGIN;
    WITH RECURSIVE sequence(i) AS (VALUES(3) UNION ALL SELECT i+1 FROM sequence WHERE i<${count})
    INSERT INTO transactions(id,type,amount,account_id,category_id,description,date,notes,created_at,updated_at)
    SELECT i,'expense',100,${bank},${cats[0].id},'Synthetic expense '||(i%24),printf('2026-10-%02d',1+i%28),'','2026-10-01T00:00:00Z',printf('2026-10-%02dT00:%02d:00Z',1+i%28,i%60) FROM sequence;
    INSERT INTO expense_splits(transaction_id,category_id,amount) SELECT id,${cats[0].id},50 FROM transactions WHERE id>=3 AND id%10=0;
    INSERT INTO expense_splits(transaction_id,category_id,amount) SELECT id,${cats[1].id},50 FROM transactions WHERE id>=3 AND id%10=0;
    INSERT INTO ledger_journals(id,date,description,posting_key,transaction_id,kind,created_at,updated_at)
    SELECT id,date,description,'transaction:'||id||':v1',id,'expense',created_at,updated_at FROM transactions WHERE id>=3;
    INSERT INTO ledger_lines(journal_id,ledger_account_id,debit,credit,currency) SELECT id,${accountLedger},0,amount,'INR' FROM transactions WHERE id>=3;
    INSERT INTO ledger_lines(journal_id,ledger_account_id,debit,credit,currency) SELECT id,${categoryLedger},CASE WHEN id%10=0 THEN 50 ELSE amount END,0,'INR' FROM transactions WHERE id>=3;
    INSERT INTO ledger_lines(journal_id,ledger_account_id,debit,credit,currency) SELECT id,${secondLedger},50,0,'INR' FROM transactions WHERE id>=3 AND id%10=0;
    INSERT INTO transaction_journals SELECT id,id,1 FROM transactions WHERE id>=3;
    UPDATE ledger_journals SET status='posted' WHERE id>=3;
  COMMIT;`);
  // Model an established mapping set without network access or changing sync limits.
  for (const entity of TABLES) {
    const key =
      entity === 'app_settings'
        ? 'key'
        : entity === 'account_roles' || entity === 'credit_cards'
          ? 'CAST(account_id AS TEXT)'
          : entity === 'transaction_journals'
            ? "CAST(transaction_id AS TEXT)||':'||CAST(version AS TEXT)"
            : 'CAST(id AS TEXT)';
    n.exec(`INSERT INTO sync_mappings SELECT '${entity}',${key},${uuidSQL} FROM ${entity}`);
  }
  if (count === 1000) {
    const issues = await r.integrity();
    if (issues.length)
      throw new Error('Invalid synthetic financial fixture: ' + JSON.stringify(issues));
  }
  n.close();
  return { bank, category: cats[0].id };
}
async function measure(file, compiled, legacy, ids) {
  const n = new DatabaseSync(file),
    stats = { sql: 0, rows: 0 };
  if (legacy)
    n.exec(
      'DROP INDEX IF EXISTS ledger_lines_journal;DROP INDEX IF EXISTS transactions_entry_history;DROP INDEX IF EXISTS transactions_receipt_match;'
    );
  const { Repositories: Repository } = require(path.join(compiled, 'db/repositories.js'));
  const { withOutbox } = require(path.join(compiled, 'cloud/outbox.js'));
  const r = new Repository(withOutbox(adapter(n, stats)));
  await r.initialize();
  const snapshot = () => (legacy ? r.snapshot() : r.referenceSnapshot());
  const result = {};
  stats.sql = 0;
  stats.rows = 0;
  let start = performance.now();
  const data = await snapshot();
  result.startup_read = {
    ms: Math.round((performance.now() - start) * 10) / 10,
    sql: stats.sql,
    returned_rows: stats.rows,
    transaction_objects: (data.transactions ?? data.templates).length,
    json_bytes: Buffer.byteLength(JSON.stringify(data)),
  };
  const tx = {
    type: 'expense',
    amount: 100,
    account_id: ids.bank,
    destination_account_id: null,
    category_id: ids.category,
    description: 'Benchmark new entry',
    date: '2026-10-12',
    notes: '',
  };
  stats.sql = 0;
  stats.rows = 0;
  start = performance.now();
  await r.saveTransaction(tx);
  await snapshot();
  result.save_and_refresh = {
    ms: Math.round((performance.now() - start) * 10) / 10,
    sql: stats.sql,
    returned_rows: stats.rows,
  };
  n.prepare('UPDATE sync_config SET enabled=1,owner=? WHERE id=1').run(randomUUID());
  stats.sql = 0;
  stats.rows = 0;
  start = performance.now();
  await r.saveTransaction({ ...tx, description: 'Benchmark synced entry' });
  result.synced_save = {
    ms: Math.round((performance.now() - start) * 10) / 10,
    sql: stats.sql,
    returned_rows: stats.rows,
  };
  const payload = n.prepare('SELECT payload FROM sync_outbox ORDER BY rowid DESC LIMIT 1').get();
  result.outbox_changes = JSON.parse(payload.payload).changes.length;
  n.close();
  return result;
}
(async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'settler-performance-'));
  const versionDB = new DatabaseSync(':memory:');
  const sqliteVersion = versionDB.prepare('SELECT sqlite_version() version').get().version;
  versionDB.close();
  const report = {
    environment: `Node ${process.version} / SQLite ${sqliteVersion}`,
    scope:
      'Synthetic local repository timings; simulated established sync mappings, no network or device UI timings.',
    datasets: [],
  };
  try {
    for (const count of [1000, 10000, 50000]) {
      const seedFile = path.join(temp, `seed-${count}.db`),
        ids = await seed(seedFile, count),
        row = { transactions: count };
      if (baseline) {
        const file = path.join(temp, `baseline-${count}.db`);
        fs.copyFileSync(seedFile, file);
        row.before = await measure(file, baseline, true, ids);
      }
      const file = path.join(temp, `optimized-${count}.db`);
      fs.copyFileSync(seedFile, file);
      row.after = await measure(file, current, false, ids);
      report.datasets.push(row);
      process.stdout.write(JSON.stringify(row) + '\n');
    }
    if (output) fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
})().catch((error) => {
  process.stderr.write(error.stack + '\n');
  process.exitCode = 1;
});
