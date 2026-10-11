import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Text, View } from 'react-native';
import { CalendarDays, List, Sun } from 'lucide-react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import type { Transaction, TransactionFilters } from '../../src/types';
import { useFinance } from '../../src/store/useFinance';
import { Button, Empty, Field, Label, Screen, useTheme } from '../../src/components/ui';
import { TransactionItem } from '../../src/components/TransactionItem';
import { TransactionFilterSheet } from '../../src/components/TransactionFilterSheet';
import { MonthSelector } from '../../src/components/MonthSelector';
import { TransactionCalendar } from '../../src/components/TransactionCalendar';
import { DaySelector } from '../../src/components/DaySelector';
import { DailyTransactionSummary } from '../../src/components/DailyTransactionSummary';
import { MotionPressable } from '../../src/components/Motion';
import { localDate } from '../../src/utils/finance';
import { monthRange } from '../../src/utils/periods';
import { notify } from '../../src/store/useFeedback';
import { repo } from '../../src/db/database';
import { VoiceEntryButton } from '../../src/components/VoiceEntryButton';
export default function Transactions() {
  const router = useRouter();
  const c = useTheme();
  const revision = useFinance((s) => s.revision);
  const [search, setSearch] = useState(''),
    [debounced, setDebounced] = useState('');
  const [filters, setFilters] = useState<TransactionFilters>(() => ({
    sort: 'newest',
    ...monthRange(localDate().slice(0, 7)),
  }));
  const [month, setMonth] = useState(() => localDate().slice(0, 7));
  const [view, setView] = useState<'list' | 'calendar' | 'daily'>('list');
  const [day, setDay] = useState(() => localDate());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [sheet, setSheet] = useState(false),
    [page, setPage] = useState(0),
    [retry, setRetry] = useState(0);
  const [rows, setRows] = useState<Transaction[]>([]),
    [count, setCount] = useState(0),
    [loading, setLoading] = useState(true),
    [error, setError] = useState<string | null>(null);
  const matchingFilters = useMemo(() => ({ ...filters, query: debounced }), [filters, debounced]);
  const queryFilters = useMemo(() => {
    if (view === 'list') return matchingFilters;
    if (view === 'daily') return { ...matchingFilters, start: day, end: day };
    const range = monthRange(month);
    return {
      ...matchingFilters,
      start:
        selectedDate ??
        (filters.start && filters.start > range.start ? filters.start : range.start),
      end: selectedDate ?? (filters.end && filters.end < range.end ? filters.end : range.end),
    };
  }, [matchingFilters, filters.start, filters.end, view, month, selectedDate, day]);
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(search);
      setPage(0);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);
  useFocusEffect(
    useCallback(() => {
      setPage(0);
    }, [])
  );
  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoading(true);
      setError(null);
      if (page === 0) {
        setRows([]);
        setCount(0);
      }
      const query =
        queryFilters.start && queryFilters.end && queryFilters.start > queryFilters.end
          ? Promise.resolve({ rows: [] as Transaction[], count: 0 })
          : Promise.resolve().then(() => repo().searchTransactions(queryFilters, page * 50, 50));
      query
        .then((result) => {
          if (!active) return;
          setCount(result.count);
          setRows((previous) =>
            page === 0
              ? result.rows
              : [
                  ...previous.filter((t) => !result.rows.some((next) => next.id === t.id)),
                  ...result.rows,
                ]
          );
          setLoading(false);
        })
        .catch(() => {
          if (active) {
            setError('Unable to load matching transactions. Please retry.');
            setLoading(false);
          }
        });
      return () => {
        active = false;
      };
      // Ledger mutations and retry requests must invalidate the query even when filters are unchanged.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [queryFilters, page, revision, retry])
  );
  const changeDay = (date: string) => {
    setDay(date);
    setMonth(date.slice(0, 7));
    setFilters((previous) => ({ ...previous, start: date, end: date }));
    setSelectedDate(null);
    setPage(0);
  };
  const apply = (value: TransactionFilters) => {
    if (view === 'daily') {
      setFilters({ ...value, start: day, end: day });
    } else {
      setFilters(value);
      if (value.start) setMonth(value.start.slice(0, 7));
    }
    setSelectedDate(null);
    notify('Filters applied');
    setPage(0);
  };
  const clear = () => {
    setSearch('');
    setDebounced('');
    setFilters(view === 'daily' ? { sort: 'newest', start: day, end: day } : { sort: 'newest' });
    setSelectedDate(null);
    setPage(0);
  };
  return (
    <Screen
      title="Transactions"
      scroll={false}
      action={() => router.push('/transaction/add')}
      headerActions={<VoiceEntryButton compact />}>
      {(header) => (
        <>
          <FlatList
            style={{ flex: 1, marginBottom: 16 }}
            contentContainerStyle={{ paddingBottom: 24 }}
            showsVerticalScrollIndicator={false}
            showsHorizontalScrollIndicator={false}
            automaticallyAdjustContentInsets={false}
            contentInsetAdjustmentBehavior="never"
            keyboardShouldPersistTaps="handled"
            data={rows}
            keyExtractor={(item) => String(item.id)}
            ListHeaderComponent={
              <View style={{ gap: 12 }}>
                {header}
                <View style={{ paddingTop: 24, gap: 12 }}>
                  <View
                    accessibilityRole="tablist"
                    style={{
                      flexDirection: 'row',
                      backgroundColor: c.soft,
                      padding: 4,
                      borderRadius: 16,
                    }}>
                    {(
                      [
                        { value: 'list', label: 'List', Icon: List },
                        { value: 'calendar', label: 'Calendar', Icon: CalendarDays },
                        { value: 'daily', label: 'Daily', Icon: Sun },
                      ] as const
                    ).map(({ value, label, Icon }) => (
                      <MotionPressable
                        key={value}
                        accessibilityRole="tab"
                        accessibilityState={{ selected: view === value }}
                        onPress={() => {
                          if (value === 'daily') {
                            changeDay(
                              selectedDate ?? (day.slice(0, 7) === month ? day : `${month}-01`)
                            );
                          } else if (view === 'daily') {
                            setMonth(day.slice(0, 7));
                            setFilters((previous) => ({
                              ...previous,
                              ...monthRange(day.slice(0, 7)),
                            }));
                          }
                          setView(value);
                          setSelectedDate(null);
                          setPage(0);
                        }}
                        style={{
                          flex: 1,
                          minHeight: 44,
                          flexDirection: 'row',
                          gap: 6,
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderRadius: 12,
                          backgroundColor: view === value ? c.card : 'transparent',
                        }}>
                        <Icon size={18} color={view === value ? c.accent : c.muted} />
                        <Text
                          style={{
                            color: view === value ? c.text : c.muted,
                            fontSize: 13,
                            fontWeight: '600',
                            flexShrink: 1,
                          }}>
                          {label}
                        </Text>
                      </MotionPressable>
                    ))}
                  </View>
                  <Field
                    label="Search"
                    placeholder="Search your transactions…"
                    value={search}
                    onChangeText={setSearch}
                  />
                  {view === 'list' && !filters.start && !filters.end && (
                    <Label small>Showing all dates · select a month to narrow results</Label>
                  )}
                  {view === 'daily' ? (
                    <>
                      <DaySelector date={day} onChange={changeDay} />
                      <DailyTransactionSummary date={day} filters={matchingFilters} />
                    </>
                  ) : (
                    <MonthSelector
                      month={month}
                      onChange={(m) => {
                        setMonth(m);
                        apply({ ...filters, ...monthRange(m) });
                      }}
                    />
                  )}
                  {view === 'calendar' && (
                    <TransactionCalendar
                      month={month}
                      filters={matchingFilters}
                      selectedDate={selectedDate}
                      onSelect={(date) => {
                        setSelectedDate(date);
                        setPage(0);
                      }}
                    />
                  )}
                  <Button secondary title="Filter & sort" onPress={() => setSheet(true)} />
                  {(search ||
                    Object.entries(filters).some(([key, value]) =>
                      key === 'sort'
                        ? value !== 'newest'
                        : view === 'daily' && (key === 'start' || key === 'end')
                          ? false
                          : value !== undefined
                    )) && (
                    <Button
                      secondary
                      title={
                        view === 'daily'
                          ? 'Clear search & other filters'
                          : 'Clear all filters & search'
                      }
                      onPress={clear}
                    />
                  )}
                  <Label small>
                    {loading ? 'Searching…' : `${count} matching transactions`}
                    {view === 'calendar' ? ` · ${selectedDate ?? month}` : ''}
                    {view === 'daily' ? ` · ${day}` : ''}
                    {filters.sort && filters.sort !== 'newest' ? ` · ${filters.sort} first` : ''}
                  </Label>
                </View>
              </View>
            }
            renderItem={({ item, index }) => (
              <View>
                {(index === 0 || rows[index - 1]?.date !== item.date) && <Label>{item.date}</Label>}
                <TransactionItem item={item} />
              </View>
            )}
            ListEmptyComponent={
              loading ? (
                <ActivityIndicator color={c.accent} />
              ) : error ? (
                <>
                  <Label>{error}</Label>
                  <Button title="Retry search" onPress={() => setRetry((n) => n + 1)} />
                </>
              ) : (
                <Empty
                  title={
                    view === 'daily' || selectedDate
                      ? 'No transactions on this day'
                      : 'No transactions found'
                  }
                  detail={
                    view === 'daily'
                      ? 'Choose another day or adjust your search and filters.'
                      : selectedDate
                        ? 'Choose another day, or tap the selected day again to view the month.'
                        : 'Adjust your search or clear the filters to explore other entries.'
                  }
                />
              )
            }
            ListFooterComponent={
              rows.length > 0 ? (
                <View>
                  {error && (
                    <>
                      <Label>{error}</Label>
                      <Button title="Retry loading" onPress={() => setRetry((n) => n + 1)} />
                    </>
                  )}
                  {loading ? (
                    <ActivityIndicator color={c.accent} />
                  ) : rows.length < count ? (
                    <Button
                      secondary
                      title={`Load more (${rows.length} of ${count})`}
                      onPress={() => setPage((p) => p + 1)}
                    />
                  ) : null}
                </View>
              ) : null
            }
          />
          {sheet && (
            <TransactionFilterSheet
              fixedDate={view === 'daily' ? day : undefined}
              visible={sheet}
              initial={filters}
              onApply={apply}
              onClose={() => setSheet(false)}
              onClear={clear}
            />
          )}
        </>
      )}
    </Screen>
  );
}
