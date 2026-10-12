import { allocations, validateSplits } from '../utils/expenseAllocations';
import type { ExpenseSplit, Account, Category, Snapshot, Transaction } from '../types';
import { defaults, migrations } from './migrations';
import { MAX_MONEY, validDate, localDate } from '../utils/finance';
import { SyncRepository } from './syncRepository';
import {
  receiptSchema,
  receiptCountSQL,
  transactionReceipts,
  replaceTransactionReceipts,
} from './receiptSchema';
import type { Receipt } from '../utils/receipts';
export type { DB } from './adapter';
export class Repositories extends SyncRepository {
  private async checkPrecision(kind: 'account' | 'transaction', amount: number, id?: number) {
    const opening = await this.db.getFirstAsync<{ total: number }>(
      'SELECT COALESCE(SUM(ABS(opening_balance)),0) total FROM accounts WHERE id<>?',
      kind === 'account' ? (id ?? 0) : 0
    );
    const ledger = await this.db.getFirstAsync<{ total: number }>(
      "SELECT COALESCE(SUM(amount),0) total FROM transactions WHERE status='posted' AND id<>?",
      kind === 'transaction' ? (id ?? 0) : 0
    );
    const total =
      BigInt(Math.abs(amount)) + BigInt(opening?.total ?? 0) + BigInt(ledger?.total ?? 0);
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
      if (
        rows.some((r) => r.version < 1 || r.version > migrations.length) ||
        rows.some((_, index) => !rows.some((r) => r.version === index + 1))
      )
        throw new Error('Unsupported or incomplete migration history. Data has been preserved.');
      for (let i = 0; i < migrations.length; i++)
        if (!rows.some((r) => r.version === i + 1)) {
          await this.db.execAsync(migrations[i]);
          await this.db.runAsync(
            'INSERT INTO schema_migrations VALUES (?,?)',
            i + 1,
            new Date().toISOString()
          );
        }
      await this.db.execAsync(receiptSchema);
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
      await this.convertLedger();
      const foreign = await this.db.getAllAsync('PRAGMA foreign_key_check');
      if (foreign.length)
        throw new Error('Database reference validation failed. Data has been preserved.');
    });
  }
  async snapshot(): Promise<Snapshot> {
    return this.read(async () => {
      const accounts = await this.accountSnapshotCore();
      const categories = await this.db.getAllAsync<Category>(
        'SELECT * FROM categories ORDER BY type,name'
      );
      const transactions = await this.db.getAllAsync<Transaction>(
        `SELECT t.*,${receiptCountSQL} FROM active_transactions t ORDER BY t.date DESC,t.id DESC`
      );
      const settings = Object.fromEntries(
        (
          await this.db.getAllAsync<{ key: string; value: string }>('SELECT * FROM app_settings')
        ).map((r) => [r.key, r.value])
      );
      const splits = await this.db.getAllAsync<ExpenseSplit & { transaction_id: number }>(
        'SELECT * FROM expense_splits ORDER BY id'
      );
      for (const t of transactions)
        t.splits = splits
          .filter((s) => s.transaction_id === t.id)
          .map(({ category_id, amount }) => ({ category_id, amount }));
      return { accounts, categories, transactions, settings };
    });
  }
  saveAccount(
    input: Pick<Account, 'name' | 'type' | 'opening_balance' | 'description'>,
    id?: number
  ) {
    return this.write(() =>
      this.db.withTransactionAsync(async () => {
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
        let accountId = id ?? 0;
        let date = localDate();
        if (id) {
          const role = await this.db.getFirstAsync<{ subtype: string; history_start: string }>(
            'SELECT * FROM account_roles WHERE account_id=?',
            id
          );
          if (!role || role.subtype !== 'standard')
            throw new Error('Manage this account through its card or loan screen.');
          date = role.history_start;
          const old = await this.db.getFirstAsync<Account>('SELECT * FROM accounts WHERE id=?', id);
          await this.db.runAsync(
            'UPDATE accounts SET name=?,type=?,opening_balance=?,description=?,updated_at=? WHERE id=?',
            input.name.trim(),
            input.type,
            input.opening_balance,
            input.description,
            now,
            id
          );
          if (old!.opening_balance !== input.opening_balance)
            await this.openingCore(id, input.opening_balance, date);
        } else {
          await this.db.runAsync(
            'INSERT INTO accounts(name,type,opening_balance,description,created_at,updated_at) VALUES (?,?,?,?,?,?)',
            input.name.trim(),
            input.type,
            input.opening_balance,
            input.description,
            now,
            now
          );
          accountId = (await this.db.getFirstAsync<{ id: number }>(
            'SELECT last_insert_rowid() id'
          ))!.id;
          await this.db.runAsync(
            "INSERT INTO account_roles(account_id,kind,history_start) VALUES (?,'asset',?)",
            accountId,
            date
          );
          await this.accountLedger(accountId);
          await this.openingCore(accountId, input.opening_balance, date);
        }
      })
    );
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
      await this.db.withTransactionAsync(async () => {
        await this.openingCore(id, 0, localDate());
        await this.db.runAsync('DELETE FROM accounts WHERE id=?', id);
      });
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
  receipts(id: number) {
    return this.read(() => transactionReceipts(this.db, id));
  }
  receiptFiles() {
    return this.read(() =>
      this.db.getAllAsync<Receipt>('SELECT id,name,mime_type,size FROM local_receipts')
    );
  }
  saveTransaction(
    input: Omit<Transaction, 'id' | 'created_at' | 'updated_at'>,
    id?: number,
    receipts?: Receipt[]
  ) {
    return this.write(async () => {
      let savedId = 0;
      await this.db.withTransactionAsync(async () => {
        savedId = await this.saveTransactionCore(input, id, receipts);
      });
      return savedId;
    });
  }
  saveExpenseBatch(inputs: Omit<Transaction, 'id' | 'created_at' | 'updated_at'>[]) {
    return this.write(async () => {
      if (!inputs.length || inputs.length > 20 || inputs.some((input) => input.type !== 'expense'))
        throw new Error('Review between 1 and 20 expenses before saving.');
      const ids: number[] = [];
      await this.db.withTransactionAsync(async () => {
        for (const input of inputs) ids.push(await this.saveTransactionCore(input));
      });
      return ids;
    });
  }
  private async saveTransactionCore(
    input: Omit<Transaction, 'id' | 'created_at' | 'updated_at'>,
    id?: number,
    receipts?: Receipt[]
  ) {
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
    if (id && (!previous || previous.status === 'void'))
      throw new Error('Transaction no longer exists.');
    if (
      id &&
      (await this.db.getFirstAsync('SELECT id FROM active_transactions WHERE refund_of_id=?', id))
    )
      throw new Error('Reverse linked refunds before editing this expense.');
    const refundOf = input.refund_of_id ?? previous?.refund_of_id ?? null;
    if (
      refundOf &&
      (input.type !== 'expense' ||
        (input.component ?? previous?.component ?? 'standard') !== 'standard')
    )
      throw new Error('Refunds must be standard expenses linked to their original purchase.');
    if (previous?.loan_id || input.loan_id)
      throw new Error('Manage loan events from the loan details screen.');
    const role = await this.db.getFirstAsync<{ kind: string; subtype: string }>(
      'SELECT * FROM account_roles WHERE account_id=?',
      input.account_id
    );
    if (
      !role ||
      role.subtype.startsWith('loan_') ||
      (role.kind === 'liability' && input.type !== 'expense')
    )
      throw new Error('Use an asset account, or a credit card for purchases.');
    const account = await this.db.getFirstAsync<Account>(
      'SELECT * FROM accounts WHERE id=?',
      input.account_id
    );
    if (!account || (account.archived && previous?.account_id !== account.id && !refundOf))
      throw new Error('Select an active account.');
    if (input.type === 'transfer') {
      const dest = await this.db.getFirstAsync<Account>(
        'SELECT * FROM accounts WHERE id=?',
        input.destination_account_id
      );
      const destRole = await this.db.getFirstAsync<{ subtype: string }>(
        'SELECT subtype FROM account_roles WHERE account_id=?',
        input.destination_account_id
      );
      if (destRole?.subtype.startsWith('loan_'))
        throw new Error('Manage loan principal through the loan screen.');
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
        (category.archived && previous?.category_id !== category.id && !refundOf) ||
        input.destination_account_id !== null
      )
        throw new Error('Choose a compatible active category.');
    }
    const parts =
      input.splits ??
      (id
        ? await this.db.getAllAsync<ExpenseSplit>(
            'SELECT category_id,amount FROM expense_splits WHERE transaction_id=?',
            id
          )
        : []);
    if (parts.length) {
      if (
        input.type !== 'expense' ||
        (input.component ?? previous?.component ?? 'standard') !== 'standard'
      )
        throw new Error('Only standard expenses can be split.');
      validateSplits(input.amount, parts);
      if (!parts.some((part) => part.category_id === input.category_id))
        throw new Error('Select one of the split categories as the transaction category.');
      for (const part of parts) {
        const cat = await this.db.getFirstAsync<Category>(
          'SELECT * FROM categories WHERE id=?',
          part.category_id
        );
        const retained =
          id &&
          (await this.db.getFirstAsync(
            'SELECT id FROM expense_splits WHERE transaction_id=? AND category_id=?',
            id,
            part.category_id
          ));
        if (
          !cat ||
          cat.type !== 'expense' ||
          (cat.archived && !retained && previous?.category_id !== cat.id && !refundOf)
        )
          throw new Error('Splits require active expense categories.');
      }
    }
    if (refundOf) {
      const original = await this.db.getFirstAsync<Transaction>(
        'SELECT * FROM active_transactions WHERE id=?',
        refundOf
      );
      if (
        !original ||
        original.refund_of_id ||
        original.loan_id ||
        original.component !== 'standard' ||
        original.type !== 'expense' ||
        original.id === id ||
        original.account_id !== input.account_id ||
        input.date < original.date
      )
        throw new Error(
          'Refunds require a posted purchase, its original account and a date on or after the purchase.'
        );
      const originalParts = await this.db.getAllAsync<ExpenseSplit>(
        'SELECT category_id,amount FROM expense_splits WHERE transaction_id=?',
        refundOf
      );
      original.splits = originalParts;
      for (const part of allocations({ ...input, splits: parts })) {
        const limit =
          allocations(original).find((p) => p.category_id === part.category_id)?.amount ?? 0;
        const used = await this.db.getFirstAsync<{ amount: number }>(
          'SELECT COALESCE(SUM(c.amount*-1),0) amount FROM category_activity c JOIN active_transactions r ON r.id=c.transaction_id WHERE r.refund_of_id=? AND r.id<>? AND c.category_id=?',
          refundOf,
          id ?? 0,
          part.category_id
        );
        if (part.amount + (used?.amount ?? 0) > limit)
          throw new Error('The refund exceeds the remaining amount in this purchase category.');
      }
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
      input.component ?? previous?.component ?? 'standard',
    ];
    if (id) await this.reverseTransactionCore(id, 'Transaction edit');
    if (id)
      await this.db.runAsync(
        'UPDATE transactions SET type=?,amount=?,account_id=?,destination_account_id=?,category_id=?,description=?,date=?,notes=?,updated_at=?,component=? WHERE id=?',
        ...args,
        id
      );
    else
      await this.db.runAsync(
        'INSERT INTO transactions(type,amount,account_id,destination_account_id,category_id,description,date,notes,updated_at,component,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
        ...args,
        now
      );
    const transactionId =
      id ?? (await this.db.getFirstAsync<{ id: number }>('SELECT last_insert_rowid() id'))!.id;
    await this.db.runAsync(
      'UPDATE transactions SET refund_of_id=? WHERE id=?',
      refundOf,
      transactionId
    );
    // Preserve unchanged split IDs so synchronization does not resurrect tombstones.
    const oldParts = await this.db.getAllAsync<ExpenseSplit & { id: number }>(
      'SELECT * FROM expense_splits WHERE transaction_id=?',
      transactionId
    );
    for (const old of oldParts)
      if (!parts.some((p) => p.category_id === old.category_id))
        await this.db.runAsync('DELETE FROM expense_splits WHERE id=?', old.id);
    for (const part of parts)
      await this.db.runAsync(
        'INSERT INTO expense_splits(transaction_id,category_id,amount) VALUES (?,?,?) ON CONFLICT(transaction_id,category_id) DO UPDATE SET amount=excluded.amount',
        transactionId,
        part.category_id,
        part.amount
      );
    await this.postTransactionCore(transactionId);
    if (receipts !== undefined) await replaceTransactionReceipts(this.db, transactionId, receipts);
    return transactionId;
  }
  deleteTransaction(id: number) {
    return this.write(async () => {
      let removed: Receipt[] = [];
      await this.db.withTransactionAsync(async () => {
        const t = await this.db.getFirstAsync<Transaction>(
          "SELECT * FROM transactions WHERE id=? AND status='posted'",
          id
        );
        if (!t) throw new Error('Transaction no longer exists.');
        if (
          await this.db.getFirstAsync('SELECT id FROM active_transactions WHERE refund_of_id=?', id)
        )
          throw new Error('Reverse linked refunds before deleting this expense.');
        if (t.loan_id) throw new Error('Reverse loan payments from the loan details screen.');
        removed = await transactionReceipts(this.db, id);
        await this.reverseTransactionCore(id, 'Transaction deleted');
        await this.db.runAsync(
          "UPDATE transactions SET status='void',updated_at=? WHERE id=?",
          new Date().toISOString(),
          id
        );
        await this.db.runAsync(
          'DELETE FROM local_receipts WHERE transaction_id=? AND transaction_created_at=?',
          id,
          t.created_at
        );
      });
      return removed;
    });
  }
  settingsSnapshot() {
    return this.read(async () =>
      Object.fromEntries(
        (
          await this.db.getAllAsync<{ key: string; value: string }>('SELECT * FROM app_settings')
        ).map((row) => [row.key, row.value])
      )
    );
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
