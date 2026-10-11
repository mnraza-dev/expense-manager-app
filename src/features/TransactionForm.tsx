import { useSafeBack } from '../hooks/useSafeBack';
import { Reveal, MotionPressable } from '../components/Motion';
import { useEffect, useRef, useState } from 'react';
import { ReceiptAttachments } from '../components/ReceiptAttachments';
import { VoiceEntryButton } from '../components/VoiceEntryButton';
import {
  deleteWithReceipts,
  discardReceiptDraft,
  pickReceipt,
  saveWithReceipts,
} from '../services/receipts';
import { MAX_RECEIPTS, type ReceiptDraft, type Receipt } from '../utils/receipts';
import { entryFromTemplate, recentEntryTemplates } from '../utils/quickEntry';
import Animated, { FadeIn, FadeOut, ReduceMotion } from 'react-native-reanimated';
import { tokens } from '../design/tokens';
import { Platform, ScrollView, Text, View } from 'react-native';
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
  const goBack = useSafeBack('/(tabs)/transactions');
  const c = useTheme();
  const [details, setDetails] = useState(Boolean(id));
  const [saveError, setSaveError] = useState<string | null>(null);
  const { transactions, accounts, categories, mutate } = useFinance();
  const existing = transactions.find((t) => t.id === id);
  const active = accounts.filter((a) => !a.archived && a.subtype === 'standard');
  const latest = recentEntryTemplates(
    transactions,
    accounts,
    categories,
    initialType,
    initialAccount
  )[0];
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const mounted = useRef(false);
  const [receipts, setReceipts] = useState<ReceiptDraft[]>([]);
  const drafts = useRef<ReceiptDraft[]>([]);
  const originalReceipts = useRef<Receipt[]>([]);
  const [receiptLoading, setReceiptLoading] = useState(Boolean(id));
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const [receiptRetry, setReceiptRetry] = useState(0);
  const picking = useRef(false);
  const [receiptBusy, setReceiptBusy] = useState(false);
  const [focusRequest, setFocusRequest] = useState(0);
  const updateReceipts = (next: ReceiptDraft[]) => {
    drafts.current = next;
    setReceipts(next);
  };
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (!saving.current) drafts.current.forEach(discardReceiptDraft);
    };
  }, []);
  useEffect(() => {
    if (!id) return;
    let active = true;
    repo()
      .receipts(id)
      .then((rows) => {
        if (!active) return;
        originalReceipts.current = rows;
        drafts.current = rows;
        setReceipts(rows);
        setReceiptLoading(false);
      })
      .catch(() => {
        if (active) {
          setReceiptError('Unable to load receipts. Retry before saving changes.');
          setReceiptLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [id, receiptRetry]);
  const [picker, setPicker] = useState(false);
  const {
    control,
    setValue,
    reset,
    setFocus,
    handleSubmit,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      type: existing?.type ?? initialType,
      amount: existing ? (existing.amount / 100).toFixed(2) : '',
      account: existing?.account_id ?? initialAccount ?? latest?.account_id ?? active[0]?.id ?? 0,
      destination: existing?.destination_account_id ?? initialDestination ?? null,
      category:
        existing?.category_id ??
        latest?.category_id ??
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
  const templates = recentEntryTemplates(transactions, accounts, categories, type, initialAccount);
  useEffect(() => {
    if (!focusRequest) return;
    const timer = setTimeout(() => setFocus('amount'), 50);
    return () => clearTimeout(timer);
  }, [focusRequest, setFocus]);
  useEffect(() => {
    if (!selectedAccount && active.length) setValue('account', active[0].id);
  }, [selectedAccount, active, setValue]);
  if (id && !existing)
    return (
      <Screen title="Transaction not found" back backTo="/(tabs)/transactions">
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
      <Screen title="Loan transaction" back backTo="/(tabs)/transactions">
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
  const addReceipt = async () => {
    if (picking.current || saving.current || drafts.current.length >= MAX_RECEIPTS) return;
    picking.current = true;
    setReceiptBusy(true);
    setSaveError(null);
    try {
      const receipt = await pickReceipt();
      if (!receipt) return;
      if (!mounted.current) {
        discardReceiptDraft(receipt);
        return;
      }
      updateReceipts([...drafts.current, receipt]);
    } catch (error) {
      if (mounted.current)
        setSaveError(error instanceof Error ? error.message : 'Could not attach this receipt.');
    } finally {
      picking.current = false;
      if (mounted.current) setReceiptBusy(false);
    }
  };
  const submit = async (v: Values, another = false) => {
    if (saving.current || picking.current || receiptLoading || receiptError) return;
    saving.current = true;
    setBusy(true);
    setSaveError(null);
    try {
      await mutate(async () => {
        await saveWithReceipts(
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
          id,
          drafts.current,
          originalReceipts.current
        );
        drafts.current.forEach(discardReceiptDraft);
        drafts.current = [];
        originalReceipts.current = [];
      });
      notify(id ? 'Transaction updated' : 'Transaction saved');
      if (mounted.current && another && !id) {
        setReceipts([]);
        reset({ ...v, amount: '', description: '', notes: '' });
        setDetails(false);
        setFocusRequest((n) => n + 1);
      } else if (mounted.current) goBack();
    } catch (e) {
      if (mounted.current)
        setSaveError(e instanceof Error ? e.message : 'Unable to save. Please retry.');
    } finally {
      saving.current = false;
      if (mounted.current) setBusy(false);
      else drafts.current.forEach(discardReceiptDraft);
    }
  };
  const save = (another = false) => handleSubmit((v) => submit(v, another))();
  const [y, m, d] = date.split('-').map(Number);
  return (
    <Screen
      title={id ? 'Edit transaction' : 'New transaction'}
      back
      backTo="/(tabs)/transactions"
      headerActions={!id ? <VoiceEntryButton compact /> : undefined}>
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
                inputRef={field.ref}
                editable={!busy}
                onSubmitEditing={() => void save()}
              />
            )}
          />
          {!id && templates.length > 0 && (
            <View style={{ gap: 8 }}>
              <Label small>Use recent details · review before saving</Label>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 10, paddingBottom: 6 }}
                keyboardShouldPersistTaps="handled">
                {templates.map((t) => (
                  <MotionPressable
                    key={t.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Reuse ${t.description}, ${money(t.amount)}`}
                    disabled={busy}
                    onPress={() => {
                      reset(entryFromTemplate(t));
                      setDetails(true);
                      setSaveError(null);
                      setFocusRequest((n) => n + 1);
                    }}
                    style={{
                      width: 172,
                      padding: 14,
                      borderRadius: 16,
                      borderWidth: 1,
                      borderColor: c.border,
                      backgroundColor: c.card,
                      gap: 6,
                    }}>
                    <Text numberOfLines={1} style={{ color: c.text, fontWeight: '600' }}>
                      {t.description}
                    </Text>
                    <Text style={{ color: c.accent, fontWeight: '600' }}>{money(t.amount)}</Text>
                    <Text numberOfLines={1} style={{ color: c.muted, fontSize: 12 }}>
                      {accounts.find((a) => a.id === t.account_id)?.name}
                    </Text>
                  </MotionPressable>
                ))}
              </ScrollView>
            </View>
          )}
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
                      : (recentEntryTemplates(
                          transactions,
                          accounts,
                          categories,
                          v,
                          initialAccount
                        )[0]?.category_id ??
                          categories.find((c) => !c.archived && c.type === v)?.id ??
                          null)
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
            <Reveal key={type}>
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
            </Reveal>
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
              onDismiss={() => setPicker(false)}
              onValueChange={(_, selected) => {
                setPicker(false);
                setValue('date', localDate(selected), { shouldValidate: true });
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
          <ReceiptAttachments
            receipts={receipts}
            loading={receiptLoading}
            error={receiptError}
            onRetry={() => {
              setReceiptLoading(true);
              setReceiptError(null);
              setReceiptRetry((n) => n + 1);
            }}
            busy={busy || receiptBusy}
            onAdd={() => void addReceipt()}
            onRemove={(receipt) => {
              discardReceiptDraft(receipt);
              updateReceipts(drafts.current.filter((r) => r.id !== receipt.id));
            }}
          />
          <Button
            title="Save transaction"
            busy={busy || receiptBusy || receiptLoading}
            disabled={Boolean(receiptError)}
            onPress={() => void save()}
          />
          {!id && (
            <Button
              secondary
              title="Save & add another"
              busy={busy || receiptBusy || receiptLoading}
              disabled={Boolean(receiptError)}
              onPress={() => void save(true)}
            />
          )}
          {existing && (
            <Button
              danger
              title="Delete transaction"
              busy={busy || receiptBusy}
              onPress={() =>
                confirm(
                  'Delete transaction?',
                  'This removes the entry and recalculates the affected balances.',
                  async () => {
                    await mutate(() => deleteWithReceipts(existing.id));
                    notify('Transaction deleted');
                    goBack();
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
