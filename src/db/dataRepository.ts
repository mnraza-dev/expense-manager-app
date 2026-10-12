import { AdvancedRepository } from './advancedRepository';
import { migrations } from './migrations';
import {
  TABLES,
  validateBackup,
  serializeBackup,
  type Dataset,
  type Row,
  type Backup,
} from '../services/backup';
import { validateExportFilters, type ExportFilters, type ExportRow } from '../utils/export';
import { validDate, MAX_MONEY } from '../utils/finance';
export type IntegrityIssue = { code: string; count: number; action: string };
export class DataRepository extends AdvancedRepository {
  exportTransactions(filters: ExportFilters) {
    return this.read(async () => {
      validateExportFilters(filters);
      const where: string[] = [],
        values: (string | number)[] = [];
      if (filters.start) {
        where.push('t.date>=?');
        values.push(filters.start);
      }
      if (filters.end) {
        where.push('t.date<=?');
        values.push(filters.end);
      }
      if (filters.account) {
        where.push('(t.account_id=? OR t.destination_account_id=?)');
        values.push(filters.account, filters.account);
      }
      if (filters.category) {
        where.push(
          '(t.category_id=? OR EXISTS(SELECT 1 FROM expense_splits s WHERE s.transaction_id=t.id AND s.category_id=?))'
        );
        values.push(filters.category, filters.category);
      }
      if (filters.type) {
        where.push('t.type=?');
        values.push(filters.type);
      }
      const rows = await this.db.getAllAsync<ExportRow>(
        `SELECT t.id,t.date,t.type,t.description,t.effective_amount amount,t.refund_of_id,a.currency,a.name account,d.name destination,CASE WHEN t.split_count>0 THEN (SELECT group_concat(sc.name || ' INR ' || printf('%.2f',s.amount/100.0),'; ') FROM expense_splits s JOIN categories sc ON sc.id=s.category_id WHERE s.transaction_id=t.id) ELSE c.name END category,t.notes,t.created_at FROM active_transactions t JOIN accounts a ON a.id=t.account_id LEFT JOIN accounts d ON d.id=t.destination_account_id LEFT JOIN categories c ON c.id=t.category_id ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY t.date,t.id LIMIT 50001`,
        ...values
      );
      if (rows.length > 50000)
        throw new Error('Select a smaller range: CSV exports support up to 50,000 transactions.');
      return rows;
    });
  }
  protected async datasetCore() {
    const tables = {} as Dataset;
    for (const table of TABLES)
      tables[table] = await this.db.getAllAsync<Row>(
        `SELECT * FROM ${table} ORDER BY ${table === 'app_settings' ? 'key' : table === 'account_roles' || table === 'credit_cards' ? 'account_id' : table === 'transaction_journals' ? 'transaction_id,version' : 'id'}`
      );
    return tables;
  }
  backup() {
    return this.read(async () => {
      let text = '';
      await this.db.withTransactionAsync(async () => {
        text = serializeBackup(await this.datasetCore());
      });
      if (text.length > 20000000)
        throw new Error('Dataset exceeds the supported 20 MB backup limit.');
      return text;
    });
  }
  protected async integrityCore(): Promise<IntegrityIssue[]> {
    const issues: IntegrityIssue[] = [];
    const foreign = await this.db.getAllAsync('PRAGMA foreign_key_check');
    if (foreign.length)
      issues.push({
        code: 'orphaned_references',
        count: foreign.length,
        action: 'Review the referenced records; restore a known good backup. No automatic repair.',
      });
    const checks: [string, string][] = [
      [
        'unbalanced_journals',
        "SELECT count(*) n FROM ledger_journals j WHERE j.status='posted' AND ((SELECT count(*) FROM ledger_lines WHERE journal_id=j.id)<2 OR (SELECT COALESCE(sum(debit-credit),0) FROM ledger_lines WHERE journal_id=j.id)<>0)",
      ],
      ['draft_journals', "SELECT count(*) n FROM ledger_journals WHERE status<>'posted'"],
      [
        'currency_mismatch',
        "SELECT count(*) n FROM ledger_lines l JOIN ledger_accounts a ON a.id=l.ledger_account_id WHERE l.currency<>a.currency OR l.currency<>'INR'",
      ],
      [
        'transaction_posting',
        `SELECT count(*) n FROM transactions t WHERE (t.status='posted' AND (SELECT count(*) FROM ledger_journals j JOIN transaction_journals tj ON tj.journal_id=j.id WHERE tj.transaction_id=t.id AND j.status='posted' AND NOT EXISTS(SELECT 1 FROM ledger_journals r WHERE r.reversal_of=j.id))<>1) OR (t.status='void' AND EXISTS(SELECT 1 FROM ledger_journals j JOIN transaction_journals tj ON tj.journal_id=j.id WHERE tj.transaction_id=t.id AND NOT EXISTS(SELECT 1 FROM ledger_journals r WHERE r.reversal_of=j.id)))`,
      ],
      [
        'transaction_ledger_mismatch',
        `SELECT count(*) n FROM active_transactions t JOIN transaction_journals tj ON tj.transaction_id=t.id AND tj.version=(SELECT MAX(version) FROM transaction_journals WHERE transaction_id=t.id) JOIN ledger_journals j ON j.id=tj.journal_id WHERE j.transaction_id IS NOT t.id OR j.date<>t.date OR (SELECT count(*) FROM ledger_lines WHERE journal_id=j.id)<>(SELECT count(*) FROM expected_transaction_lines WHERE transaction_id=t.id) OR EXISTS(SELECT ledger_account_id,debit,credit,currency FROM expected_transaction_lines WHERE transaction_id=t.id EXCEPT SELECT ledger_account_id,debit,credit,currency FROM ledger_lines WHERE journal_id=j.id) OR EXISTS(SELECT ledger_account_id,debit,credit,currency FROM ledger_lines WHERE journal_id=j.id EXCEPT SELECT ledger_account_id,debit,credit,currency FROM expected_transaction_lines WHERE transaction_id=t.id)`,
      ],
      [
        'expense_splits',
        `SELECT count(*) n FROM transactions t WHERE EXISTS(SELECT 1 FROM expense_splits WHERE transaction_id=t.id) AND (t.type<>'expense' OR t.component<>'standard' OR (SELECT count(*) FROM expense_splits WHERE transaction_id=t.id) NOT BETWEEN 2 AND 20 OR (SELECT sum(amount) FROM expense_splits WHERE transaction_id=t.id)<>t.amount OR NOT EXISTS(SELECT 1 FROM expense_splits WHERE transaction_id=t.id AND category_id=t.category_id))`,
      ],
      [
        'split_categories',
        `SELECT count(*) n FROM expense_splits s JOIN categories c ON c.id=s.category_id WHERE c.type<>'expense'`,
      ],
      [
        'refund_links',
        `SELECT count(*) n FROM active_transactions r LEFT JOIN transactions o ON o.id=r.refund_of_id WHERE r.refund_of_id IS NOT NULL AND (o.id IS NULL OR o.status<>'posted' OR o.refund_of_id IS NOT NULL OR o.type<>'expense' OR o.component<>'standard' OR o.loan_id IS NOT NULL OR r.loan_id IS NOT NULL OR r.type<>'expense' OR r.component<>'standard' OR r.account_id<>o.account_id OR r.date<o.date)`,
      ],
      [
        'refund_limits',
        `SELECT count(*) n FROM (SELECT r.refund_of_id,c.category_id,sum(-c.amount) refunded FROM category_activity c JOIN active_transactions r ON r.id=c.transaction_id WHERE r.refund_of_id IS NOT NULL GROUP BY r.refund_of_id,c.category_id) x WHERE x.refunded>COALESCE((SELECT amount FROM category_activity WHERE transaction_id=x.refund_of_id AND category_id=x.category_id),0)`,
      ],
      [
        'goal_balance',
        `SELECT count(*) n FROM savings_goals g WHERE COALESCE((SELECT sum(CASE WHEN direction='add' THEN amount ELSE -amount END) FROM goal_contributions WHERE goal_id=g.id),0) NOT BETWEEN 0 AND 1000000000000`,
      ],
      [
        'reversal_mismatch',
        `SELECT count(*) n FROM ledger_journals r JOIN ledger_journals j ON j.id=r.reversal_of WHERE r.date<>j.date OR EXISTS(SELECT ledger_account_id,debit,credit,currency FROM ledger_lines WHERE journal_id=j.id EXCEPT SELECT ledger_account_id,credit,debit,currency FROM ledger_lines WHERE journal_id=r.id) OR EXISTS(SELECT ledger_account_id,credit,debit,currency FROM ledger_lines WHERE journal_id=r.id EXCEPT SELECT ledger_account_id,debit,credit,currency FROM ledger_lines WHERE journal_id=j.id)`,
      ],
      [
        'account_mapping',
        `SELECT count(*) n FROM accounts a LEFT JOIN account_roles r ON r.account_id=a.id LEFT JOIN ledger_accounts l ON l.account_id=a.id WHERE r.account_id IS NULL OR l.id IS NULL OR r.kind<>l.kind OR a.currency<>l.currency`,
      ],
      [
        'budget_allocations',
        `SELECT count(*) n FROM budgets b WHERE (SELECT COALESCE(sum(limit_minor),0) FROM budget_categories WHERE budget_id=b.id)>b.total_limit_minor`,
      ],
      [
        'budget_categories',
        `SELECT count(*) n FROM budget_categories b JOIN categories c ON c.id=b.category_id WHERE c.type<>'expense'`,
      ],
      [
        'statement_references',
        `SELECT count(*) n FROM card_statements s LEFT JOIN account_roles r ON r.account_id=s.account_id WHERE r.subtype IS NULL OR r.subtype<>'credit_card' OR s.period_end<s.period_start OR s.due_date<=s.period_end`,
      ],
      [
        'duplicate_occurrences',
        `SELECT count(*) n FROM (SELECT rule_id,scheduled_date FROM recurring_occurrences GROUP BY rule_id,scheduled_date HAVING count(*)>1)`,
      ],
      [
        'occurrence_links',
        `SELECT count(*) n FROM recurring_occurrences o WHERE (o.status='completed' AND ((o.transaction_id IS NULL AND o.loan_payment_id IS NULL) OR (o.transaction_id IS NOT NULL AND o.loan_payment_id IS NOT NULL))) OR (o.status<>'completed' AND (o.loan_payment_id IS NOT NULL OR o.transaction_id IS NOT NULL))`,
      ],
      [
        'loan_balance',
        `SELECT count(*) n FROM loans l JOIN ledger_accounts a ON a.account_id=l.account_id LEFT JOIN account_roles r ON r.account_id=l.account_id WHERE r.subtype IS NULL OR r.subtype<>(CASE WHEN l.direction='borrowed' THEN 'loan_payable' ELSE 'loan_receivable' END) OR a.kind<>(CASE WHEN l.direction='borrowed' THEN 'liability' ELSE 'asset' END) OR COALESCE((SELECT sum(CASE WHEN l.direction='borrowed' THEN ln.credit-ln.debit ELSE ln.debit-ln.credit END) FROM ledger_lines ln JOIN ledger_journals j ON j.id=ln.journal_id WHERE ln.ledger_account_id=a.id AND j.status='posted'),0)<>l.principal-COALESCE((SELECT sum(principal) FROM loan_payments WHERE loan_id=l.id AND status='posted'),0)`,
      ],
      [
        'loan_components',
        `SELECT count(*) n FROM loan_payments p WHERE (p.principal+p.interest+p.fees=0) OR EXISTS(SELECT 1 FROM (SELECT p.principal amount,p.principal_transaction_id tx,'principal' kind UNION ALL SELECT p.interest,p.interest_transaction_id,'interest' UNION ALL SELECT p.fees,p.fee_transaction_id,'fee') x LEFT JOIN transactions t ON t.id=x.tx WHERE (x.amount=0 AND x.tx IS NOT NULL) OR (x.amount>0 AND (t.id IS NULL OR t.amount<>x.amount OR t.component<>x.kind OR t.loan_id<>p.loan_id OR t.date<>p.date OR t.status<>p.status)))`,
      ],
      [
        'loan_principal',
        `SELECT count(*) n FROM loans l WHERE COALESCE((SELECT sum(principal) FROM loan_payments WHERE loan_id=l.id AND status='posted'),0)>l.principal`,
      ],
    ];
    for (const [code, sql] of checks) {
      const row = await this.db.getFirstAsync<{ n: number }>(sql);
      if (row?.n)
        issues.push({
          code,
          count: row.n,
          action:
            'Requires review. No records were changed; compare with your backup and accounting history.',
        });
    }
    const tables = await this.datasetCore();
    const ledgerVolume = tables.ledger_lines.reduce(
      (sum, row) => sum + BigInt(row.debit as number) + BigInt(row.credit as number),
      0n
    );
    if (ledgerVolume > BigInt(Number.MAX_SAFE_INTEGER))
      issues.push({
        code: 'ledger_precision',
        count: 1,
        action: 'Ledger totals exceed supported exact integer precision. Requires review.',
      });
    let dates = 0,
      money = 0;
    const moneyNames = new Set([
      'opening_balance',
      'target_amount',
      'amount',
      'debit',
      'credit',
      'credit_limit',
      'minimum_payment',
      'principal',
      'interest',
      'fees',
      'origination_fees',
      'total_limit_minor',
      'limit_minor',
    ]);
    for (const table of TABLES)
      for (const row of tables[table])
        for (const [key, value] of Object.entries(row)) {
          if (
            value !== null &&
            (key === 'date' ||
              key.endsWith('_date') ||
              ['history_start', 'period_start', 'period_end'].includes(key)) &&
            (typeof value !== 'string' || !validDate(value))
          )
            dates++;
          if (
            value !== null &&
            moneyNames.has(key) &&
            (typeof value !== 'number' ||
              !Number.isSafeInteger(value) ||
              Math.abs(value) > MAX_MONEY ||
              (key !== 'opening_balance' && value < 0))
          )
            money++;
        }
    if (dates)
      issues.push({
        code: 'invalid_dates',
        count: dates,
        action: 'Review invalid local calendar dates; no automatic changes.',
      });
    if (money)
      issues.push({
        code: 'invalid_amounts',
        count: money,
        action: 'Review monetary values outside supported integer precision.',
      });
    return issues;
  }
  integrity() {
    return this.read(() => this.integrityCore());
  }
  protected async importCore(backup: Backup) {
    await this.db.runAsync('DELETE FROM app_settings');
    // Identifiers are exclusively compile-time constants. Values are bound parameters.
    for (const table of TABLES) {
      const info = await this.db.getAllAsync<{
        name: string;
        type: string;
        notnull: number;
        pk: number;
      }>(`PRAGMA table_info(${table})`);
      const names = info.map((c) => c.name);
      for (const row of backup.payload.tables[table]) {
        if (Object.keys(row).length !== names.length || names.some((n) => !Object.hasOwn(row, n)))
          throw new Error(`Invalid columns in ${table}.`);
        for (const col of info) {
          const value = row[col.name];
          if (
            value === null
              ? col.notnull || col.pk
              : col.type === 'INTEGER'
                ? typeof value !== 'number' || !Number.isSafeInteger(value)
                : typeof value !== 'string'
          )
            throw new Error(`Invalid ${table}.${col.name}.`);
        }
        if (table === 'ledger_journals' && row.status !== 'posted')
          throw new Error('Backup contains unfinished journals.');
        const values = names.map((n) =>
          table === 'ledger_journals' && n === 'status' ? 'draft' : row[n]
        );
        await this.db.runAsync(
          `INSERT INTO ${table}(${names.join(',')}) VALUES (${names.map(() => '?').join(',')})`,
          ...values
        );
      }
    }
    await this.db.runAsync("UPDATE ledger_journals SET status='posted'");
    if (
      !(await this.db.getFirstAsync(
        "SELECT key FROM app_settings WHERE key='ledger_converted' AND value='1'"
      ))
    )
      throw new Error('Backup lacks the completed ledger conversion marker.');
    const issues = await this.integrityCore();
    if (issues.length)
      throw new Error(
        'Backup financial validation failed: ' + issues.map((i) => i.code).join(', ')
      );
  }
  validateInDatabase(text: string) {
    return this.write(async () => {
      const backup = validateBackup(text);
      // Intended for a fresh staging database. Never call this on the live dataset.
      await this.db.withTransactionAsync(async () => {
        for (const migration of migrations) await this.db.execAsync(migration);
        await this.db.execAsync('PRAGMA defer_foreign_keys=ON');
        await this.importCore(backup);
      });
      return backup;
    });
  }
  replaceBackup(text: string, saveRecovery: (text: string) => Promise<void>) {
    return this.write(async () => {
      const backup = validateBackup(text);
      await saveRecovery(serializeBackup(await this.datasetCore()));
      await this.db.execAsync('PRAGMA foreign_keys=OFF');
      try {
        await this.db.withTransactionAsync(async () => {
          for (const table of [...TABLES].reverse()) await this.db.execAsync(`DROP TABLE ${table}`);
          await this.db.execAsync(
            'DROP VIEW IF EXISTS expected_transaction_lines; DROP VIEW IF EXISTS category_activity; DROP VIEW active_transactions; DELETE FROM schema_migrations;'
          );
          await this.db.execAsync(
            'UPDATE sync_config SET owner=NULL,enabled=0,checkpoint=0,last_success=NULL; DELETE FROM sync_outbox;DELETE FROM sync_mappings;DELETE FROM sync_remote;DELETE FROM sync_dirty;DELETE FROM sync_conflicts;'
          );
          for (let i = 0; i < migrations.length; i++) {
            await this.db.execAsync(migrations[i]);
            await this.db.runAsync(
              'INSERT INTO schema_migrations VALUES (?,?)',
              i + 1,
              new Date().toISOString()
            );
          }
          await this.importCore(backup);
        });
      } finally {
        await this.db.execAsync('PRAGMA foreign_keys=ON');
      }
    });
  }
}
