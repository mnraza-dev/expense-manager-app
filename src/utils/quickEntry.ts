import type { Account, Category, Transaction, TransactionType } from '../types';
import { MAX_MONEY, localDate } from './finance';
export function recentEntryTemplates(
  transactions: Transaction[],
  accounts: Account[],
  categories: Category[],
  type: TransactionType,
  accountId?: number
): Transaction[] {
  const seen = new Set<string>();
  return [...transactions]
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at) || b.id - a.id)
    .filter((t) => {
      const source = accounts.find((a) => a.id === t.account_id);
      const destination = accounts.find((a) => a.id === t.destination_account_id);
      const category = categories.find((c) => c.id === t.category_id);
      if (
        t.type !== type ||
        t.status === 'void' ||
        t.loan_id ||
        t.refund_of_id ||
        t.split_count ||
        t.splits?.length ||
        (accountId && t.account_id !== accountId) ||
        !Number.isSafeInteger(t.amount) ||
        t.amount <= 0 ||
        t.amount > MAX_MONEY ||
        !source ||
        source.archived ||
        source.subtype?.startsWith('loan_') ||
        (source.kind === 'liability' && type !== 'expense') ||
        (type === 'transfer'
          ? !destination ||
            destination.archived ||
            destination.id === source.id ||
            destination.subtype?.startsWith('loan_') ||
            destination.currency !== source.currency
          : !category || category.archived || category.type !== type)
      )
        return false;
      const key = JSON.stringify([
        t.type,
        t.account_id,
        t.destination_account_id,
        t.category_id,
        t.component ?? 'standard',
        t.description,
      ]);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 6);
}
export function entryFromTemplate(transaction: Transaction, date = localDate()) {
  return {
    type: transaction.type,
    amount: (transaction.amount / 100).toFixed(2),
    account: transaction.account_id,
    destination: transaction.type === 'transfer' ? transaction.destination_account_id : null,
    category: transaction.type === 'transfer' ? null : transaction.category_id,
    description: transaction.description,
    date,
    notes: '',
    component: transaction.component ?? 'standard',
  };
}
