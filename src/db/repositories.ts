import type { Account, Category, Snapshot, Transaction } from '../types';
import { defaults, migrations } from './migrations';
import { MAX_MONEY, validDate } from '../utils/finance';
import { AnalyticsRepository } from './analyticsRepository';
export type { DB } from './adapter';
export class Repositories extends AnalyticsRepository {
  private async checkPrecision(kind: 'account' | 'transaction', amount: number, id?: number) {
    const accounts = await this.db.getAllAsync<{ id: number; opening_balance: number }>(
      'SELECT id,opening_balance FROM accounts'
    );
    const transactions = await this.db.getAllAsync<{ id: number; amount: number }>(
      'SELECT id,amount FROM transactions'
    );
    let total = BigInt(Math.abs(amount));
    for (const a of accounts)
      if (kind !== 'account' || a.id !== id) total += BigInt(Math.abs(a.opening_balance));
    for (const t of transactions)
      if (kind !== 'transaction' || t.id !== id) total += BigInt(t.amount);
    if (total > BigInt(Number.MAX_SAFE_INTEGER))
      throw new Error('This entry exceeds the supported total ledger precision.');
  }
  async initialize() {
    await this.db.execAsync(
      'PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);'
    );
    await this.db.withTransactionAsync(async () => {
      const rows = await this.db.getAllAsync<{ version: number }>(
        'SELECT version FROM schema_migrations'
      );
      for (let i = 0; i < migrations.length; i++)
        if (!rows.some((r) => r.version === i + 1)) {
          await this.db.execAsync(migrations[i]);
          await this.db.runAsync(
            'INSERT INTO schema_migrations VALUES (?,?)',
            i + 1,
            new Date().toISOString()
          );
        }
      const now = new Date().toISOString();
      const seeded = await this.db.getFirstAsync<{ value: string }>(
        "SELECT value FROM app_settings WHERE key='categories_seeded'"
      );
      if (!seeded) {
        for (const type of ['expense', 'income'] as const)
          for (const name of defaults[type])
            await this.db.runAsync(
              'INSERT OR IGNORE INTO categories(name,type,icon,color,created_at,updated_at) VALUES (?,?,?,?,?,?)',
              name,
              type,
              type === 'expense' ? 'basket' : 'briefcase',
              type === 'expense' ? '#E29B52' : '#35A78C',
              now,
              now
            );
        await this.db.runAsync("INSERT INTO app_settings VALUES ('categories_seeded','1')");
      }
      await this.db.runAsync("INSERT OR IGNORE INTO app_settings VALUES ('theme','system')");
      await this.db.runAsync("INSERT OR IGNORE INTO app_settings VALUES ('currency','INR')");
    });
  }
  async snapshot(): Promise<Snapshot> {
    await this.queue;
    const accounts = await this.db.getAllAsync<Account>(
      'SELECT * FROM accounts ORDER BY archived,name'
    );
    const categories = await this.db.getAllAsync<Category>(
      'SELECT * FROM categories ORDER BY type,name'
    );
    const transactions = await this.db.getAllAsync<Transaction>(
      'SELECT * FROM transactions ORDER BY date DESC,id DESC'
    );
    const settings = Object.fromEntries(
      (await this.db.getAllAsync<{ key: string; value: string }>('SELECT * FROM app_settings')).map(
        (r) => [r.key, r.value]
      )
    );
    return { accounts, categories, transactions, settings };
  }
  saveAccount(
    input: Pick<Account, 'name' | 'type' | 'opening_balance' | 'description'>,
    id?: number
  ) {
    return this.write(async () => {
      if (
        !input.name.trim() ||
        !['cash', 'bank', 'savings', 'wallet', 'other'].includes(input.type)
      )
        throw new Error('Enter a name and valid account type.');
      if (
        !Number.isSafeInteger(input.opening_balance) ||
        Math.abs(input.opening_balance) > MAX_MONEY
      )
        throw new Error('Invalid opening balance.');
      await this.checkPrecision('account', input.opening_balance, id);
      const now = new Date().toISOString();
      if (id)
        await this.db.runAsync(
          'UPDATE accounts SET name=?,type=?,opening_balance=?,description=?,updated_at=? WHERE id=?',
          input.name.trim(),
          input.type,
          input.opening_balance,
          input.description,
          now,
          id
        );
      else
        await this.db.runAsync(
          'INSERT INTO accounts(name,type,opening_balance,description,created_at,updated_at) VALUES (?,?,?,?,?,?)',
          input.name.trim(),
          input.type,
          input.opening_balance,
          input.description,
          now,
          now
        );
    });
  }
  archiveAccount(id: number, archived: boolean) {
    return this.write(() =>
      this.db.runAsync(
        'UPDATE accounts SET archived=?,updated_at=? WHERE id=?',
        Number(archived),
        new Date().toISOString(),
        id
      )
    );
  }
  deleteAccount(id: number) {
    return this.write(async () => {
      const row = await this.db.getFirstAsync<{ count: number }>(
        'SELECT COUNT(*) count FROM transactions WHERE account_id=? OR destination_account_id=?',
        id,
        id
      );
      if (row?.count)
        throw new Error('This account has transactions. Archive it to preserve your history.');
      await this.db.runAsync('DELETE FROM accounts WHERE id=?', id);
    });
  }
  saveCategory(input: Pick<Category, 'name' | 'type' | 'icon' | 'color'>, id?: number) {
    return this.write(async () => {
      if (
        !input.name.trim() ||
        !['income', 'expense'].includes(input.type) ||
        !/^#[\da-f]{6}$/i.test(input.color)
      )
        throw new Error('Enter a name, type and valid color.');
      const duplicate = await this.db.getFirstAsync<{ id: number }>(
        'SELECT id FROM categories WHERE name=? AND type=? AND id<>?',
        input.name.trim(),
        input.type,
        id ?? 0
      );
      if (duplicate) throw new Error('A category with this name already exists for this type.');
      const now = new Date().toISOString();
      if (id)
        await this.db.runAsync(
          'UPDATE categories SET name=?,icon=?,color=?,updated_at=? WHERE id=?',
          input.name.trim(),
          input.icon,
          input.color,
          now,
          id
        );
      else
        await this.db.runAsync(
          'INSERT INTO categories(name,type,icon,color,created_at,updated_at) VALUES (?,?,?,?,?,?)',
          input.name.trim(),
          input.type,
          input.icon,
          input.color,
          now,
          now
        );
    });
  }
  archiveCategory(id: number, archived: boolean) {
    return this.write(() =>
      this.db.runAsync(
        'UPDATE categories SET archived=?,updated_at=? WHERE id=?',
        Number(archived),
        new Date().toISOString(),
        id
      )
    );
  }
  saveTransaction(input: Omit<Transaction, 'id' | 'created_at' | 'updated_at'>, id?: number) {
    return this.write(async () => {
      await this.db.withTransactionAsync(async () => {
        if (
          !['expense', 'income', 'transfer'].includes(input.type) ||
          !Number.isSafeInteger(input.amount) ||
          input.amount <= 0 ||
          input.amount > MAX_MONEY ||
          !input.description.trim() ||
          !validDate(input.date)
        )
          throw new Error('Enter a positive amount, description and valid date.');
        const previous = id
          ? await this.db.getFirstAsync<Transaction>('SELECT * FROM transactions WHERE id=?', id)
          : null;
        if (id && !previous) throw new Error('Transaction no longer exists.');
        const account = await this.db.getFirstAsync<Account>(
          'SELECT * FROM accounts WHERE id=?',
          input.account_id
        );
        if (!account || (account.archived && previous?.account_id !== account.id))
          throw new Error('Select an active account.');
        if (input.type === 'transfer') {
          const dest = await this.db.getFirstAsync<Account>(
            'SELECT * FROM accounts WHERE id=?',
            input.destination_account_id
          );
          if (
            !dest ||
            dest.id === account.id ||
            (dest.archived && previous?.destination_account_id !== dest.id) ||
            dest.currency !== account.currency ||
            input.category_id !== null
          )
            throw new Error('Choose a different active destination account.');
        } else {
          const category = await this.db.getFirstAsync<Category>(
            'SELECT * FROM categories WHERE id=?',
            input.category_id
          );
          if (
            !category ||
            category.type !== input.type ||
            (category.archived && previous?.category_id !== category.id) ||
            input.destination_account_id !== null
          )
            throw new Error('Choose a compatible active category.');
        }
        await this.checkPrecision('transaction', input.amount, id);
        const now = new Date().toISOString();
        const args = [
          input.type,
          input.amount,
          input.account_id,
          input.destination_account_id,
          input.category_id,
          input.description.trim(),
          input.date,
          input.notes,
          now,
        ];
        if (id)
          await this.db.runAsync(
            'UPDATE transactions SET type=?,amount=?,account_id=?,destination_account_id=?,category_id=?,description=?,date=?,notes=?,updated_at=? WHERE id=?',
            ...args,
            id
          );
        else
          await this.db.runAsync(
            'INSERT INTO transactions(type,amount,account_id,destination_account_id,category_id,description,date,notes,updated_at,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
            ...args,
            now
          );
      });
    });
  }
  deleteTransaction(id: number) {
    return this.write(() => this.db.runAsync('DELETE FROM transactions WHERE id=?', id));
  }
  setting(key: string, value: string) {
    return this.write(() =>
      this.db.runAsync(
        'INSERT INTO app_settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
        key,
        value
      )
    );
  }
}
