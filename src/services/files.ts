import { File, Directory, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import * as Crypto from 'expo-crypto';
import { openDatabaseAsync, deleteDatabaseAsync } from 'expo-sqlite';
import { create } from 'zustand';
import { requireOptionalNativeModule } from 'expo';
import { waitForForegroundAccess } from '../security/lock';
import { DataRepository } from '../db/dataRepository';
import { repo } from '../db/database';
import { decryptBackup, encryptBackup } from '../security/crypto';
import { MAX_BACKUP_BYTES, validateBackup } from './backup';
export const useDataOperation = create<{
  message: string | null;
  setMessage: (message: string | null) => void;
}>((set) => ({ message: null, setMessage: (message) => set({ message }) }));
const recoveryDirectory = () => new Directory(Paths.document, 'recovery');
function exportDirectory() {
  const directory = new Directory(Paths.cache, 'exports');
  directory.create({ idempotent: true });
  for (const entry of directory.list())
    if (entry instanceof File && (entry.modificationTime ?? 0) < Date.now() - 86400000) {
      try {
        entry.delete();
      } catch {
        /* Retry cleanup on a future export. */
      }
    }
  return directory;
}
export async function shareText(text: string, extension: 'csv' | 'json', label: string) {
  if (!(await Sharing.isAvailableAsync()))
    throw new Error('File sharing is unavailable on this device.');
  const directory = exportDirectory();
  const file = new File(directory, `${label}-${Date.now()}.${extension}`);
  try {
    file.create();
    file.write(text);
    await Sharing.shareAsync(file.uri, {
      mimeType: extension === 'csv' ? 'text/csv' : 'application/json',
      UTI: extension === 'csv' ? 'public.comma-separated-values-text' : 'public.json',
      dialogTitle: label,
    });
  } catch {
    throw new Error('Could not write or share the file. Check available storage and try again.');
  }
}
export async function sharePDFReport(html: string, label: string) {
  if (!requireOptionalNativeModule('ExpoPrint'))
    throw new Error(
      'Install the updated native Settler build to enable PDF exports. Excel export is available in the current build.'
    );
  if (!(await Sharing.isAvailableAsync()))
    throw new Error('File sharing is unavailable on this device.');
  await waitForForegroundAccess();
  const Print = await import('expo-print');
  const result = await Print.printToFileAsync({
    html,
    width: 595,
    height: 842,
    margins: { top: 36, right: 36, bottom: 36, left: 36 },
  });
  const original = new File(result.uri);
  const output = new File(exportDirectory(), `${label}-${Date.now()}.pdf`);
  try {
    await original.copy(output);
    await waitForForegroundAccess();
    await Sharing.shareAsync(output.uri, {
      mimeType: 'application/pdf',
      UTI: 'com.adobe.pdf',
      dialogTitle: 'Settler expense report',
    });
  } finally {
    try {
      if (original.exists) original.delete();
    } catch {
      /* OS cache cleanup handles the temporary PDF. */
    }
  }
}
export async function readBackupFile() {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/json', 'text/plain', 'application/octet-stream'],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled) return null;
  const file = new File(result.assets[0].uri);
  try {
    if (file.size > MAX_BACKUP_BYTES * 2 + 2048)
      throw new Error('Backup exceeds the supported file size.');
    return await file.text();
  } finally {
    if (file.exists) file.delete();
  }
}
export async function prepareBackup(text: string, password: string) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Invalid backup file: expected supported JSON.');
  }
  const plain =
    parsed?.format === 'pocketbook-encrypted' ? await decryptBackup(text, password) : text;
  const backup = validateBackup(plain);
  const name = `validate-${Crypto.randomUUID()}.db`,
    database = await openDatabaseAsync(name);
  try {
    await new DataRepository(database).validateInDatabase(plain);
    return { text: plain, backup };
  } finally {
    await database.closeAsync();
    await deleteDatabaseAsync(name);
  }
}
export async function createBackupFile(password: string) {
  const text = await repo().backup();
  return password ? encryptBackup(text, password, Crypto.getRandomBytes) : text;
}
export async function replaceFromBackup(text: string, password: string) {
  await repo().replaceBackup(text, async (recovery) => {
    const directory = recoveryDirectory();
    directory.create({ idempotent: true });
    const file = new File(directory, `pre-restore-${Date.now()}.json`);
    const contents = password
      ? await encryptBackup(recovery, password, Crypto.getRandomBytes)
      : recovery;
    try {
      file.create();
      file.write(contents);
      if (file.size === 0) throw new Error('empty');
    } catch {
      throw new Error(
        'Could not save the recovery backup. Check available storage. No data was replaced.'
      );
    }
  });
}
export async function shareLatestRecovery() {
  const directory = recoveryDirectory();
  if (!directory.exists) throw new Error('No pre-restore recovery backup is available.');
  const files = directory
    .list()
    .filter((f): f is File => f instanceof File)
    .sort((a, b) => b.name.localeCompare(a.name));
  if (!files[0]) throw new Error('No pre-restore recovery backup is available.');
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is unavailable.');
  await Sharing.shareAsync(files[0].uri, {
    mimeType: 'application/json',
    dialogTitle: 'Pre-restore recovery backup',
  });
}

export async function shareWorkbook(bytes: Uint8Array) {
  if (!(await Sharing.isAvailableAsync()))
    throw new Error('File sharing is unavailable on this device.');
  const file = new File(exportDirectory(), `settler-${Date.now()}.xlsx`);
  try {
    file.create();
    file.write(bytes);
    await Sharing.shareAsync(file.uri, {
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      UTI: 'org.openxmlformats.spreadsheetml.sheet',
      dialogTitle: 'Selected transactions workbook',
    });
  } catch {
    throw new Error(
      'Could not write or share the workbook. Check available storage and try again.'
    );
  }
}

export async function shareMigrationRecovery() {
  const { defaultDatabaseDirectory } = await import('expo-sqlite');
  const directory = new Directory(defaultDatabaseDirectory);
  const copies = directory
    .list()
    .filter(
      (entry): entry is File =>
        entry instanceof File && /^pocketbook-pre-migration-\d+\.db$/.test(entry.name)
    )
    .sort((a, b) => b.name.localeCompare(a.name));
  if (!copies[0])
    throw new Error(
      'No pre-upgrade recovery copy exists. Preserve the app installation and request database recovery assistance; do not reset app storage.'
    );
  if (!(await Sharing.isAvailableAsync()))
    throw new Error('Sharing is unavailable on this device.');
  await Sharing.shareAsync(copies[0].uri, {
    mimeType: 'application/octet-stream',
    dialogTitle: 'Pre-upgrade SQLite recovery copy',
  });
}
