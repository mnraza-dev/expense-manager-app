import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useRouter } from 'expo-router';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { TransactionType } from '../types';
import { Button, Choices, Empty, Field, Label, Screen, confirm, showError } from '../components/ui';
import { useFinance } from '../store/useFinance';
import { repo } from '../db/database';
import { localDate, minor, validDate } from '../utils/finance';
const schema = z
  .object({
    type: z.enum(['expense', 'income', 'transfer']),
    amount: z.string().refine((v) => {
      try {
        return minor(v) > 0;
      } catch {
        return false;
      }
    }, 'Enter an amount greater than zero, with at most two decimals.'),
    account: z.number().positive('Choose an account.'),
    destination: z.number().nullable(),
    category: z.number().nullable(),
    description: z.string().trim().min(1, 'Description is required.').max(160),
    date: z.string().refine(validDate, 'Choose a valid calendar date.'),
    notes: z.string().max(2000),
  })
  .superRefine((v, ctx) => {
    if (v.type === 'transfer' && (!v.destination || v.destination === v.account))
      ctx.addIssue({
        code: 'custom',
        path: ['destination'],
        message: 'Choose a different destination account.',
      });
    if (v.type !== 'transfer' && !v.category)
      ctx.addIssue({ code: 'custom', path: ['category'], message: 'Choose a category.' });
  });
