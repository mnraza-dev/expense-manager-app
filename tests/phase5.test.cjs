const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { readFileSync, readdirSync } = require('node:fs');
const { randomUUID } = require('node:crypto');
const { PGlite } = require('@electric-sql/pglite');
const { Repositories } = require('../.test-build/db/repositories.js');
const { withOutbox } = require('../.test-build/cloud/outbox.js');
const { validateBackup } = require('../.test-build/services/backup.js');
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
async function device() {
  const n = new DatabaseSync(':memory:'),
    r = new Repositories(withOutbox(adapter(n)));
  await r.initialize();
  await r.saveAccount({ name: 'Bank', type: 'bank', opening_balance: 100000, description: '' });
  const s = await r.snapshot();
  const bank = s.accounts[0].id,
    expense = s.categories.find((c) => c.type === 'expense').id;
  const tx = (amount = 500) => ({
    type: 'expense',
    amount,
    account_id: bank,
    destination_account_id: null,
    category_id: expense,
    date: localDate(),
    description: 'Synthetic expense',
    notes: '',
  });
  return { n, r, bank, expense, tx };
}
async function backend() {
  const pg = new PGlite();
  await pg.exec(
    `create role authenticated;create role anon;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit integer,allowed_mime_types text[]);create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;create function storage.foldername(name text) returns text[] language sql immutable as $$select string_to_array(name,'/')$$;grant usage on schema auth,storage,public to authenticated,anon;grant select,insert on storage.objects to authenticated;`
  );
  for (const file of readdirSync('supabase/migrations').sort())
    await pg.exec(readFileSync('supabase/migrations/' + file, 'utf8'));
  return pg;
}
async function user(pg, owner) {
  await pg.exec('reset role');
  await pg.query('insert into auth.users(id) values($1) on conflict do nothing', [owner]);
  await pg.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
  await pg.exec('set role authenticated');
}
async function apply(pg, op) {
  return (await pg.query('select public.apply_sync($1::jsonb) result', [JSON.stringify(op)]))
    .rows[0].result;
}
async function snapshot(pg) {
  return (await pg.query('select public.cloud_snapshot(0) result')).rows[0].result;
}
async function flush(pg, device, owner) {
  for (;;) {
    const op = await device.r.nextOperation(owner);
    if (!op) break;
    const receipt = await apply(pg, op);
    if (receipt.status === 'conflict') {
      await device.r.syncConflict(op, receipt.conflict_id);
      return receipt;
    }
    await device.r.acknowledge(op, receipt.revision);
  }
  const remote = await snapshot(pg);
  await device.r.applyRemote(remote.records, remote.revision, owner, false);
  return remote;
}
test('local changes and outbox commit atomically; disabled cloud leaves offline finance usable', async () => {
  const d = await device(),
    owner = randomUUID();
  await d.r.saveTransaction(d.tx());
  assert.equal((await d.r.syncState()).pending, 0);
  await d.r.enableSync(owner);
  const first = await d.r.nextOperation(owner);
  assert.ok(first.changes.every((c) => c.expected_revision === 0));
  await d.r.acknowledge(first, 1);
  await d.r.saveTransaction(d.tx(1234));
  assert.equal((await d.r.syncState()).pending, 1);
  const pending = await d.r.nextOperation(owner);
  assert.ok(pending.changes.some((c) => c.entity === 'ledger_journals'));
  assert.ok(pending.changes.some((c) => c.entity === 'ledger_lines'));
  assert.ok(pending.changes.some((c) => c.entity === 'transactions'));
  assert.deepEqual(await d.r.nextOperation(owner), pending);
  const before = (await d.r.snapshot()).transactions.length;
  d.n.exec(
    "CREATE TRIGGER fail_outbox BEFORE INSERT ON sync_outbox BEGIN SELECT RAISE(ABORT,'outbox fault');END;"
  );
  await assert.rejects(d.r.saveTransaction(d.tx(2345)), /outbox fault/);
  assert.equal((await d.r.snapshot()).transactions.length, before);
  d.n.exec('DROP TRIGGER fail_outbox');
  await assert.rejects(d.r.enableSync(randomUUID()), /another cloud/);
  d.n.close();
});
test('PostgreSQL migrations, idempotency, multi-device merge, revisions, conflicts and accounting integrity', async () => {
  const pg = await backend(),
    owner = randomUUID(),
    a = await device(),
    b = await device();
  try {
    await user(pg, owner);
    await a.r.enableSync(owner);
    let op = await a.r.nextOperation(owner);
    const receipt = await apply(pg, op);
    assert.equal(receipt.status, 'applied', JSON.stringify(receipt));
    assert.deepEqual(await apply(pg, op), receipt);
    await a.r.acknowledge(op, receipt.revision);
    const initial = await snapshot(pg);
    assert.equal(initial.record_count, op.changes.length);
    await a.r.applyRemote(initial.records, initial.revision, owner, false);
    await b.r.applyRemote(initial.records, initial.revision, owner, true, async () => {});
    const bankB = (await b.r.snapshot()).accounts[0].id,
      expenseB = (await b.r.snapshot()).categories.find((c) => c.type === 'expense').id;
    await a.r.saveTransaction(a.tx(1000));
    await b.r.saveTransaction({ ...b.tx(2000), account_id: bankB, category_id: expenseB });
    assert.notEqual((await a.r.nextOperation(owner)).id, (await b.r.nextOperation(owner)).id);
    assert.equal((await flush(pg, a, owner)).schema_version, 4);
    assert.equal((await flush(pg, b, owner)).schema_version, 4);
    await flush(pg, a, owner);
    assert.equal((await a.r.snapshot()).transactions.length, 2);
    assert.equal((await b.r.snapshot()).transactions.length, 2);
    assert.deepEqual(await a.r.integrity(), []);
    assert.deepEqual(await b.r.integrity(), []);
    const at = (await a.r.snapshot()).transactions[0],
      bt = (await b.r.snapshot()).transactions.find((t) => t.amount === at.amount);
    await a.r.saveTransaction({ ...at, amount: at.amount + 100 }, at.id);
    await b.r.saveTransaction({ ...bt, amount: bt.amount + 200 }, bt.id);
    await flush(pg, a, owner);
    const conflict = await flush(pg, b, owner);
    assert.equal(conflict.status, 'conflict');
    assert.equal(conflict.reason, 'revision_conflict');
    assert.equal((await b.r.syncState()).conflicts.length, 1);
    assert.equal(
      (await b.r.snapshot()).transactions.find((t) => t.id === bt.id).amount,
      bt.amount + 200
    );
    const current = await snapshot(pg);
    let recovery;
    await b.r.applyRemote(current.records, current.revision, owner, true, async (text) => {
      recovery = text;
    });
    assert.equal(
      validateBackup(recovery).payload.tables.transactions.find((t) => t.id === bt.id).amount,
      bt.amount + 200
    );
    assert.deepEqual(await b.r.integrity(), []);
  } finally {
    a.n.close();
    b.n.close();
    await pg.close();
  }
});
test('RLS isolates records, references, operations, entitlements and private storage', async () => {
  const pg = await backend(),
    a = await device(),
    owner = randomUUID(),
    other = randomUUID();
  try {
    await user(pg, owner);
    await a.r.enableSync(owner);
    const op = await a.r.nextOperation(owner);
    assert.equal((await apply(pg, op)).status, 'applied');
    const before = await snapshot(pg);
    const backupId = randomUUID();
    const path = (
      await pg.query('select public.begin_cloud_backup($1,$2,$3,10,$4,4) path', [
        backupId,
        randomUUID(),
        'a'.repeat(64),
        '1.0.0',
      ])
    ).rows[0].path;
    await pg.query("insert into storage.objects(bucket_id,name) values('finance-backups',$1)", [
      path,
    ]);
    await user(pg, other);
    assert.equal((await pg.query('select * from public.cloud_records')).rows.length, 0);
    assert.equal((await pg.query('select * from public.cloud_backups')).rows.length, 0);
    assert.equal((await pg.query('select * from storage.objects')).rows.length, 0);
    await assert.rejects(
      pg.query(
        "insert into public.cloud_entitlements(owner_id,name,active) values($1,'cloud_backup',true)",
        [other]
      )
    );
    await assert.rejects(
      pg.query("insert into storage.objects(bucket_id,name) values('finance-backups',$1)", [path])
    );
    const stolen = {
      id: randomUUID(),
      schema_version: 4,
      changes: [
        {
          ...op.changes.find((c) => c.entity === 'account_roles'),
          id: randomUUID(),
          expected_revision: 0,
        },
      ],
    };
    const conflict = await apply(pg, stolen);
    assert.equal(conflict.status, 'conflict');
    assert.equal(conflict.reason, 'invalid_reference');
    await user(pg, owner);
    assert.equal((await snapshot(pg)).record_count, before.record_count);
    await pg.exec('reset role;set role anon');
    await assert.rejects(pg.query('select * from public.cloud_records'));
    await assert.rejects(pg.query('select public.cloud_snapshot(0)'));
  } finally {
    a.n.close();
    await pg.close();
  }
});
test('server entitlements reject client premium flags and preserve recovery reads after expiration', async () => {
  const pg = await backend(),
    owner = randomUUID();
  try {
    await user(pg, owner);
    assert.equal(
      (await pg.query("select public.cloud_allowed('cloud_backup') allowed")).rows[0].allowed,
      true
    );
    await pg.exec('reset role;update public.cloud_policy set free_cloud=false');
    await pg.query(
      "insert into public.cloud_entitlements(owner_id,name,active,expires_at) values($1,'cloud_backup',true,now()-interval '1 minute')",
      [owner]
    );
    await user(pg, owner);
    assert.equal(
      (await pg.query("select public.cloud_allowed('cloud_backup') allowed")).rows[0].allowed,
      false
    );
    await assert.rejects(
      pg.query('select public.begin_cloud_backup($1,$2,$3,10,$4,4)', [
        randomUUID(),
        randomUUID(),
        'a'.repeat(64),
        '1.0.0',
      ])
    );
    assert.equal((await snapshot(pg)).record_count, 0);
  } finally {
    await pg.close();
  }
});
