import { localDate, validDate } from './finance';
import type { Frequency, InterestMethod } from '../typesAdvanced';
export function scheduledDate(start: string, frequency: Frequency, index: number) {
  if (!validDate(start) || !Number.isInteger(index) || index < 0)
    throw new Error('Invalid schedule.');
  const [y, m, d] = start.split('-').map(Number);
  if (frequency === 'daily' || frequency === 'weekly')
    return localDate(new Date(y, m - 1, d + index * (frequency === 'daily' ? 1 : 7)));
  const step = frequency === 'monthly' ? 1 : frequency === 'quarterly' ? 3 : 12;
  const first = new Date(y, m - 1 + index * step, 1);
  const max = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  return localDate(new Date(first.getFullYear(), first.getMonth(), Math.min(d, max)));
}
export function dayInMonth(month: string, day: number) {
  if (!Number.isInteger(day) || day < 1 || day > 31)
    throw new Error('Day must be between 1 and 31.');
  const [y, m] = month.split('-').map(Number);
  return localDate(new Date(y, m - 1, Math.min(day, new Date(y, m, 0).getDate())));
}
export function statementPeriod(month: string, closingDay: number, dueDay: number) {
  const end = dayInMonth(month, closingDay);
  if (!validDate(end)) throw new Error('Invalid statement month.');
  const [y, m] = month.split('-').map(Number);
  const previous = dayInMonth(localDate(new Date(y, m - 2, 1)).slice(0, 7), closingDay);
  const [py, pm, pd] = previous.split('-').map(Number);
  const start = localDate(new Date(py, pm - 1, pd + 1));
  let due = dayInMonth(month, dueDay);
  if (due <= end) due = dayInMonth(localDate(new Date(y, m, 1)).slice(0, 7), dueDay);
  return { start, end, due };
}
export function interestMinor(principal: number, rateBps: number, months: number) {
  return Number((BigInt(principal) * BigInt(rateBps) * BigInt(months) + 60000n) / 120000n);
}
export function loanForecast(input: {
  principal: number;
  originalPrincipal: number;
  rateBps: number;
  method: InterestMethod;
  frequency: 'monthly' | 'quarterly' | 'yearly';
  periods: number;
  start: string;
}) {
  const months = input.frequency === 'monthly' ? 1 : input.frequency === 'quarterly' ? 3 : 12;
  if (
    !Number.isSafeInteger(input.principal) ||
    input.principal < 0 ||
    !Number.isInteger(input.periods) ||
    input.periods < 1 ||
    input.periods > 600
  )
    throw new Error('Invalid loan term.');
  let outstanding = input.principal;
  const base = Math.floor(input.principal / input.periods),
    extra = input.principal % input.periods;
  return Array.from({ length: input.periods }, (_, i) => {
    const principal = base + (i < extra ? 1 : 0);
    const interest =
      input.method === 'none'
        ? 0
        : interestMinor(
            input.method === 'flat' ? input.originalPrincipal : outstanding,
            input.rateBps,
            months
          );
    outstanding -= principal;
    return { due_date: scheduledDate(input.start, input.frequency, i + 1), principal, interest };
  });
}
