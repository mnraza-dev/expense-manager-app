import { openDatabaseAsync } from 'expo-sqlite';
import { Repositories } from './repositories';
let repository: Repositories | undefined;
export async function initializeDatabase() {
  if (!repository) repository = new Repositories(await openDatabaseAsync('pocketbook.db'));
  await repository.initialize();
  return repository;
}
export function repo() {
  if (!repository) throw new Error('Database is not ready.');
  return repository;
}
