import type { ExpenseSplit, Transaction } from '../types';
export function attachSplits(
  transactions: Transaction[],
  splits: (ExpenseSplit & { transaction_id: number })[]
) {
  const grouped = new Map<number, ExpenseSplit[]>();
  for (const { transaction_id, category_id, amount } of splits) {
    const parts = grouped.get(transaction_id) ?? [];
    parts.push({ category_id, amount });
    grouped.set(transaction_id, parts);
  }
  for (const t of transactions) t.splits = grouped.get(t.id) ?? [];
  return transactions;
}
export interface TransactionContext {
  existing: Transaction | null;
  original: Transaction | null;
  refunds: Transaction[];
}
