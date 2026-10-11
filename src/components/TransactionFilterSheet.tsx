import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { BottomSheet } from './BottomSheet';
import type { TransactionFilters, TransactionSort, TransactionType } from '../types';
import { useFinance } from '../store/useFinance';
import { minor, money, validDate } from '../utils/finance';
import { Button, Choices, Field, Label, styles } from './ui';
export function TransactionFilterSheet({
  visible,
  initial,
  onApply,
  onClose,
  onClear,
}: {
  visible: boolean;
  initial: TransactionFilters;
  onApply: (filters: TransactionFilters) => void;
  onClose: () => void;
  onClear: () => void;
}) {
  const accounts = useFinance((s) => s.accounts),
    categories = useFinance((s) => s.categories);
  const [draft, setDraft] = useState<TransactionFilters>(initial);
  const [min, setMin] = useState(
      initial.min_amount === undefined ? '' : (initial.min_amount / 100).toFixed(2)
    ),
    [max, setMax] = useState(
      initial.max_amount === undefined ? '' : (initial.max_amount / 100).toFixed(2)
    ),
    [error, setError] = useState<string | null>(null);
  const apply = (dismiss: () => void) => {
    try {
      if (
        (draft.start && !validDate(draft.start)) ||
        (draft.end && !validDate(draft.end)) ||
        (draft.start && draft.end && draft.start > draft.end)
      )
        throw new Error('Choose valid start and end dates in order.');
      const min_amount = min.trim() ? minor(min) : undefined,
        max_amount = max.trim() ? minor(max) : undefined;
      if (min_amount !== undefined && max_amount !== undefined && min_amount > max_amount)
        throw new Error('Minimum amount cannot exceed maximum amount.');
      onApply({ ...draft, min_amount, max_amount });
      dismiss();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Check the filter values.');
    }
  };
  return (
    <BottomSheet visible={visible} onClose={onClose}>
      {(dismiss) => (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.page}>
            <Label>Filter & sort transactions</Label>
            <Label small>Combine any filters. Amount and date boundaries are inclusive.</Label>
            <Choices
              label="Transaction type"
              value={draft.type ?? 'all'}
              onChange={(value) =>
                setDraft((v) => ({
                  ...v,
                  type: value === 'all' ? undefined : (value as TransactionType),
                }))
              }
              options={['all', 'expense', 'income', 'transfer'].map((value) => ({
                value,
                label: value[0].toUpperCase() + value.slice(1),
              }))}
            />
            <Choices
              label="Account (includes transfer destinations)"
              value={draft.account_id ?? 0}
              onChange={(account_id) =>
                setDraft((v) => ({ ...v, account_id: account_id || undefined }))
              }
              options={[
                { value: 0, label: 'All accounts' },
                ...accounts.map((a) => ({
                  value: a.id,
                  label: a.name + (a.archived ? ' (archived)' : ''),
                })),
              ]}
            />
            <Choices
              label="Category"
              value={draft.category_id ?? 0}
              onChange={(category_id) =>
                setDraft((v) => ({ ...v, category_id: category_id || undefined }))
              }
              options={[
                { value: 0, label: 'All categories' },
                ...categories.map((a) => ({
                  value: a.id,
                  label: a.name + (a.archived ? ' (archived)' : ''),
                })),
              ]}
            />
            <Field
              label="Start date (YYYY-MM-DD)"
              value={draft.start ?? ''}
              onChangeText={(start) => setDraft((v) => ({ ...v, start: start || undefined }))}
            />
            <Field
              label="End date (YYYY-MM-DD)"
              value={draft.end ?? ''}
              onChangeText={(end) => setDraft((v) => ({ ...v, end: end || undefined }))}
            />
            <Field
              label="Minimum amount (₹)"
              value={min}
              onChangeText={setMin}
              keyboardType="decimal-pad"
            />
            <Field
              label="Maximum amount (₹)"
              value={max}
              onChangeText={setMax}
              keyboardType="decimal-pad"
            />
            <Choices
              label="Sort order"
              value={draft.sort ?? 'newest'}
              onChange={(sort) => setDraft((v) => ({ ...v, sort }))}
              options={
                [
                  { value: 'newest', label: 'Newest first' },
                  { value: 'oldest', label: 'Oldest first' },
                  { value: 'highest', label: 'Highest amount' },
                  { value: 'lowest', label: 'Lowest amount' },
                ] as { value: TransactionSort; label: string }[]
              }
            />
            {error && <Label>{error}</Label>}
            <Button title="Apply filters" onPress={() => apply(dismiss)} />
            <Button
              secondary
              title="Clear all filters & search"
              onPress={() => {
                onClear();
                dismiss();
              }}
            />
            <Button secondary title="Cancel" onPress={dismiss} />
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </BottomSheet>
  );
}
export function ActiveFilterChips({
  filters,
  onRemove,
}: {
  filters: TransactionFilters;
  onRemove: (key: keyof TransactionFilters) => void;
}) {
  const { accounts, categories } = useFinance();
  const values: { key: keyof TransactionFilters; label: string }[] = [];
  if (filters.type) values.push({ key: 'type', label: filters.type });
  if (filters.account_id)
    values.push({
      key: 'account_id',
      label: accounts.find((a) => a.id === filters.account_id)?.name ?? 'Account',
    });
  if (filters.category_id)
    values.push({
      key: 'category_id',
      label: categories.find((a) => a.id === filters.category_id)?.name ?? 'Category',
    });
  if (filters.start) values.push({ key: 'start', label: `From ${filters.start}` });
  if (filters.end) values.push({ key: 'end', label: `To ${filters.end}` });
  if (filters.min_amount !== undefined)
    values.push({ key: 'min_amount', label: `Min ${money(filters.min_amount)}` });
  if (filters.max_amount !== undefined)
    values.push({ key: 'max_amount', label: `Max ${money(filters.max_amount)}` });
  if (filters.sort && filters.sort !== 'newest')
    values.push({ key: 'sort', label: `Sort: ${filters.sort}` });
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 8 }}
      style={{ flexGrow: 0 }}>
      {values.map((v) => (
        <Button key={v.key} secondary title={`${v.label} ×`} onPress={() => onRemove(v.key)} />
      ))}
    </ScrollView>
  );
}