type Values = z.infer<typeof schema>;
export function TransactionForm({
  id,
  initialType = 'expense',
}: {
  id?: number;
  initialType?: TransactionType;
}) {
  const router = useRouter();
  const { transactions, accounts, categories, mutate } = useFinance();
  const existing = transactions.find((t) => t.id === id);
  const active = accounts.filter((a) => !a.archived);
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const [picker, setPicker] = useState(false);
  const {
    control,
    setValue,
    handleSubmit,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      type: existing?.type ?? initialType,
      amount: existing ? (existing.amount / 100).toFixed(2) : '',
      account: existing?.account_id ?? active[0]?.id ?? 0,
      destination: existing?.destination_account_id ?? null,
      category:
        existing?.category_id ??
        categories.find((c) => !c.archived && c.type === initialType)?.id ??
        null,
      description: existing?.description ?? '',
      date: existing?.date ?? localDate(),
      notes: existing?.notes ?? '',
    },
  });
  const type = useWatch({ control, name: 'type' });
  const date = useWatch({ control, name: 'date' });
  const selectedAccount = useWatch({ control, name: 'account' });
  useEffect(() => {
    if (!selectedAccount && active.length) setValue('account', active[0].id);
  }, [selectedAccount, active, setValue]);
  if (id && !existing)
    return (
      <Screen title="Transaction not found" back>
        <Label>This transaction no longer exists.</Label>
      </Screen>
    );
  const selectable = accounts.filter(
    (a) => !a.archived || a.id === existing?.account_id || a.id === existing?.destination_account_id
  );
  const available = categories.filter(
    (c) => c.type === type && (!c.archived || c.id === existing?.category_id)
  );
  const submit = async (v: Values) => {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    try {
      await mutate(() =>
        repo().saveTransaction(
          {
            type: v.type,
            amount: minor(v.amount),
            account_id: v.account,
            destination_account_id: v.type === 'transfer' ? v.destination : null,
            category_id: v.type === 'transfer' ? null : v.category,
            description: v.description,
            date: v.date,
            notes: v.notes,
          },
          id
        )
      );
      router.back();
    } catch (e) {
      showError(e);
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };
  const save = () => handleSubmit(submit)();
  const [y, m, d] = date.split('-').map(Number);
  return (
    <Screen
      title={id ? 'Edit transaction' : 'New transaction'}
      subtitle="Every little entry adds clarity"
      back>
      {!selectable.length ? (
        <>
          <Empty
            title="An account comes first"
            detail="Create an account before recording a transaction."
          />
          <Button title="Create an account" onPress={() => router.push('/account/add')} />
        </>
      ) : (
        <>
          <Controller
            control={control}
            name="type"
            render={({ field }) => (
              <Choices
                label="Transaction type"
                value={field.value}
                options={[
                  { value: 'expense', label: '− Expense' },
                  { value: 'income', label: '+ Income' },
                  { value: 'transfer', label: '↔ Transfer' },
                ]}
                onChange={(v) => {
                  field.onChange(v);
                  setValue('destination', null);
                  setValue(
                    'category',
                    v === 'transfer'
                      ? null
                      : (categories.find((c) => !c.archived && c.type === v)?.id ?? null)
                  );
                }}
              />
            )}
          />
          {type === 'income' && (
            <Label small>
              Refunds are not supported in this version. An income entry does not reduce reported
              spending.
            </Label>
          )}
          <Controller
            control={control}
            name="amount"
            render={({ field }) => (
              <Field
                label="Amount (₹)"
                placeholder="0.00"
                keyboardType="decimal-pad"
                value={field.value}
                onChangeText={field.onChange}
                error={errors.amount?.message}
                style={{ fontSize: 36, fontWeight: '700', minHeight: 80 }}
              />
            )}
          />
          <Controller
            control={control}
            name="account"
            render={({ field }) => (
              <Choices
                label={type === 'transfer' ? 'From account' : 'Account'}
                value={field.value}
                options={selectable.map((a) => ({
                  value: a.id,
                  label: a.name + (a.archived ? ' (archived)' : ''),
                }))}
                onChange={field.onChange}
              />
            )}
          />
          {errors.account && <Label small>{errors.account.message}</Label>}
          {type === 'transfer' ? (
            <>
              <Controller
                control={control}
                name="destination"
                render={({ field }) => (
                  <Choices
                    label="To account"
                    value={field.value ?? undefined}
                    options={selectable
                      .filter((a) => a.id !== selectedAccount)
                      .map((a) => ({ value: a.id, label: a.name }))}
                    onChange={field.onChange}
                  />
                )}
              />
              {errors.destination && <Label small>{errors.destination.message}</Label>}
              {selectable.length < 2 && (
                <Label small>Transfers require two different accounts.</Label>
              )}
            </>
          ) : (
            <>
              <Controller
                control={control}
                name="category"
                render={({ field }) => (
                  <Choices
                    label="Category"
                    value={field.value ?? undefined}
                    options={available.map((a) => ({ value: a.id, label: a.name }))}
                    onChange={field.onChange}
                  />
                )}
              />
              {errors.category && <Label small>{errors.category.message}</Label>}
              <Button
                secondary
                title="Manage categories"
                onPress={() => router.push('/category')}
              />
            </>
          )}
          <Controller
            control={control}
            name="date"
            render={({ field }) => (
              <Field
                label="Date (YYYY-MM-DD)"
                value={field.value}
                onChangeText={field.onChange}
                error={errors.date?.message}
              />
            )}
          />
          <Button secondary title="Choose date from calendar" onPress={() => setPicker(true)} />
          {picker && (
            <DateTimePicker
              value={validDate(date) ? new Date(y, m - 1, d) : new Date()}
              mode="date"
              display={Platform.OS === 'ios' ? 'inline' : 'default'}
              onChange={(_, selected) => {
                setPicker(false);
                if (selected) setValue('date', localDate(selected), { shouldValidate: true });
              }}
            />
          )}
          <Controller
            control={control}
            name="description"
            render={({ field }) => (
              <Field
                label="Description"
                placeholder="What was it for?"
                value={field.value}
                onChangeText={field.onChange}
                error={errors.description?.message}
              />
            )}
          />
          <Controller
            control={control}
            name="notes"
            render={({ field }) => (
              <Field
                label="Notes (optional)"
                value={field.value}
                onChangeText={field.onChange}
                multiline
                error={errors.notes?.message}
              />
            )}
          />
          <Button title="Save transaction" busy={busy} onPress={() => void save()} />
          {existing && (
            <Button
              danger
              title="Delete transaction"
              onPress={() =>
                confirm(
                  'Delete transaction?',
                  'This removes the entry and recalculates the affected balances.',
                  async () => {
                    await mutate(() => repo().deleteTransaction(existing.id));
                    router.back();
                  }
                )
              }
            />
          )}
        </>
      )}
    </Screen>
  );
}
