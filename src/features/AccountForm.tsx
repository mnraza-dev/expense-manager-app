import { useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button, Choices, Field, Label, Screen, confirm, showError } from '../components/ui';
import { TransactionItem } from '../components/TransactionItem';
import { useFinance } from '../store/useFinance';
import { repo } from '../db/database';
import { balance, minor, money } from '../utils/finance';
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
  const { accounts, transactions, mutate } = useFinance();
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
      <Screen title="Account not found" back>
        <Label>This account no longer exists.</Label>
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
      router.back();
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
      back>
      {account && <Label>Current balance {money(balance(account, transactions))}</Label>}
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
                  router.back();
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
                  router.back();
                }
              )
            }
          />
          <Label>Account transactions</Label>
          {transactions
            .filter((t) => t.account_id === id || t.destination_account_id === id)
            .map((t) => (
              <TransactionItem item={t} key={t.id} />
            ))}
          {!transactions.some((t) => t.account_id === id || t.destination_account_id === id) && (
            <Label small>No transactions for this account.</Label>
          )}
        </>
      )}
    </Screen>
  );
}
