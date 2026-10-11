import { useCallback } from 'react';
import { useRouter } from 'expo-router';
import { AdvancedForm, type FormField } from '../components/AdvancedForm';
import { Label, Screen } from '../components/ui';
import { QueryState } from '../components/QueryState';
import { useDatabaseQuery } from '../hooks/useDatabaseQuery';
import { useFinance } from '../store/useFinance';
import { repo } from '../db/database';
import { minor } from '../utils/finance';
export function CardForm({ id }: { id?: number }) {
  const router = useRouter();
  const { accounts, mutate } = useFinance();
  const load = useCallback(() => (id ? repo().cardDetails(id) : Promise.resolve(null)), [id]);
  const query = useDatabaseQuery(load, 'ledger');
  const card = query.data?.card;
  const fields: FormField[] = [
    { name: 'name', label: 'Card name' },
    { name: 'nickname', label: 'Nickname (optional)', optional: true },
    { name: 'limit', label: 'Credit limit (₹)', kind: 'amount' },
    {
      name: 'opening',
      label: 'Opening outstanding (₹)',
      kind: 'amount',
      zero: true,
      hint: 'This is debt owed at setup. Avoid recording purchases already included in this opening amount.',
    },
    { name: 'closing', label: 'Statement closing day (1–31)', kind: 'integer' },
    {
      name: 'due',
      label: 'Payment due day (1–31)',
      kind: 'integer',
      hint: 'Due date is the first configured day after closing; missing days clamp to month end.',
    },
    {
      name: 'payment',
      label: 'Linked payment account (optional)',
      choices: [
        { value: '0', label: 'Choose at payment time' },
        ...accounts
          .filter((a) => !a.archived && a.kind === 'asset' && a.subtype === 'standard')
          .map((a) => ({ value: String(a.id), label: a.name })),
      ],
    },
    {
      name: 'minimum',
      label: 'Minimum payment (optional, ₹)',
      kind: 'amount',
      zero: true,
      optional: true,
      hint: 'Supply only a known minimum. No interest rate or minimum payment is assumed.',
    },
  ];
  return (
    <Screen title={id ? 'Edit credit card' : 'New credit card'} back>
      {id && (query.loading || query.error) ? (
        <QueryState {...query} />
      ) : id && !card ? (
        <Label>Card not found.</Label>
      ) : (
        <AdvancedForm
          fields={fields}
          defaults={{
            name: card?.name ?? '',
            nickname: card?.nickname ?? '',
            limit: card ? (card.credit_limit / 100).toFixed(2) : '',
            opening: card ? (card.opening_balance / 100).toFixed(2) : '0.00',
            closing: String(card?.closing_day ?? '31'),
            due: String(card?.due_day ?? '10'),
            payment: String(card?.payment_account_id ?? 0),
            minimum:
              card?.minimum_payment === null || card?.minimum_payment === undefined
                ? ''
                : (card.minimum_payment / 100).toFixed(2),
          }}
          onSubmit={async (v) => {
            await mutate(() =>
              repo().saveCard(
                {
                  name: v.name,
                  nickname: v.nickname,
                  credit_limit: minor(v.limit),
                  opening_balance: minor(v.opening),
                  closing_day: Number(v.closing),
                  due_day: Number(v.due),
                  payment_account_id: Number(v.payment) || null,
                  minimum_payment: v.minimum ? minor(v.minimum) : null,
                },
                id
              )
            );
            router.back();
          }}
          cancel={() => router.back()}
        />
      )}
    </Screen>
  );
}
