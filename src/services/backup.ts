import { utf8ToBytes } from '@noble/hashes/utils.js';
import { digest } from '../security/crypto';
import { migrations } from '../db/migrations';
export const TABLES = [
  'accounts',
  'categories',
  'app_settings',
  'account_roles',
  'ledger_accounts',
  'credit_cards',
  'loans',
  'transactions',
  'budgets',
  'budget_categories',
  'card_statements',
  'ledger_journals',
  'ledger_lines',
  'transaction_journals',
  'loan_schedules',
  'loan_payments',
  'recurring_rules',
  'recurring_occurrences',
] as const;
export type Table = (typeof TABLES)[number];
export type Row = Record<string, string | number | null>;
export type Dataset = Record<Table, Row[]>;
export type BackupPayload = {
  appVersion: string;
  schemaVersion: number;
  createdAt: string;
  currency: 'INR';
  amountUnit: 'minor';
  dateFormat: 'YYYY-MM-DD';
  tables: Dataset;
};
export type Backup = {
  format: 'pocketbook-backup';
  formatVersion: 1;
  payload: BackupPayload;
  sha256: string;
};
export const MAX_BACKUP_BYTES = 20000000;
export function serializeBackup(tables: Dataset): string {
  const payload: BackupPayload = {
    appVersion: '1.0.0',
    schemaVersion: migrations.length,
    createdAt: new Date().toISOString(),
    currency: 'INR',
    amountUnit: 'minor',
    dateFormat: 'YYYY-MM-DD',
    tables,
  };
  const text = JSON.stringify({
    format: 'pocketbook-backup',
    formatVersion: 1,
    payload,
    sha256: digest(JSON.stringify(payload)),
  });
  if (utf8ToBytes(text).length > MAX_BACKUP_BYTES)
    throw new Error('Backup exceeds the supported 20 MB limit.');
  return text;
}
export function validateBackup(text: string): Backup {
  if (text.length > MAX_BACKUP_BYTES || utf8ToBytes(text).length > MAX_BACKUP_BYTES)
    throw new Error('Backup exceeds the supported 20 MB limit.');
  let b;
  try {
    b = JSON.parse(text);
  } catch {
    throw new Error('Invalid backup JSON.');
  }
  if (
    b?.format !== 'pocketbook-backup' ||
    b.formatVersion !== 1 ||
    ![3, migrations.length].includes(b.payload?.schemaVersion)
  )
    throw new Error(
      'Unsupported backup format or database version. Open it with its original app version and re-export.'
    );
  const p = b.payload;
  if (
    typeof p.appVersion !== 'string' ||
    typeof p.createdAt !== 'string' ||
    !Number.isFinite(Date.parse(p.createdAt)) ||
    p.currency !== 'INR' ||
    p.amountUnit !== 'minor' ||
    p.dateFormat !== 'YYYY-MM-DD' ||
    !p.tables ||
    typeof p.tables !== 'object' ||
    Array.isArray(p.tables) ||
    typeof b.sha256 !== 'string' ||
    digest(JSON.stringify(p)) !== b.sha256
  )
    throw new Error('Corrupted backup metadata or integrity checksum.');
  if (
    Object.keys(p.tables).length !== TABLES.length ||
    TABLES.some((t) => !Array.isArray(p.tables[t]))
  )
    throw new Error('Backup must contain the complete supported dataset.');
  let count = 0;
  for (const t of TABLES)
    for (const row of p.tables[t]) {
      if (++count > 250000 || !row || typeof row !== 'object' || Array.isArray(row))
        throw new Error('Invalid or oversized backup dataset.');
      for (const value of Object.values(row))
        if (
          value !== null &&
          typeof value !== 'string' &&
          !(typeof value === 'number' && Number.isSafeInteger(value))
        )
          throw new Error('Backup contains invalid field types.');
      if (
        t === 'app_settings' &&
        ![
          'theme',
          'currency',
          'categories_seeded',
          'ledger_converted',
          'budget_warning_percent',
        ].includes(row.key)
      )
        throw new Error('Unsupported application preference in backup.');
    }
  return b as Backup;
}
