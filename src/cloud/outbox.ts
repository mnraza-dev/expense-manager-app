import { digest } from '../security/crypto';
import type { DB } from '../db/adapter';
import { TABLES, type Dataset, type Table, type Row } from '../services/backup';
import {
  canonicalize,
  references,
  localKey,
  type Mapping,
  type Change,
  type Operation,
} from './model';
import { uuidSQL } from './localSchema';
export async function readDataset(db: DB) {
  const data = {} as Dataset;
  for (const t of TABLES) data[t] = await db.getAllAsync<Row>(`SELECT * FROM ${t}`);
  return data;
}
const mappingKey = (entity: Table, key: string) => entity + '\0' + key;
function stableLedgerId(parentId: string) {
  const hex = digest('pocketbook-ledger:' + parentId).slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20)}`;
}
export async function mapDataset(db: DB, data: Dataset) {
  const mappings = await db.getAllAsync<Mapping>('SELECT * FROM sync_mappings');
  const index = new Map(mappings.map((m) => [mappingKey(m.entity, m.local_key), m]));
  for (const entity of TABLES)
    for (const row of data[entity]) {
      const key = localKey(entity, row);
      if (index.has(mappingKey(entity, key))) continue;
      let id: string;
      if (entity === 'ledger_accounts' && (row.account_id !== null || row.category_id !== null)) {
        const parent = row.account_id !== null ? 'accounts' : 'categories';
        const m = index.get(mappingKey(parent, String(row.account_id ?? row.category_id)));
        if (!m) throw new Error('Missing ledger parent mapping.');
        id = stableLedgerId(m.global_id);
      } else id = (await db.getFirstAsync<{ id: string }>(`SELECT ${uuidSQL} id`))!.id;
      const mapping = { entity, local_key: key, global_id: id };
      await db.runAsync('INSERT INTO sync_mappings VALUES(?,?,?)', entity, key, id);
      mappings.push(mapping);
      index.set(mappingKey(entity, key), mapping);
    }
  return mappings;
}
function rowQuery(entity: Table, key: string): { sql: string; params: (string | number)[] } {
  if (!TABLES.includes(entity)) throw new Error('Unsupported outbox entity.');
  if (entity === 'app_settings')
    return { sql: 'SELECT * FROM app_settings WHERE key=?', params: [key] };
  if (entity === 'transaction_journals') {
    if (!/^\d+:\d+$/.test(key)) throw new Error('Invalid transaction journal mapping.');
    return {
      sql: 'SELECT * FROM transaction_journals WHERE transaction_id=? AND version=?',
      params: key.split(':'),
    };
  }
  if (!/^\d+$/.test(key)) throw new Error('Invalid record mapping.');
  const primary = entity === 'account_roles' || entity === 'credit_cards' ? 'account_id' : 'id';
  return { sql: `SELECT * FROM ${entity} WHERE ${primary}=?`, params: [key] };
}
export async function captureOutbox(db: DB) {
  if (!(await db.getFirstAsync("SELECT name FROM sqlite_master WHERE name='sync_config'"))) return;
  const config = await db.getFirstAsync<{
    owner: string | null;
    enabled: number;
    applying: number;
  }>('SELECT * FROM sync_config WHERE id=1');
  if (!config?.enabled || config.applying || !config.owner) return;
  const dirty = await db.getAllAsync<{ entity: Table; local_key: string; deleted: number }>(
    'SELECT * FROM sync_dirty'
  );
  if (!dirty.length) return;
  const rows = new Map<string, Row | null>(),
    mappings = new Map<string, Mapping>();
  const readRow = async (entity: Table, key: string) => {
    const cacheKey = mappingKey(entity, key);
    if (rows.has(cacheKey)) return rows.get(cacheKey)!;
    const query = rowQuery(entity, key),
      row = await db.getFirstAsync<Row>(query.sql, ...query.params);
    rows.set(cacheKey, row);
    return row;
  };
  const ensureMapping = async (
    entity: Table,
    key: string,
    row?: Row | null,
    deleted = false
  ): Promise<Mapping> => {
    const cacheKey = mappingKey(entity, key);
    const cached = mappings.get(cacheKey);
    if (cached) return cached;
    let mapping = await db.getFirstAsync<Mapping>(
      'SELECT * FROM sync_mappings WHERE entity=? AND local_key=?',
      entity,
      key
    );
    if (!mapping) {
      const source = row === undefined ? await readRow(entity, key) : row;
      if (!source && !deleted) throw new Error('Missing outbox reference.');
      let id: string;
      if (
        entity === 'ledger_accounts' &&
        source &&
        (source.account_id !== null || source.category_id !== null)
      ) {
        const parent = source.account_id !== null ? 'accounts' : 'categories';
        id = stableLedgerId(
          (await ensureMapping(parent, String(source.account_id ?? source.category_id))).global_id
        );
      } else id = (await db.getFirstAsync<{ id: string }>(`SELECT ${uuidSQL} id`))!.id;
      await db.runAsync('INSERT INTO sync_mappings VALUES(?,?,?)', entity, key, id);
      mapping = { entity, local_key: key, global_id: id };
    }
    mappings.set(cacheKey, mapping);
    return mapping;
  };
  for (const d of dirty) {
    const row = await readRow(d.entity, d.local_key);
    await ensureMapping(d.entity, d.local_key, row, !row);
  }
  for (const d of dirty) {
    const row = rows.get(mappingKey(d.entity, d.local_key));
    if (!row) continue;
    for (const [column, target] of Object.entries(references[d.entity] ?? {})) {
      if (
        row[column] === null ||
        (d.entity === 'loan_schedules' && column === 'payment_id_baseline' && row[column] === 0)
      )
        continue;
      await ensureMapping(target, String(row[column]));
    }
    if (d.entity === 'ledger_journals') {
      const match = /^(transaction|opening|reverse):(\d+)(.*)$/.exec(String(row.posting_key));
      if (match)
        await ensureMapping(
          match[1] === 'transaction'
            ? 'transactions'
            : match[1] === 'opening'
              ? 'accounts'
              : 'ledger_journals',
          match[2]
        );
    }
  }
  const ids = dirty.map((d) => mappings.get(mappingKey(d.entity, d.local_key))!.global_id);
  const revisions = new Map<string, number>(),
    pending = new Set<string>();
  for (let i = 0; i < ids.length; i += 900) {
    const batch = ids.slice(i, i + 900),
      placeholders = batch.map(() => '?').join(',');
    for (const r of await db.getAllAsync<{ id: string; revision: number }>(
      `SELECT id,revision FROM sync_remote WHERE id IN (${placeholders})`,
      ...batch
    ))
      revisions.set(r.id, r.revision);
    for (const r of await db.getAllAsync<{ id: string }>(
      `SELECT DISTINCT json_extract(c.value,'$.id') id FROM sync_outbox o,json_each(o.payload,'$.changes') c WHERE json_extract(c.value,'$.id') IN (${placeholders})`,
      ...batch
    ))
      pending.add(r.id);
  }
  const resolve = (entity: Table, key: string) => {
    const m = mappings.get(mappingKey(entity, key));
    if (!m) throw new Error('Missing stable outbox mapping.');
    return m.global_id;
  };
  const changes: Change[] = dirty.map((d) => {
    const id = resolve(d.entity, d.local_key),
      row = rows.get(mappingKey(d.entity, d.local_key));
    return {
      id,
      entity: d.entity,
      data: row ? canonicalize(d.entity, row, resolve) : null,
      deleted: !row,
      expected_revision: pending.has(id) ? -1 : (revisions.get(id) ?? 0),
    };
  });
  const id = (await db.getFirstAsync<{ id: string }>(`SELECT ${uuidSQL} id`))!.id;
  const op: Operation = { id, changes, schema_version: 5 };
  await db.runAsync(
    'INSERT INTO sync_outbox(id,owner,payload,created_at) VALUES(?,?,?,?)',
    id,
    config.owner,
    JSON.stringify(op),
    new Date().toISOString()
  );
  await db.runAsync('DELETE FROM sync_dirty');
}
// Only outer SQLite transactions capture deltas. All writes and outbox state commit together.
export function withOutbox(db: DB): DB {
  let depth = 0;
  const wrapped: DB = {
    execAsync: (s) => db.execAsync(s),
    getAllAsync: (s, ...p) => db.getAllAsync(s, ...p),
    getFirstAsync: (s, ...p) => db.getFirstAsync(s, ...p),
    runAsync: async (s, ...p) => {
      if (depth) return db.runAsync(s, ...p);
      let result: unknown;
      await wrapped.withTransactionAsync(async () => {
        result = await db.runAsync(s, ...p);
      });
      return result;
    },
    withTransactionAsync: async (task) => {
      if (depth) {
        await task();
        return;
      }
      await db.withTransactionAsync(async () => {
        depth++;
        try {
          await task();
          await captureOutbox(db);
        } finally {
          depth--;
        }
      });
    },
  };
  return wrapped;
}
