import { useSafeBack } from '../hooks/useSafeBack';
import { notify } from '../store/useFeedback';
import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button, Choices, Field, Label, Screen, confirm, showError } from '../components/ui';
import { TransactionItem } from '../components/TransactionItem';
import { useFinance } from '../store/useFinance';
import { repo } from '../db/database';
import { useDatabaseQuery } from '../hooks/useDatabaseQuery';
import { QueryState } from '../components/QueryState';
import { minor, money } from '../utils/finance';
const schema = z.object({
  name: z.string().trim().min(1, 'Account name is required.').max(80),
  type: z.enum(['cash', 'bank', 'savings', 'wallet', 'other']),
  opening: z.string().refine((v) => {
    try {
      minor(v, true);
      return true;
    } catch {
      return false;
    }
  }, 'Enter a valid balance with at most two decimals.'),
  description: z.string().max(500),
});
type Values = z.infer<typeof schema>;
export function AccountForm({ id }: { id?: number }) {
  const router = useRouter();
  const goBack = useSafeBack('/(tabs)/accounts');
  const { accounts, mutate } = useFinance();
  const history = useDatabaseQuery(
    useCallback(
      () =>
        id
          ? repo().searchTransactions({ account_id: id }, 0, 50)
          : Promise.resolve({ rows: [], count: 0 }),
      [id]
    ),
    'ledger'
  );
  const account = accounts.find((a) => a.id === id);
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: account?.name ?? '',
      type: account?.type ?? 'bank',
      opening: ((account?.opening_balance ?? 0) / 100).toFixed(2),
      description: account?.description ?? '',
    },
  });
  if (id && !account)
    return (
      <Screen title="Account not found" back backTo="/(tabs)/accounts">
        <Label>This account no longer exists.</Label>
      </Screen>
    );
  if (account && account.subtype !== 'standard')
    return (
      <Screen title={account.name} back backTo="/(tabs)/accounts">
        <Label>
          {account.kind} · Balance {money(account.ledger_balance ?? 0)}
        </Label>
        <Button
          title={account.subtype === 'credit_card' ? 'Open card details' : 'Open loans & debts'}
          onPress={() =>
            account.subtype === 'credit_card'
              ? router.push({ pathname: '/card/[id]', params: { id: account.id } })
              : router.push('/loan')
          }
        />
      </Screen>
    );
  const submit = async (v: Values) => {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    try {
      await mutate(() =>
        repo().saveAccount(
          {
            name: v.name,
            type: v.type,
            opening_balance: minor(v.opening, true),
            description: v.description,
          },
          id
        )
      );
      notify('Account saved');
      goBack();
    } catch (e) {
      showError(e);
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };
  const save = () => handleSubmit(submit)();
  return (
    <Screen
      title={id ? 'Account details' : 'New account'}
      subtitle="Start with the balance you have today"
      back
      backTo="/(tabs)/accounts">
      {account && <Label>Current balance {money(account.ledger_balance ?? 0)}</Label>}
      <Controller
        control={control}
        name="name"
        render={({ field }) => (
          <Field
            label="Account name"
            placeholder="e.g. Everyday bank"
            value={field.value}
            onChangeText={field.onChange}
            error={errors.name?.message}
          />
        )}
      />
      <Controller
        control={control}
        name="type"
        render={({ field }) => (
          <Choices
            label="Account type"
            value={field.value}
            onChange={field.onChange}
            options={(['cash', 'bank', 'savings', 'wallet', 'other'] as const).map((v) => ({
              value: v,
              label: v === 'bank' ? 'Bank account' : v[0].toUpperCase() + v.slice(1),
            }))}
          />
        )}
      />
      <Controller
        control={control}
        name="opening"
        render={({ field }) => (
          <Field
            label="Opening balance (INR)"
            keyboardType="numbers-and-punctuation"
            value={field.value}
            onChangeText={field.onChange}
            error={errors.opening?.message}
          />
        )}
      />
      <Label small>
        Opening balance plus your transaction history determines the current balance. Editing it
        adjusts the current balance.
      </Label>
      <Controller
        control={control}
        name="description"
        render={({ field }) => (
          <Field
            label="Description (optional)"
            value={field.value}
            onChangeText={field.onChange}
            multiline
            error={errors.description?.message}
          />
        )}
      />
      <Button title="Save account" busy={busy} onPress={() => void save()} />
      {account && (
        <>
          <Button
            secondary
            title={account.archived ? 'Restore account' : 'Archive account'}
            onPress={() =>
              confirm(
                account.archived ? 'Restore account?' : 'Archive account?',
                'Your transaction history will be preserved.',
                async () => {
                  await mutate(() => repo().archiveAccount(account.id, !account.archived));
                  goBack();
                }
              )
            }
          />
          <Button
            danger
            title="Delete empty account"
            onPress={() =>
              confirm(
                'Delete this account?',
                'Only accounts without transactions can be deleted.',
                async () => {
                  await mutate(() => repo().deleteAccount(account.id));
                  goBack();
                }
              )
            }
          />
          <Label>Account transactions</Label>
          <QueryState {...history} />
          {history.data?.rows.map((t) => (
            <TransactionItem item={t} key={t.id} />
          ))}
          {history.data?.count === 0 && <Label small>No transactions for this account.</Label>}
          {!!history.data?.count && (
            <Button
              secondary
              title={`View all ${history.data.count} account transactions`}
              onPress={() =>
                router.push({ pathname: '/(tabs)/transactions', params: { account: String(id) } })
              }
            />
          )}
        </>
      )}
    </Screen>
  );
}
