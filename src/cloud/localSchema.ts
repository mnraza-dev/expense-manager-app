const entities = [
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
];
export const uuidSQL =
  "lower(hex(randomblob(4)))||'-'||lower(hex(randomblob(2)))||'-4'||substr(lower(hex(randomblob(2))),2)||'-8'||substr(lower(hex(randomblob(2))),2)||'-'||lower(hex(randomblob(6)))";
export const syncMigration =
  `
CREATE TABLE IF NOT EXISTS sync_config(id INTEGER PRIMARY KEY CHECK(id=1),owner TEXT,enabled INTEGER NOT NULL DEFAULT 0,applying INTEGER NOT NULL DEFAULT 0,checkpoint INTEGER NOT NULL DEFAULT 0,last_success TEXT);
INSERT OR IGNORE INTO sync_config(id) VALUES(1);
CREATE TABLE IF NOT EXISTS sync_mappings(entity TEXT NOT NULL,local_key TEXT NOT NULL,global_id TEXT NOT NULL UNIQUE,PRIMARY KEY(entity,local_key));
CREATE TABLE IF NOT EXISTS sync_dirty(entity TEXT NOT NULL,local_key TEXT NOT NULL,deleted INTEGER NOT NULL,PRIMARY KEY(entity,local_key));
CREATE TABLE IF NOT EXISTS sync_outbox(id TEXT PRIMARY KEY,owner TEXT NOT NULL,payload TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','conflict')),created_at TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,error_code TEXT);
CREATE TABLE IF NOT EXISTS sync_remote(id TEXT PRIMARY KEY,entity TEXT NOT NULL,data TEXT,revision INTEGER NOT NULL,deleted INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS sync_conflicts(id TEXT PRIMARY KEY,operation_id TEXT NOT NULL,proposal TEXT NOT NULL,created_at TEXT NOT NULL);
` +
  entities
    .map((entity) =>
      ['INSERT', 'UPDATE', 'DELETE']
        .map((event) => {
          const prefix = event === 'DELETE' ? 'OLD' : 'NEW';
          const key =
            entity === 'app_settings'
              ? `${prefix}.key`
              : entity === 'account_roles' || entity === 'credit_cards'
                ? `CAST(${prefix}.account_id AS TEXT)`
                : entity === 'transaction_journals'
                  ? `CAST(${prefix}.transaction_id AS TEXT)||':'||CAST(${prefix}.version AS TEXT)`
                  : `CAST(${prefix}.id AS TEXT)`;
          return `CREATE TRIGGER IF NOT EXISTS sync_${entity}_${event.toLowerCase()} AFTER ${event} ON ${entity} WHEN (SELECT enabled=1 AND applying=0 FROM sync_config WHERE id=1) BEGIN INSERT INTO sync_dirty(entity,local_key,deleted) VALUES('${entity}',${key},${event === 'DELETE' ? 1 : 0}) ON CONFLICT(entity,local_key) DO UPDATE SET deleted=excluded.deleted; END;`;
        })
        .join('\n')
    )
    .join('\n');
