import type { CategoryTotal, PeriodTotal } from '../types';
export const chartColors = ['#28B69C', '#6487E8', '#EDA85A', '#B58CDD', '#EB7F92', '#8EA6B1'];
export interface RingSegment {
  key: string;
  label: string;
  value: number;
  color: string;
}
export function cashFlowSegments(income: number, expense: number): RingSegment[] {
  return [
    { key: 'income', label: 'Income', value: income, color: chartColors[0] },
    { key: expense < 0 ? 'refund' : 'expense', label: expense < 0 ? 'Refund credit' : 'Spending', value: Math.abs(expense), color: expense < 0 ? chartColors[3] : chartColors[2] },
  ].filter((row) => row.value > 0);
}
export function budgetRingSegments(limit: number, spent: number, color: string, track: string): RingSegment[] {
  if (limit <= 0) return [];
  const used = Math.max(0, Math.min(limit, spent));
  return [
    { key: 'used', label: 'Budget used', value: used, color },
    { key: 'remaining', label: 'Unused limit', value: limit - used, color: track },
  ].filter((row) => row.value > 0);
}
export function categoryRingSegments(categories: CategoryTotal[]): RingSegment[] {
  const positive = categories.filter((row) => row.amount > 0).sort((a, b) => b.amount - a.amount);
  const visible = positive.length > 6 ? positive.slice(0, 5) : positive;
  const segments = visible.map((row, index) => ({
    key: String(row.id),
    label: row.name,
    value: row.amount,
    color: chartColors[index],
  }));
  if (positive.length > 6)
    segments.push({
      key: 'other',
      label: 'Other categories',
      value: positive.slice(5).reduce((sum, row) => sum + row.amount, 0),
      color: chartColors[5],
    });
  return segments;
}
export function ringArcs(segments: RingSegment[]) {
  const valid = segments.filter((segment) => Number.isFinite(segment.value) && segment.value > 0);
  const total = valid.reduce((sum, segment) => sum + segment.value, 0);
  let position = -Math.PI / 2;
  return valid.map((segment) => {
    const angle = (segment.value / total) * Math.PI * 2;
    const arc = {
      ...segment,
      start: position,
      end: position + angle,
      fraction: segment.value / total,
    };
    position += angle;
    return arc;
  });
}
export interface ChartPeriod extends PeriodTotal {
  endPeriod: string;
}
// Long ranges are grouped into adjacent buckets, preserving every amount and transaction count.
export function chartPeriods(periods: PeriodTotal[], maximum = 40): ChartPeriod[] {
  if (!Number.isInteger(maximum) || maximum < 1) throw new Error('Invalid chart bucket count.');
  const size = Math.max(1, Math.ceil(periods.length / maximum));
  const result: ChartPeriod[] = [];
  for (let index = 0; index < periods.length; index += size) {
    const bucket = periods.slice(index, index + size);
    result.push({
      period: bucket[0].period,
      endPeriod: bucket[bucket.length - 1].period,
      income: bucket.reduce((sum, row) => sum + row.income, 0),
      expense: bucket.reduce((sum, row) => sum + row.expense, 0),
      count: bucket.reduce((sum, row) => sum + row.count, 0),
    });
  }
  return result;
}
export function chartDomain(values: number[], height = 180) {
  const min = Math.min(0, ...values),
    max = Math.max(0, ...values);
  const span = max - min || 1;
  const low = min < 0 ? min - span * 0.08 : 0;
  const high = max > 0 ? max + span * 0.12 : 0;
  const range = high - low || 1;
  const y = (value: number) => height - ((value - low) / range) * height;
  return { min: low, max: high, zero: y(0), y };
}
export function curvePath(points: { x: number; y: number }[]) {
  if (!points.length) return '';
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let index = 1; index < points.length; index++) {
    const previous = points[index - 1],
      point = points[index];
    const middle = (previous.x + point.x) / 2;
    path += ` C ${middle} ${previous.y}, ${middle} ${point.y}, ${point.x} ${point.y}`;
  }
  return path;
}
