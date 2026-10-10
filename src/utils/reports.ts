import type { DateRange } from '../types';
import { calendarDays } from './periods';
// Averages always use all inclusive calendar days, even for an ongoing full-month preset.
// A future linked refund/reversal model must change expense aggregation explicitly; income is not a reversal.
export function reportMetrics(
  totals: { income: number; expense: number; count: number },
  range: DateRange
) {
  const days = calendarDays(range);
  return {
    ...totals,
    net: totals.income - totals.expense,
    days,
    dailyAverage: totals.expense / days,
  };
}
