import { ExpenseSplitEditor, splitDrafts, type SplitDraft } from '../components/ExpenseSplitEditor';
import { remainingRefundParts } from '../utils/expenseAllocations';
import { useSafeBack } from '../hooks/useSafeBack';
import { Reveal, MotionPressable } from '../components/Motion';
import { useEffect, useRef, useState } from 'react';
import { ReceiptAttachments } from '../components/ReceiptAttachments';
import { VoiceEntryButton } from '../components/VoiceEntryButton';
import { ReceiptScanButton } from '../components/ReceiptScanButton';
import { possibleReceiptDuplicates, type ReceiptScanDraft } from '../utils/receiptScan';
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
  Card,
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
  initialScan,
  initialRefundId,
}: {
  id?: number;
  initialType?: TransactionType;
  initialAccount?: number;
  initialDestination?: number;
  initialScan?: ReceiptScanDraft;
  initialRefundId?: number;
}) {
  const router = useRouter();
  const goBack = useSafeBack('/(tabs)/transactions');
  const c = useTheme();
  const [details, setDetails] = useState(Boolean(id || initialScan));
  const [scanActive, setScanActive] = useState(Boolean(initialScan));
  const [showScanText, setShowScanText] = useState(false);
  const [duplicateAcknowledgement, setDuplicateAcknowledgement] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const { transactions, accounts, categories, mutate } = useFinance();
  const existing = transactions.find((t) => t.id === id);
  const original = transactions.find((t) => t.id === (existing?.refund_of_id ?? initialRefundId));
  const refundOf = existing?.refund_of_id ?? initialRefundId;
  const remaining = original
    ? remainingRefundParts(
        original,
        transactions.filter((t) => t.id !== id)
      )
    : [];
  const refundAmount = remaining.reduce((s, p) => s + p.amount, 0);
  const [splits, setSplits] = useState<SplitDraft[]>(() =>
    splitDrafts(existing?.splits ?? (initialRefundId && remaining.length > 1 ? remaining : []))
  );
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
  const [receipts, setReceipts] = useState<ReceiptDraft[]>(() =>
    initialScan ? [initialScan.receipt] : []
  );
  const drafts = useRef<ReceiptDraft[]>(receipts);
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
      queueMicrotask(() => {
        if (!mounted.current && !saving.current) drafts.current.forEach(discardReceiptDraft);
      });
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
      amount: existing
        ? (existing.amount / 100).toFixed(2)
        : initialRefundId
          ? (refundAmount / 100).toFixed(2)
          : (initialScan?.amount ?? ''),
      account:
        existing?.account_id ??
        original?.account_id ??
        initialAccount ??
        latest?.account_id ??
        active[0]?.id ??
        0,
      destination: existing?.destination_account_id ?? initialDestination ?? null,
      category: initialScan
        ? initialScan.category
        : (existing?.category_id ??
          (initialRefundId ? remaining[0]?.category_id : undefined) ??
          latest?.category_id ??
          categories.find((c) => !c.archived && c.type === initialType)?.id ??
          null),
      description:
        existing?.description ??
        (initialRefundId ? `Refund: ${original?.description ?? ''}` : undefined) ??
        initialScan?.merchant ??
        '',
      date: existing?.date ?? initialScan?.date ?? localDate(),
      notes: existing?.notes ?? '',
      component: existing?.component ?? 'standard',
    },
  });
  const type = useWatch({ control, name: 'type' });
  const date = useWatch({ control, name: 'date' });
  const selectedAccount = useWatch({ control, name: 'account' });
  const selectedCategory = useWatch({ control, name: 'category' });
  const amount = useWatch({ control, name: 'amount' });
  const duplicates =
    scanActive && type === 'expense'
      ? possibleReceiptDuplicates(transactions, { amount, date, account: selectedAccount })
      : [];
  const duplicateKey = duplicates.length
    ? `${amount}|${date}|${selectedAccount}|${duplicates.map((t) => t.id).join(',')}`
    : '';
  const duplicateBlocked = Boolean(duplicateKey && duplicateAcknowledgement !== duplicateKey);
  const templates = recentEntryTemplates(transactions, accounts, categories, type, initialAccount);
  useEffect(() => {
    if (!focusRequest) return;
    const timer = setTimeout(() => setFocus('amount'), 50);
    return () => clearTimeout(timer);
  }, [focusRequest, setFocus]);
  useEffect(() => {
    if (!selectedAccount && active.length) setValue('account', active[0].id);
  }, [selectedAccount, active, setValue]);
  if (refundOf !== undefined && refundOf !== null && (!original || (!id && !refundAmount)))
    return (
      <Screen title="Refund unavailable" back backTo="/(tabs)/transactions">
        <Label>This purchase is unavailable or has already been fully refunded.</Label>
      </Screen>
    );
  if (id && !existing)
    return (
      <Screen title="Transaction not found" back backTo="/(tabs)/transactions">
        <Label>This transaction no longer exists.</Label>
      </Screen>
    );
  const selectable = accounts.filter(
    (a) =>
      !a.subtype?.startsWith('loan_') &&
      (!a.archived ||
        a.id === existing?.account_id ||
        a.id === original?.account_id ||
        a.id === existing?.destination_account_id)
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
    (c) =>
      c.type === type &&
      (refundOf
        ? remaining.some((p) => p.category_id === c.id)
        : !c.archived ||
          c.id === existing?.category_id ||
          existing?.splits?.some((p) => p.category_id === c.id))
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
    if (duplicateBlocked) {
      setSaveError('Review the possible duplicate expenses before saving.');
      return;
    }
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
            category_id: v.type === 'transfer' ? null : (splits[0]?.category_id ?? v.category),
            splits:
              v.type === 'expense'
                ? splits.map((p) => ({ category_id: p.category_id, amount: minor(p.amount) }))
                : [],
            refund_of_id: refundOf ?? null,
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
        setScanActive(false);
        setSplits([]);
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
      title={
        refundOf
          ? id
            ? 'Edit refund'
            : 'Record refund'
          : id
            ? 'Edit transaction'
            : 'New transaction'
      }
      back
      backTo="/(tabs)/transactions"
      headerActions={!id && !refundOf ? <VoiceEntryButton compact /> : undefined}>
      {refundOf && original && (
        <Card>
          <Label>Refund for {original.description}</Label>
          <Label small>
            Returns money to {accounts.find((a) => a.id === original.account_id)?.name} and reduces
            spending on the refund date. Up to {money(refundAmount)} remains refundable.
          </Label>
          <Label small>Original purchase: {original.date}. Use its original categories.</Label>
        </Card>
      )}
      {existing?.type === 'expense' &&
        !refundOf &&
        !existing.loan_id &&
        existing.component === 'standard' && (
          <Button
            secondary
            title="Record a full or partial refund"
            onPress={() =>
              router.push({ pathname: '/transaction/refund', params: { original: existing.id } })
            }
          />
        )}
      {existing &&
        transactions
          .filter((t) => t.refund_of_id === existing.id)
          .map((t) => (
            <Button
              key={t.id}
              secondary
              title={`View refund · ${t.date} · ${money(t.amount)}`}
              onPress={() => router.push({ pathname: '/transaction/[id]', params: { id: t.id } })}
            />
          ))}
      {scanActive && initialScan && (
        <Card>
          <Label>Receipt scan draft · review before saving</Label>
          <Label small>
            Check the description, paid total, purchase date, category and account. The scanned
            image is attached below.
          </Label>
          {initialScan.warnings.map((warning) => (
            <InlineFeedback key={warning} message={warning} />
          ))}
          {initialScan.candidates.length > 1 && (
            <Choices
              label="Possible receipt totals (₹)"
              value={amount}
              options={[...new Set(initialScan.candidates.map((item) => item.amount))].map(
                (value) => ({ value, label: `₹${value}` })
              )}
              onChange={(value) => {
                if (!busy) setValue('amount', value, { shouldValidate: true });
              }}
            />
          )}
          {duplicates.length > 0 && (
            <>
              <InlineFeedback message="Possible duplicate: expenses with this amount, date and account already exist." />
              {duplicates.map((t) => (
                <Label small key={t.id}>
                  {t.date} · {t.description} · {money(t.amount)}
                </Label>
              ))}
              <Button
                secondary
                title={
                  duplicateBlocked
                    ? 'Confirm this is a separate expense'
                    : 'Duplicate warning reviewed'
                }
                busy={busy}
                onPress={() => {
                  setDuplicateAcknowledgement(duplicateKey);
                  setSaveError(null);
                }}
              />
            </>
          )}
          {initialScan.text && (
            <Button
              secondary
              title={showScanText ? 'Hide extracted text' : 'Show extracted text'}
              onPress={() => setShowScanText(!showScanText)}
            />
          )}
          {showScanText && (
            <Label small>
              {initialScan.text.slice(0, 4000)}
              {initialScan.text.length > 4000 ? '\n[Preview limited to 4,000 characters]' : ''}
            </Label>
          )}
        </Card>
      )}
      {!id && !refundOf && !scanActive && selectable.length > 0 && <ReceiptScanButton />}
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
                autoFocus={!id && !initialScan}
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
          {!id && !refundOf && !scanActive && templates.length > 0 && (
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
                      setScanActive(false);
                      setSplits([]);
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
          {!refundOf && (
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
                    setSplits([]);
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
          )}
          {type === 'income' && (
            <Label small>
              For a refund, open the original purchase and choose Record refund. Income entries do
              not reduce spending.
            </Label>
          )}
          {type === 'expense' &&
            !refundOf &&
            accounts.find((a) => a.id === selectedAccount)?.subtype === 'credit_card' && (
              <Controller
                control={control}
                name="component"
                render={({ field }) => (
                  <Choices
                    label="Card charge type"
                    value={field.value}
                    onChange={(value) => {
                      field.onChange(value);
                      if (value !== 'standard') setSplits([]);
                    }}
                    options={[
                      { value: 'standard', label: 'Purchase' },
                      { value: 'interest', label: 'Interest' },
                      { value: 'fee', label: 'Fee' },
                    ]}
                  />
                )}
              />
            )}
          {type !== 'transfer' && !splits.length && (
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
                options={(refundOf
                  ? sourceOptions.filter((a) => a.id === original?.account_id)
                  : sourceOptions
                ).map((a) => ({
                  value: a.id,
                  label: a.name + (a.archived ? ' (archived)' : ''),
                }))}
                onChange={(value) => {
                  if (!refundOf && !busy) field.onChange(value);
                }}
              />
            )}
          />
          {type === 'expense' && (
            <>
              {splits.length > 0 ? (
                <>
                  <ExpenseSplitEditor
                    parts={splits}
                    categories={available}
                    busy={busy}
                    onChange={(parts) => {
                      setSplits(parts);
                      setValue('category', parts[0]?.category_id ?? null);
                      setValue('component', 'standard');
                    }}
                  />
                  <Button
                    secondary
                    title="Use one category"
                    disabled={busy}
                    onPress={() => {
                      setValue('category', splits[0].category_id);
                      setSplits([]);
                    }}
                  />
                </>
              ) : (
                available.length > 1 && (
                  <Button
                    secondary
                    title="Split across categories"
                    disabled={busy}
                    onPress={() => {
                      setValue('component', 'standard');
                      const first =
                        available.find((c) => c.id === selectedCategory) ?? available[0];
                      const second = available.find((c) => c.id !== first.id)!;
                      setValue('category', first.id);
                      setSplits([
                        { category_id: first.id, amount: '' },
                        { category_id: second.id, amount: '' },
                      ]);
                    }}
                  />
                )
              )}
            </>
          )}
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
          <Button
            secondary
            title={`Date · ${date || 'Choose purchase date'}`}
            onPress={() => setPicker(true)}
          />
          {scanActive && !date && (
            <Button
              secondary
              title="Use today's date"
              onPress={() => setValue('date', localDate(), { shouldValidate: true })}
            />
          )}
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
            disabled={Boolean(receiptError) || duplicateBlocked}
            onPress={() => void save()}
          />
          {!id && !refundOf && (
            <Button
              secondary
              title="Save & add another"
              busy={busy || receiptBusy || receiptLoading}
              disabled={Boolean(receiptError) || duplicateBlocked}
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
