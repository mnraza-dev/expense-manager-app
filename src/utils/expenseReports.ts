import type { ExportRow } from './export';
import { localDate, validDate } from './finance';
export type ExpensePeriod = 'daily' | 'weekly' | 'monthly' | 'all';
export type ExpenseGroup = { period: string; currency: string; amount: number; count: number };
function calendar(date: string) {
  if (!validDate(date)) throw new Error('Choose a valid calendar date (YYYY-MM-DD).');
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}
export function expensePeriodRange(
  period: ExpensePeriod,
  anchor: string
): { start?: string; end?: string } {
  if (period === 'all') return {};
  const date = calendar(anchor);
  if (period === 'daily') return { start: anchor, end: anchor };
  if (period === 'weekly') {
    date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
    const start = localDate(date);
    date.setDate(date.getDate() + 6);
    return { start, end: localDate(date) };
  }
  return {
    start: localDate(new Date(date.getFullYear(), date.getMonth(), 1, 12)),
    end: localDate(new Date(date.getFullYear(), date.getMonth() + 1, 0, 12)),
  };
}
export function moveExpensePeriod(period: ExpensePeriod, anchor: string, direction: -1 | 1) {
  const date = calendar(anchor);
  if (period === 'monthly') {
    date.setDate(1);
    date.setMonth(date.getMonth() + direction);
  } else date.setDate(date.getDate() + direction * (period === 'weekly' ? 7 : 1));
  return localDate(date);
}
export function expenseGroups(
  rows: ExportRow[],
  period: Exclude<ExpensePeriod, 'all'>
): ExpenseGroup[] {
  const groups = new Map<
    string,
    { period: string; currency: string; amount: bigint; count: number }
  >();
  for (const row of rows) {
    if (row.type !== 'expense') continue;
    if (!Number.isSafeInteger(row.amount) || row.amount === 0)
      throw new Error('Invalid expense amount in export.');
    const keyDate =
      period === 'monthly' ? row.date.slice(0, 7) : expensePeriodRange(period, row.date).start!;
    const key = `${keyDate}|${row.currency}`;
    const group = groups.get(key) ?? {
      period: keyDate,
      currency: row.currency,
      amount: 0n,
      count: 0,
    };
    group.amount += BigInt(row.amount);
    group.count++;
    groups.set(key, group);
  }
  return [...groups.values()]
    .sort((a, b) => a.period.localeCompare(b.period) || a.currency.localeCompare(b.currency))
    .map((g) => {
      if (g.amount > BigInt(Number.MAX_SAFE_INTEGER) || g.amount < -BigInt(Number.MAX_SAFE_INTEGER))
        throw new Error('Expense totals exceed supported precision. Select a smaller range.');
      return { ...g, amount: Number(g.amount) };
    });
}
export function expenseCurrencyTotals(rows: ExportRow[]) {
  const groups = new Map<string, bigint>();
  for (const row of rows)
    if (row.type === 'expense')
      groups.set(row.currency, (groups.get(row.currency) ?? 0n) + BigInt(row.amount));
  return [...groups].map(([currency, amount]) => {
    if (amount > BigInt(Number.MAX_SAFE_INTEGER) || amount < -BigInt(Number.MAX_SAFE_INTEGER))
      throw new Error('Expense totals exceed supported precision. Select a smaller range.');
    return { currency, amount: Number(amount) };
  });
}
export function expenseReportLabel(period: ExpensePeriod, anchor: string) {
  if (period === 'all') return 'All expense history';
  const { start, end } = expensePeriodRange(period, anchor);
  return `${period === 'daily' ? 'Daily' : period === 'weekly' ? 'Weekly' : 'Monthly'} expenses · ${start}${start === end ? '' : ` to ${end}`}`;
}
