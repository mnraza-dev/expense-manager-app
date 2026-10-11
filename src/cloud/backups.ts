import * as Crypto from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import { utf8ToBytes } from '@noble/hashes/utils.js';
import { cloudClient } from './client';
import { verifiedOwner } from './auth';
import { requireFeature } from './entitlements';
import { repo } from '../db/database';
import { digest } from '../security/crypto';
import { validateBackup } from '../services/backup';
import { prepareBackup, replaceFromBackup } from '../services/files';
import { useFinance } from '../store/useFinance';
export type CloudBackup = {
  id: string;
  owner_id: string;
  created_at: string;
  verified_at: string | null;
  schema_version: number;
  app_version: string;
  status: 'pending' | 'verified';
  object_path: string;
  sha256: string;
  byte_size: number;
};
export async function listCloudBackups() {
  const owner = await verifiedOwner();
  const response = await cloudClient()
    .from('cloud_backups')
    .select('*')
    .eq('owner_id', owner)
    .order('created_at', { ascending: false });
  if (response.error)
    throw new Error('Could not list cloud backups. Check your session and connection.');
  return response.data as CloudBackup[];
}
export async function createCloudBackup() {
  const owner = await verifiedOwner();
  await requireFeature('cloud_backup');
  if ((await repo().integrity()).length)
    throw new Error('Resolve local integrity issues before cloud backup.');
  const text = await repo().backup(),
    backup = validateBackup(text),
    id = Crypto.randomUUID(),
    bytes = utf8ToBytes(text);
  const client = cloudClient();
  const manifest = await client.rpc('begin_cloud_backup', {
    backup_id: id,
    snapshot_id: Crypto.randomUUID(),
    checksum: digest(text),
    bytes: bytes.length,
    app_version: backup.payload.appVersion,
    schema_version: backup.payload.schemaVersion,
  });
  if (manifest.error || typeof manifest.data !== 'string')
    throw new Error('Cannot create backup manifest. Check entitlement and retention limits.');
  if ((await verifiedOwner()) !== owner)
    throw new Error('Cloud account changed; upload cancelled.');
  const upload = await client.storage
    .from('finance-backups')
    .upload(manifest.data, bytes.buffer as ArrayBuffer, {
      contentType: 'application/json',
      upsert: false,
    });
  if (upload.error)
    throw new Error(
      'Backup upload did not complete. The pending manifest is retained; verify it or delete it before retrying.'
    );
  await verifyCloudBackup(id);
  return id;
}
export async function verifyCloudBackup(id: string) {
  const response = await cloudClient().functions.invoke('backup-manager', {
    body: { action: 'verify', id },
  });
  if (response.error || response.data?.verified !== true)
    throw new Error(
      'Uploaded backup has not been verified. Retry verification; it is not marked successful.'
    );
}
export async function deleteCloudBackup(id: string) {
  const response = await cloudClient().functions.invoke('backup-manager', {
    body: { action: 'delete', id },
  });
  if (response.error || response.data?.deleted !== true)
    throw new Error('Cloud backup deletion did not complete. Retry.');
}
export async function downloadCloudBackup(backup: CloudBackup) {
  if (backup.status !== 'verified') throw new Error('Only verified backups can be restored.');
  if (backup.owner_id !== (await verifiedOwner()))
    throw new Error('This backup belongs to another account.');
  const client = cloudClient();
  const signed = await client.storage
    .from('finance-backups')
    .createSignedUrl(backup.object_path, 60);
  if (signed.error || !signed.data) throw new Error('Could not authorize backup download.');
  const response = await fetch(signed.data.signedUrl);
  if (!response.ok) throw new Error('Backup download failed.');
  const text = await response.text();
  if (utf8ToBytes(text).length !== backup.byte_size || digest(text) !== backup.sha256)
    throw new Error('Downloaded backup failed integrity validation. Existing data is unchanged.');
  await prepareBackup(text, '');
  return text;
}
export async function restoreCloudBackup(text: string) {
  await useFinance.getState().mutate(() => replaceFromBackup(text, ''));
  useFinance.setState((s) => ({ budgetRevision: s.budgetRevision + 1 }));
}
export async function saveCloudRecovery(text: string) {
  const directory = new Directory(Paths.document, 'recovery');
  directory.create({ idempotent: true });
  const file = new File(directory, `pre-cloud-${Date.now()}.json`);
  file.create();
  file.write(text);
  if (!file.size)
    throw new Error(
      'Could not preserve the local recovery copy. No cloud replacement was applied.'
    );
}
