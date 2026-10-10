import type { Account, Transaction } from '../types';
export const MAX_MONEY = 1_000_000_000_000;
export function minor(value: string, signed = false): number {
  if (!(signed ? /^-?\d+(\.\d{1,2})?$/ : /^\d+(\.\d{1,2})?$/).test(value.trim()))
    throw new Error('Enter a valid amount with at most two decimal places.');
  const negative = value.trim().startsWith('-');
  const [whole, fraction = ''] = value.trim().replace('-', '').split('.');
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(result) || result > MAX_MONEY) throw new Error('Amount is too large.');
  return negative ? -result : result;
}
export const money = (amount: number, currency = 'INR') =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(amount / 100);
export function localDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  return localDate(new Date(y, m - 1, d)) === value;
}
export function balance(account: Account, transactions: Transaction[]): number {
  return transactions.reduce(
    (sum, t) =>
      sum +
      (t.account_id === account.id ? (t.type === 'income' ? t.amount : -t.amount) : 0) +
      (t.type === 'transfer' && t.destination_account_id === account.id ? t.amount : 0),
    account.opening_balance
  );
}
export function summary(transactions: Transaction[], month: string) {
  const rows = transactions.filter((t) => t.date.slice(0, 7) === month);
  const income = rows.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expense = rows.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  return { income, expense, net: income - expense, count: rows.length, rows };
}
