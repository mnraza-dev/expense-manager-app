import { useCallback } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import type { TransactionFilters } from '../types';
import { repo } from '../db/database';
import { useDatabaseQuery } from '../hooks/useDatabaseQuery';
import { localDate, money } from '../utils/finance';
import { monthCalendar } from '../utils/periods';
import { MotionPressable } from './Motion';
import { DepthSurface, FinanceArt } from './Depth';
import { Button, useTheme } from './ui';

const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function TransactionCalendar({
  month,
  filters,
  selectedDate,
  onSelect,
}: {
  month: string;
  filters: TransactionFilters;
  selectedDate: string | null;
  onSelect: (date: string | null) => void;
}) {
  const c = useTheme();
  const load = useCallback(() => repo().transactionCalendar(month, filters), [month, filters]);
  const calendar = useDatabaseQuery(load, 'ledger');
  const days = new Map(calendar.data?.map((day) => [day.date, day]));
  const totals = (calendar.data ?? []).reduce(
    (sum, day) => ({ income: sum.income + day.income, expense: sum.expense + day.expense }),
    { income: 0, expense: 0 }
  );
  const today = localDate();
  return (
    <DepthSurface
      edgeColor={c.border}
      faceStyle={{ backgroundColor: c.card, borderRadius: 20, padding: 12, gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <FinanceArt kind="calendar" colors={c} size={44} />
        <Text style={{ color: c.text, fontWeight: '600', flex: 1 }}>Daily activity</Text>
      </View>
      <View style={{ flexDirection: 'row' }}>
        {weekdays.map((day) => (
          <Text key={day} style={{ flex: 1, textAlign: 'center', color: c.muted, fontSize: 12 }}>
            {day}
          </Text>
        ))}
      </View>
      <View>
        {monthCalendar(month).map((week, index) => (
          <View key={index} style={{ flexDirection: 'row' }}>
            {week.map((date, column) => {
              if (!date) return <View key={`blank-${column}`} style={{ flex: 1 }} />;
              const day = days.get(date);
              const selected = date === selectedDate;
              const disabled = Boolean(
                (filters.start && date < filters.start) || (filters.end && date > filters.end)
              );
              const markers = [
                { label: 'Income', color: c.positive, visible: Boolean(day?.income) },
                { label: 'Expense', color: c.negative, visible: Boolean(day?.expense) },
                { label: 'Transfer', color: c.muted, visible: Boolean(day?.transfers) },
              ];
              return (
                <MotionPressable
                  key={date}
                  accessibilityRole="button"
                  accessibilityLabel={`${date}${date === today ? ', today' : ''}, ${
                    calendar.loading
                      ? 'loading activity'
                      : calendar.error
                        ? 'activity unavailable'
                        : `${day?.count ?? 0} matching transactions`
                  }`}
                  accessibilityState={{ selected, disabled }}
                  disabled={disabled}
                  onPress={() => onSelect(selected ? null : date)}
                  style={{
                    flex: 1,
                    minHeight: 46,
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 4,
                    marginVertical: 2,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: date === today ? c.accent : 'transparent',
                    backgroundColor: selected ? c.accent : 'transparent',
                    opacity: disabled ? 0.35 : 1,
                  }}>
                  <Text
                    style={{
                      color: selected ? c.onAccent : c.text,
                      fontWeight: selected || date === today ? '700' : '400',
                    }}>
                    {Number(date.slice(8))}
                  </Text>
                  <View accessible={false} style={{ height: 5, flexDirection: 'row', gap: 3 }}>
                    {markers
                      .filter((marker) => marker.visible)
                      .map((marker) => (
                        <View
                          key={marker.label}
                          style={{
                            width: 4,
                            height: 4,
                            borderRadius: 2,
                            backgroundColor: selected ? c.onAccent : marker.color,
                          }}
                        />
                      ))}
                  </View>
                </MotionPressable>
              );
            })}
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {[
          { label: 'Income', color: c.positive },
          { label: 'Expense', color: c.negative },
          { label: 'Transfer', color: c.muted },
        ].map(({ label, color }) => (
          <View key={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: color }} />
            <Text style={{ color: c.muted, fontSize: 12 }}>{label}</Text>
          </View>
        ))}
      </View>
      {calendar.loading ? (
        <ActivityIndicator accessibilityLabel="Loading calendar activity" color={c.accent} />
      ) : calendar.error ? (
        <>
          <Text accessibilityLiveRegion="polite" style={{ color: c.negative }}>
            {calendar.error}
          </Text>
          <Button secondary title="Retry calendar" onPress={calendar.retry} />
        </>
      ) : (
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: 16,
            borderTopWidth: 1,
            borderColor: c.border,
            paddingTop: 12,
          }}>
          <View style={{ flex: 1, minWidth: 100 }}>
            <Text style={{ color: c.muted, fontSize: 12 }}>Matching monthly income</Text>
            <Text
              style={{
                color: c.positive,
                fontWeight: '600',
                fontVariant: ['tabular-nums'],
                marginTop: 4,
              }}>
              {money(totals.income)}
            </Text>
          </View>
          <View style={{ flex: 1, minWidth: 100 }}>
            <Text style={{ color: c.muted, fontSize: 12 }}>Matching monthly spending</Text>
            <Text
              style={{
                color: c.negative,
                fontWeight: '600',
                fontVariant: ['tabular-nums'],
                marginTop: 4,
              }}>
              {money(totals.expense)}
            </Text>
          </View>
        </View>
      )}
      <Text style={{ color: c.muted, fontSize: 12 }}>
        Tap a day to view its transactions. Tap it again to show the month.
      </Text>
    </DepthSurface>
  );
}
