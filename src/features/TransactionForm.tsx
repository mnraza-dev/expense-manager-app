import { useEffect, useRef, useState } from 'react';
import Animated, { FadeIn, FadeOut, ReduceMotion } from 'react-native-reanimated';
import { tokens } from '../design/tokens';
import { Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useRouter } from 'expo-router';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { notify } from '../store/useFeedback';
import { CategoryGrid } from '../components/CategoryGrid';
import type { TransactionType } from '../types';
import {
  Button,
  Choices,
  Empty,
  Field,
  Label,
  Screen,
  confirm,
  InlineFeedback,
  useTheme,
} from '../components/ui';
import { useFinance } from '../store/useFinance';
import { repo } from '../db/database';
import { localDate, minor, money, validDate } from '../utils/finance';
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
    description: z.string().trim().max(160),
    date: z.string().refine(validDate, 'Choose a valid calendar date.'),
    notes: z.string().max(2000),
    component: z.enum(['standard', 'interest', 'fee', 'principal']),
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
  initialAccount,
  initialDestination,
}: {
  id?: number;
  initialType?: TransactionType;
  initialAccount?: number;
  initialDestination?: number;
}) {
  const router = useRouter();
  const c = useTheme();
  const [details, setDetails] = useState(Boolean(id));
  const [saveError, setSaveError] = useState<string | null>(null);
  const { transactions, accounts, categories, mutate } = useFinance();
  const existing = transactions.find((t) => t.id === id);
  const active = accounts.filter((a) => !a.archived && a.subtype === 'standard');
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
      account:
        existing?.account_id ??
        initialAccount ??
        active.find((a) => a.id === transactions[0]?.account_id)?.id ??
        active[0]?.id ??
        0,
      destination: existing?.destination_account_id ?? initialDestination ?? null,
      category:
        existing?.category_id ??
        categories.find((c) => !c.archived && c.type === initialType)?.id ??
        null,
      description: existing?.description ?? '',
      date: existing?.date ?? localDate(),
      notes: existing?.notes ?? '',
      component: existing?.component ?? 'standard',
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
    (a) =>
      !a.subtype?.startsWith('loan_') &&
      (!a.archived || a.id === existing?.account_id || a.id === existing?.destination_account_id)
  );
  const sourceOptions = selectable.filter((a) => a.kind !== 'liability' || type === 'expense');
  if (existing?.loan_id)
    return (
      <Screen title="Loan transaction" back>
        <Label>
          {existing.description} · {money(existing.amount)}
        </Label>
        <Label small>
          Loan components are corrected together to preserve principal, interest and fees.
        </Label>
        <Button
          title="Open loan details"
          onPress={() => router.push({ pathname: '/loan/[id]', params: { id: existing.loan_id! } })}
        />
      </Screen>
    );
  const available = categories.filter(
    (c) => c.type === type && (!c.archived || c.id === existing?.category_id)
  );
  const submit = async (v: Values) => {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    setSaveError(null);
    try {
      await mutate(() =>
        repo().saveTransaction(
          {
            type: v.type,
            amount: minor(v.amount),
            account_id: v.account,
            destination_account_id: v.type === 'transfer' ? v.destination : null,
            category_id: v.type === 'transfer' ? null : v.category,
            description:
              v.description || categories.find((c) => c.id === v.category)?.name || 'Transfer',
            date: v.date,
            notes: v.notes,
            component: v.component,
          },
          id
        )
      );
      notify(id ? 'Transaction updated' : 'Transaction saved');
      router.back();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Unable to save. Please retry.');
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };
  const save = () => handleSubmit(submit)();
  const [y, m, d] = date.split('-').map(Number);
  return (
    <Screen title={id ? 'Edit transaction' : 'New transaction'} back>
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
            name="amount"
            render={({ field }) => (
              <Field
                label="Amount (₹)"
                placeholder="0.00"
                keyboardType="decimal-pad"
                value={field.value}
                onChangeText={field.onChange}
                error={errors.amount?.message}
                autoFocus={!id}
                style={{
                  fontSize: 32,
                  fontWeight: '600',
                  minHeight: 76,
                  fontVariant: ['tabular-nums'],
                  backgroundColor: c.bg,
                  borderWidth: 0,
                  borderBottomWidth: 1,
                }}
              />
            )}
          />
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
                  setValue('component', 'standard');
                  if (
                    v !== 'expense' &&
                    accounts.find((a) => a.id === selectedAccount)?.kind === 'liability'
                  )
                    setValue('account', active[0]?.id ?? 0);
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
          {type === 'expense' &&
            accounts.find((a) => a.id === selectedAccount)?.subtype === 'credit_card' && (
              <Controller
                control={control}
                name="component"
                render={({ field }) => (
                  <Choices
                    label="Card charge type"
                    value={field.value}
                    onChange={field.onChange}
                    options={[
                      { value: 'standard', label: 'Purchase' },
                      { value: 'interest', label: 'Interest' },
                      { value: 'fee', label: 'Fee' },
                    ]}
                  />
                )}
              />
            )}
          {type !== 'transfer' && (
            <>
              <Controller
                control={control}
                name="category"
                render={({ field }) => (
                  <CategoryGrid
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
            name="account"
            render={({ field }) => (
              <Choices
                label={type === 'transfer' ? 'From account' : 'Account'}
                value={field.value}
                options={sourceOptions.map((a) => ({
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
          ) : null}
          <Button secondary title={`Date · ${date}`} onPress={() => setPicker(true)} />
          {errors.date && (
            <InlineFeedback message={errors.date.message ?? 'Choose a valid date.'} />
          )}
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
          <Button
            secondary
            title={details ? 'Hide description & notes' : 'Add description or notes'}
            onPress={() => setDetails(!details)}
          />
          {details && (
            <Animated.View
              entering={FadeIn.duration(tokens.motion.feedback).reduceMotion(ReduceMotion.System)}
              exiting={FadeOut.duration(tokens.motion.feedback).reduceMotion(ReduceMotion.System)}>
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
            </Animated.View>
          )}
          {saveError && <InlineFeedback message={saveError} />}
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
                    notify('Transaction deleted');
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
