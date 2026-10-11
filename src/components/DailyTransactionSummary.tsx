import { useCallback } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import type { TransactionFilters } from '../types';
import { repo } from '../db/database';
import { useDatabaseQuery } from '../hooks/useDatabaseQuery';
import { money } from '../utils/finance';
import { DepthSurface, FinanceArt } from './Depth';
import { Button, useTheme } from './ui';

export function DailyTransactionSummary({
  date,
  filters,
}: {
  date: string;
  filters: TransactionFilters;
}) {
  const c = useTheme();
  const load = useCallback(
    () => repo().transactionCalendar(date.slice(0, 7), { ...filters, start: date, end: date }),
    [date, filters]
  );
  const query = useDatabaseQuery(load, 'ledger');
  const totals = query.data?.[0] ?? { income: 0, expense: 0, transfers: 0 };
  return (
    <DepthSurface
      edgeColor={c.border}
      faceStyle={{ backgroundColor: c.card, padding: 16, gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <FinanceArt kind="coins" colors={c} size={44} />
        <Text style={{ color: c.text, fontWeight: '600', flex: 1 }}>Matching daily totals</Text>
      </View>
      {query.loading ? (
        <ActivityIndicator accessibilityLabel="Loading daily totals" color={c.accent} />
      ) : query.error ? (
        <>
          <Text accessibilityLiveRegion="polite" style={{ color: c.negative }}>
            {query.error}
          </Text>
          <Button secondary title="Retry daily totals" onPress={query.retry} />
        </>
      ) : (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            {[
              { label: 'Income', amount: totals.income, color: c.positive },
              { label: 'Spent', amount: totals.expense, color: c.negative },
              { label: 'Net', amount: totals.income - totals.expense, color: c.text },
            ].map(({ label, amount, color }) => (
              <View key={label} style={{ flex: 1, minWidth: 90, gap: 4 }}>
                <Text style={{ color: c.muted, fontSize: 12 }}>{label}</Text>
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.65}
                  style={{ color, fontWeight: '600', fontVariant: ['tabular-nums'] }}>
                  {money(amount)}
                </Text>
              </View>
            ))}
          </View>
          <Text style={{ color: c.muted, fontSize: 12 }}>
            {totals.transfers} {totals.transfers === 1 ? 'transfer' : 'transfers'} · excluded from
            income and spending
          </Text>
        </>
      )}
    </DepthSurface>
  );
}
