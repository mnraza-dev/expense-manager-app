import { openDatabaseAsync, backupDatabaseAsync } from 'expo-sqlite';
import { withOutbox } from '../cloud/outbox';
import { migrations } from './migrations';
import { Repositories } from './repositories';
let repository: Repositories | undefined;
export async function initializeDatabase() {
  if (!repository) {
    const database = await openDatabaseAsync('pocketbook.db');
    try {
      const exists = await database.getFirstAsync(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='accounts'"
      );
      if (exists) {
        const versionTable = await database.getFirstAsync(
          "SELECT name FROM sqlite_master WHERE name='schema_migrations'"
        );
        if (!versionTable) throw new Error('Unversioned database: preserve the file for recovery.');
        const version = await database.getFirstAsync<{ version: number }>(
          'SELECT COALESCE(MAX(version),0) version FROM schema_migrations'
        );
        if ((version?.version ?? 0) < migrations.length) {
          const recovery = await openDatabaseAsync(`pocketbook-pre-migration-${Date.now()}.db`);
          try {
            await backupDatabaseAsync({ sourceDatabase: database, destDatabase: recovery });
          } finally {
            await recovery.closeAsync();
          }
        }
      }
      repository = new Repositories(withOutbox(database));
    } catch (error) {
      await database.closeAsync();
      throw error;
    }
  }
  await repository.initialize();
  return repository;
}
export function repo() {
  if (!repository) throw new Error('Database is not ready.');
  return repository;
}
