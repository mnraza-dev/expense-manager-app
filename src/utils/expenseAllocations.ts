import type { ExpenseSplit, Transaction } from '../types';
import { MAX_MONEY } from './finance';
export function expenseAmount(t: Pick<Transaction, 'amount' | 'refund_of_id'>) {
  return t.refund_of_id ? -t.amount : t.amount;
}
export function allocations(
  t: Pick<Transaction, 'amount' | 'category_id' | 'splits'>
): ExpenseSplit[] {
  return t.splits?.length
    ? t.splits
    : t.category_id
      ? [{ category_id: t.category_id, amount: t.amount }]
      : [];
}
export function validateSplits(amount: number, parts: ExpenseSplit[]) {
  if (
    parts.length < 2 ||
    parts.length > 20 ||
    new Set(parts.map((p) => p.category_id)).size !== parts.length ||
    parts.some(
      (p) =>
        !Number.isSafeInteger(p.category_id) ||
        p.category_id <= 0 ||
        !Number.isSafeInteger(p.amount) ||
        p.amount <= 0 ||
        p.amount > MAX_MONEY
    ) ||
    parts.reduce((s, p) => s + BigInt(p.amount), 0n) !== BigInt(amount)
  )
    throw new Error(
      'Use 2–20 different expense categories with positive amounts that add up exactly to the total.'
    );
}
export function remainingRefundParts(
  original: Transaction,
  refunds: Transaction[]
): ExpenseSplit[] {
  return allocations(original)
    .map((p) => ({
      ...p,
      amount:
        p.amount -
        refunds
          .filter((r) => r.status !== 'void' && r.refund_of_id === original.id)
          .reduce(
            (s, r) =>
              s +
              allocations(r)
                .filter((a) => a.category_id === p.category_id)
                .reduce((n, a) => n + a.amount, 0),
            0
          ),
    }))
    .filter((p) => p.amount > 0);
}
