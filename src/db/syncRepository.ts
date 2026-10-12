import { PlanningRepository } from './planningRepository';
import { readDataset, mapDataset } from '../cloud/outbox';
import {
  canonicalize,
  materialize,
  type CanonicalRecord,
  type Mapping,
  type Operation,
} from '../cloud/model';
import { uuidSQL } from '../cloud/localSchema';
import { serializeBackup, validateBackup } from '../services/backup';
import { migrations } from './migrations';
export class SyncRepository extends PlanningRepository {
  markSyncSuccess(checkpoint: number) {
    return this.write(() =>
      this.db.runAsync(
        'UPDATE sync_config SET checkpoint=?,last_success=? WHERE id=1',
        checkpoint,
        new Date().toISOString()
      )
    );
  }
  syncState() {
    return this.read(async () => ({
      config: await this.db.getFirstAsync<{
        owner: string | null;
        enabled: number;
        checkpoint: number;
        last_success: string | null;
      }>('SELECT * FROM sync_config WHERE id=1'),
      pending: (await this.db.getFirstAsync<{ n: number }>('SELECT count(*) n FROM sync_outbox'))!
        .n,
      conflicts: await this.db.getAllAsync<{
        id: string;
        operation_id: string;
        proposal: string;
        created_at: string;
      }>('SELECT * FROM sync_conflicts ORDER BY created_at'),
    }));
  }
  enableSync(owner: string) {
    return this.write(() =>
      this.db.withTransactionAsync(async () => {
        const config = await this.db.getFirstAsync<{ owner: string | null; enabled: number }>(
          'SELECT owner,enabled FROM sync_config WHERE id=1'
        );
        if (config?.owner && config.owner !== owner)
          throw new Error(
            'This local dataset belongs to another cloud account. Sign into that account or explicitly restore the new account cloud data.'
          );
        if (config?.owner === owner && config.enabled) return;
        if ((await this.integrityCore()).length)
          throw new Error('Resolve local integrity issues before synchronization.');
        const dataset = await readDataset(this.db),
          mappings = await mapDataset(this.db, dataset);
        const changes = Object.entries(dataset).flatMap(([entity, rows]) =>
          rows.map((row) => ({
            id: mappings.find(
              (m) =>
                m.entity === entity &&
                m.local_key ===
                  (entity === 'app_settings'
                    ? String(row.key)
                    : entity === 'account_roles' || entity === 'credit_cards'
                      ? String(row.account_id)
                      : entity === 'transaction_journals'
                        ? `${row.transaction_id}:${row.version}`
                        : String(row.id))
            )!.global_id,
            entity,
            data: canonicalize(entity as Mapping['entity'], row, mappings),
            deleted: false,
            expected_revision: 0,
          }))
        );
        if (changes.length > 10000)
          throw new Error(
            'Initial sync supports up to 10,000 records. Use cloud backup for larger datasets.'
          );
        const id = (await this.db.getFirstAsync<{ id: string }>(`SELECT ${uuidSQL} id`))!.id;
        await this.db.runAsync('UPDATE sync_config SET owner=?,enabled=1 WHERE id=1', owner);
        await this.db.runAsync(
          'INSERT INTO sync_outbox(id,owner,payload,created_at) VALUES(?,?,?,?)',
          id,
          owner,
          JSON.stringify({ id, changes, schema_version: 5 }),
          new Date().toISOString()
        );
      })
    );
  }
  nextOperation(owner: string) {
    return this.read(async () => {
      const config = await this.db.getFirstAsync<{ owner: string | null; enabled: number }>(
        'SELECT * FROM sync_config WHERE id=1'
      );
      if (config?.owner !== owner || !config.enabled)
        throw new Error('Sync is not enabled for this account.');
      const row = await this.db.getFirstAsync<{ payload: string; status: string }>(
        'SELECT * FROM sync_outbox ORDER BY created_at,rowid LIMIT 1'
      );
      if (!row) return null;
      if (row.status === 'conflict')
        throw new Error('A financial conflict requires review before syncing.');
      const op = JSON.parse(row.payload) as Operation;
      for (const c of op.changes)
        if (c.expected_revision === -1) {
          const remote = await this.db.getFirstAsync<{ revision: number }>(
            'SELECT revision FROM sync_remote WHERE id=?',
            c.id
          );
          c.expected_revision = remote?.revision ?? 0;
        }
      // Freeze resolved revisions before network work. Retries reuse this exact payload.
      await this.db.runAsync(
        'UPDATE sync_outbox SET payload=?,attempts=attempts+1 WHERE id=?',
        JSON.stringify(op),
        op.id
      );
      return op;
    });
  }
  acknowledge(op: Operation, revision: number) {
    return this.write(() =>
      this.db.withTransactionAsync(async () => {
        for (const c of op.changes)
          await this.db.runAsync(
            'INSERT INTO sync_remote(id,entity,data,revision,deleted) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,revision=excluded.revision,deleted=excluded.deleted',
            c.id,
            c.entity,
            c.data ? JSON.stringify(c.data) : null,
            revision,
            c.deleted ? 1 : 0
          );
        await this.db.runAsync('DELETE FROM sync_outbox WHERE id=?', op.id);
      })
    );
  }
  syncConflict(op: Operation, id: string) {
    return this.write(() =>
      this.db.withTransactionAsync(async () => {
        await this.db.runAsync(
          "UPDATE sync_outbox SET status='conflict',error_code='revision_conflict' WHERE id=?",
          op.id
        );
        await this.db.runAsync(
          'INSERT OR IGNORE INTO sync_conflicts VALUES(?,?,?,?)',
          id,
          op.id,
          JSON.stringify(op),
          new Date().toISOString()
        );
      })
    );
  }
  detachSync() {
    return this.write(() =>
      this.db.withTransactionAsync(async () => {
        await this.db.runAsync(
          'UPDATE sync_config SET enabled=0,owner=NULL,checkpoint=0,last_success=NULL WHERE id=1'
        );
        await this.db.execAsync(
          'DELETE FROM sync_outbox;DELETE FROM sync_dirty;DELETE FROM sync_conflicts;DELETE FROM sync_remote;DELETE FROM sync_mappings;'
        );
      })
    );
  }
  private async rebuildCore(records: CanonicalRecord[], checkpoint: number, owner: string) {
    const result = materialize(
      records,
      await this.db.getAllAsync<Mapping>('SELECT * FROM sync_mappings')
    );
    const backup = validateBackup(serializeBackup(result.tables));
    await this.db.runAsync('UPDATE sync_config SET applying=1 WHERE id=1');
    for (const table of Object.keys(result.tables).reverse())
      await this.db.execAsync(`DROP TABLE ${table}`);
    await this.db.execAsync(
      'DROP VIEW IF EXISTS expected_transaction_lines; DROP VIEW IF EXISTS category_activity; DROP VIEW active_transactions'
    );
    for (const migration of migrations) await this.db.execAsync(migration);
    await this.importCore(backup);
    await this.db.execAsync(
      'DELETE FROM sync_mappings;DELETE FROM sync_remote;DELETE FROM sync_dirty;'
    );
    for (const mapping of result.mappings)
      await this.db.runAsync(
        'INSERT INTO sync_mappings VALUES(?,?,?)',
        mapping.entity,
        mapping.local_key,
        mapping.global_id
      );
    for (const entity of Object.keys(result.tables)) {
      const ids = result.mappings.filter((m) => m.entity === entity && /^\d+$/.test(m.local_key));
      const info = await this.db.getAllAsync<{ name: string }>(`PRAGMA table_info(${entity})`);
      if (info.some((c) => c.name === 'id') && ids.length) {
        const max = Math.max(...ids.map((m) => Number(m.local_key)));
        const seq = await this.db.getFirstAsync(
          'SELECT name FROM sqlite_sequence WHERE name=?',
          entity
        );
        if (seq)
          await this.db.runAsync(
            'UPDATE sqlite_sequence SET seq=MAX(seq,?) WHERE name=?',
            max,
            entity
          );
        else
          await this.db.runAsync('INSERT INTO sqlite_sequence(name,seq) VALUES(?,?)', entity, max);
      }
    }
    for (const r of records)
      await this.db.runAsync(
        'INSERT INTO sync_remote VALUES(?,?,?,?,?)',
        r.id,
        r.entity,
        r.data ? JSON.stringify(r.data) : null,
        r.revision,
        r.deleted ? 1 : 0
      );
    await this.db.runAsync(
      'UPDATE sync_config SET owner=?,enabled=1,applying=0,checkpoint=?,last_success=? WHERE id=1',
      owner,
      checkpoint,
      new Date().toISOString()
    );
  }
  applyRemote(
    records: CanonicalRecord[],
    checkpoint: number,
    owner: string,
    replace: boolean,
    saveRecovery?: (text: string) => Promise<void>
  ) {
    return this.write(async () => {
      const config = await this.db.getFirstAsync<{ owner: string | null }>(
        'SELECT * FROM sync_config WHERE id=1'
      );
      if (!replace && config?.owner !== owner)
        throw new Error('Cloud account changed; sync was stopped.');
      if (
        !replace &&
        (await this.db.getFirstAsync<{ n: number }>('SELECT count(*) n FROM sync_outbox'))!.n
      )
        throw new Error(
          'Local changes are still pending. Retry upload before applying cloud data.'
        );
      if (replace) {
        if (!saveRecovery)
          throw new Error('A recoverable copy is required before replacing local data.');
        await saveRecovery(serializeBackup(await this.datasetCore()));
      }
      await this.db.execAsync('PRAGMA foreign_keys=OFF');
      try {
        await this.db.withTransactionAsync(async () => {
          if (replace)
            await this.db.execAsync(
              'DELETE FROM sync_outbox;DELETE FROM sync_conflicts;DELETE FROM sync_mappings;'
            );
          const shadow = replace
            ? []
            : await this.db.getAllAsync<{
                id: string;
                entity: Mapping['entity'];
                data: string | null;
                revision: number;
                deleted: number;
              }>('SELECT * FROM sync_remote');
          const map = new Map<string, CanonicalRecord>(
            shadow.map((r) => [
              r.id,
              { ...r, data: r.data ? JSON.parse(r.data) : null, deleted: !!r.deleted },
            ])
          );
          for (const record of records) map.set(record.id, record);
          await this.rebuildCore([...map.values()], checkpoint, owner);
        });
      } finally {
        await this.db.execAsync('PRAGMA foreign_keys=ON');
      }
    });
  }
  canonicalSnapshot() {
    return this.read(async () => {
      const data = await readDataset(this.db),
        mappings = await mapDataset(this.db, data);
      return Object.entries(data).flatMap(([entity, rows]) =>
        rows.map((row) => {
          const mapped = canonicalize(entity as Mapping['entity'], row, mappings);
          const key =
            entity === 'app_settings'
              ? String(row.key)
              : entity === 'account_roles' || entity === 'credit_cards'
                ? String(row.account_id)
                : entity === 'transaction_journals'
                  ? `${row.transaction_id}:${row.version}`
                  : String(row.id);
          return {
            id: mappings.find((m) => m.entity === entity && m.local_key === key)!.global_id,
            entity,
            data: mapped,
          };
        })
      );
    });
  }
}
