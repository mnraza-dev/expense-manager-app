import { useCallback, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import type { TransactionFilters } from '../types';
import { repo } from '../db/database';
import { useDatabaseQuery } from '../hooks/useDatabaseQuery';
import { cashFlowSegments } from '../utils/chartData';
import { useTheme } from './ui';
import { QueryState } from './QueryState';
import { AnimatedAmount, ChartSurface } from './charting/AnimatedCharts';
import { ThreeRingChart } from './charting/ThreeRingChart';
export function DailyTransactionSummary({
  date,
  filters,
}: {
  date: string;
  filters: TransactionFilters;
}) {
  const c = useTheme(),
    [selected, setSelected] = useState<string | null>(null);
  const load = useCallback(
    async () => ({
      date,
      rows: await repo().transactionCalendar(date.slice(0, 7), {
        ...filters,
        start: date,
        end: date,
      }),
    }),
    [date, filters]
  );
  const query = useDatabaseQuery(load, 'ledger', { keepPreviousData: true });
  const totals = query.data
    ? (query.data.rows[0] ?? { income: 0, expense: 0, transfers: 0 })
    : undefined;
  const income = totals?.income ?? 0,
    expense = totals?.expense ?? 0;
  const segments = useMemo(() => cashFlowSegments(income, expense), [income, expense]);
  const chosen = segments.find((row) => row.key === selected);
  return (
    <ChartSurface
      title="Daily cash flow"
      subtitle={`${query.data?.date ?? date} · ${query.isPreviousData ? 'Previous selection' : 'matching your filters'}`}
      badge="DAILY">
      <QueryState {...query} />
      {totals && (
        <>
          <ThreeRingChart
            segments={segments}
            selected={selected}
            onSelect={setSelected}
            height={210}
            center={
              <>
                <Text style={{ color: c.muted, fontSize: 11, textAlign: 'center' }}>
                  {chosen?.label ?? 'NET FLOW'}
                </Text>
                <AnimatedAmount
                  amount={chosen?.value ?? income - expense}
                  size={21}
                  color={chosen ? c.text : income - expense >= 0 ? c.positive : c.negative}
                />
              </>
            }
          />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            {[
              { label: 'Income', amount: income, color: c.positive },
              {
                label: expense < 0 ? 'Net refunds' : 'Spent',
                amount: expense,
                color: expense < 0 ? c.positive : c.warning,
              },
              { label: 'Net flow', amount: income - expense, color: c.text },
            ].map((row) => (
              <View key={row.label} style={{ flex: 1, minWidth: 80, gap: 6 }}>
                <Text style={{ color: c.muted, fontSize: 11 }}>{row.label}</Text>
                <AnimatedAmount amount={row.amount} color={row.color} size={16} />
              </View>
            ))}
          </View>
          <Text style={{ color: c.muted, fontSize: 11, lineHeight: 17 }}>
            Ring segments show cash movement; the center shows net flow. {totals.transfers}{' '}
            {totals.transfers === 1 ? 'transfer' : 'transfers'} excluded from cash flow.
          </Text>
        </>
      )}
    </ChartSurface>
  );
}
