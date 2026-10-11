import { localDate, validDate } from './finance';
import type { DateRange, PeriodTotal } from '../types';
export function monthRange(month: string): DateRange {
  if (!/^\d{4}-\d{2}$/.test(month) || !validDate(`${month}-01`))
    throw new Error('Choose a valid month (YYYY-MM).');
  const [y, m] = month.split('-').map(Number);
  return { start: `${month}-01`, end: localDate(new Date(y, m, 0)) };
}
export function shiftMonth(month: string, offset: number) {
  monthRange(month);
  const [y, m] = month.split('-').map(Number);
  return localDate(new Date(y, m - 1 + offset, 1)).slice(0, 7);
}
export function shiftDay(date: string, offset: number) {
  if (!validDate(date) || !Number.isSafeInteger(offset)) throw new Error('Choose a valid day.');
  const [year, month, day] = date.split('-').map(Number);
  const next = localDate(new Date(year, month - 1, day + offset));
  if (!validDate(next)) throw new Error('Choose a valid day.');
  return next;
}
export function monthCalendar(month: string): (string | null)[][] {
  const range = monthRange(month);
  const [year, number] = month.split('-').map(Number);
  const leading = (new Date(year, number - 1, 1).getDay() + 6) % 7;
  const days = Number(range.end.slice(8));
  const cells = Array.from({ length: Math.ceil((leading + days) / 7) * 7 }, (_, index) => {
    const day = index - leading + 1;
    return day < 1 || day > days ? null : `${month}-${String(day).padStart(2, '0')}`;
  });
  return Array.from({ length: cells.length / 7 }, (_, week) => cells.slice(week * 7, week * 7 + 7));
}
export function calendarDays(range: DateRange) {
  const utc = (s: string) => {
    const [y, m, d] = s.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((utc(range.end) - utc(range.start)) / 86400000) + 1;
}
export function validateRange(range: DateRange) {
  if (!validDate(range.start) || !validDate(range.end) || range.start > range.end)
    throw new Error('Choose valid start and end dates in order.');
  if (calendarDays(range) > 3660) throw new Error('Select a date range of at most 10 years.');
}
export type ReportPreset =
  | 'this-month'
  | 'previous-month'
  | '3-months'
  | '6-months'
  | 'this-year'
  | 'previous-year'
  | 'custom';
export function presetRange(
  preset: Exclude<ReportPreset, 'custom'>,
  today = new Date()
): DateRange {
  const month = localDate(today).slice(0, 7);
  const year = today.getFullYear();
  switch (preset) {
    case 'this-month':
      return monthRange(month);
    case 'previous-month':
      return monthRange(shiftMonth(month, -1));
    case '3-months':
      return { start: monthRange(shiftMonth(month, -2)).start, end: monthRange(month).end };
    case '6-months':
      return { start: monthRange(shiftMonth(month, -5)).start, end: monthRange(month).end };
    case 'this-year':
      return { start: `${year}-01-01`, end: `${year}-12-31` };
    case 'previous-year':
      return { start: `${year - 1}-01-01`, end: `${year - 1}-12-31` };
  }
}
export function fillPeriods(range: DateRange, rows: PeriodTotal[], daily: boolean): PeriodTotal[] {
  validateRange(range);
  const map = new Map(rows.map((r) => [r.period, r]));
  const periods: PeriodTotal[] = [];
  if (daily) {
    let current = range.start;
    while (current <= range.end) {
      periods.push(map.get(current) ?? { period: current, income: 0, expense: 0, count: 0 });
      if (current === range.end) break;
      const [y, m, d] = current.split('-').map(Number);
      current = localDate(new Date(y, m - 1, d + 1));
    }
  } else {
    let current = range.start.slice(0, 7);
    while (current <= range.end.slice(0, 7)) {
      periods.push(map.get(current) ?? { period: current, income: 0, expense: 0, count: 0 });
      if (current === range.end.slice(0, 7)) break;
      current = shiftMonth(current, 1);
    }
  }
  return periods;
}
