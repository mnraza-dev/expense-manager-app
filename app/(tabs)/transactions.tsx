import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import type { Transaction, TransactionFilters } from '../../src/types';
import { useFinance } from '../../src/store/useFinance';
import { Button, Empty, Field, Label, Screen, useTheme } from '../../src/components/ui';
import { TransactionItem } from '../../src/components/TransactionItem';
import {
  ActiveFilterChips,
  TransactionFilterSheet,
} from '../../src/components/TransactionFilterSheet';
import { repo } from '../../src/db/database';
export default function Transactions() {
  const router = useRouter();
  const c = useTheme();
  const revision = useFinance((s) => s.revision);
  const [search, setSearch] = useState(''),
    [debounced, setDebounced] = useState('');
  const [filters, setFilters] = useState<TransactionFilters>({ sort: 'newest' });
  const [sheet, setSheet] = useState(false),
    [page, setPage] = useState(0),
    [retry, setRetry] = useState(0);
  const [rows, setRows] = useState<Transaction[]>([]),
    [count, setCount] = useState(0),
    [loading, setLoading] = useState(true),
    [error, setError] = useState<string | null>(null);
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
      repo()
        .searchTransactions({ ...filters, query: debounced }, page * 50, 50)
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
    }, [filters, debounced, page, revision, retry])
  );
  const apply = (value: TransactionFilters) => {
    setFilters(value);
    setPage(0);
  };
  const clear = () => {
    setSearch('');
    setDebounced('');
    setFilters({ sort: 'newest' });
    setPage(0);
  };
  return (
    <Screen
      title="Transactions"
      subtitle="Search the story behind every entry"
      scroll={false}
      action={() => router.push('/transaction/add')}>
      <Field
        label="Search description, notes, category or account"
        placeholder="Search your transactions…"
        value={search}
        onChangeText={setSearch}
      />
      <Button secondary title="Filter & sort" onPress={() => setSheet(true)} />
      {(search ||
        Object.entries(filters).some(([key, value]) =>
          key !== 'sort' ? value !== undefined : value !== 'newest'
        )) && <Button secondary title="Clear all filters & search" onPress={clear} />}
      <ActiveFilterChips
        filters={filters}
        onRemove={(key) => {
          setFilters((v) => ({ ...v, [key]: undefined }));
          setPage(0);
        }}
      />
      <Label small>
        {loading ? 'Searching…' : `${count} matching transactions`}
        {filters.sort && filters.sort !== 'newest' ? ` · ${filters.sort} first` : ''}
      </Label>
      <FlatList
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        data={rows}
        keyExtractor={(item) => String(item.id)}
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
              title="No transactions found"
              detail="Adjust your search or clear the filters to explore other entries."
            />
          )
        }
        ListFooterComponent={
          rows.length > 0 ? (
            <View style={{ paddingBottom: 30 }}>
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
          visible={sheet}
          initial={filters}
          onApply={apply}
          onClose={() => setSheet(false)}
          onClear={clear}
        />
      )}
    </Screen>
  );
}
