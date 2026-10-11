import { useCallback, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Button, Card, Field, Label, Screen, showError, confirm } from '../../src/components/ui';
import { QueryState } from '../../src/components/QueryState';
import { TransactionItem } from '../../src/components/TransactionItem';
import { useDatabaseQuery } from '../../src/hooks/useDatabaseQuery';
import { repo } from '../../src/db/database';
import { useFinance } from '../../src/store/useFinance';
import { localDate, minor, money } from '../../src/utils/finance';
export default function CardDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const accountId = Number(id);
  const router = useRouter();
  const mutate = useFinance((s) => s.mutate);
  const load = useCallback(() => repo().cardDetails(accountId), [accountId]);
  const query = useDatabaseQuery(load, 'ledger');
  const [month, setMonth] = useState(localDate().slice(0, 7));
  const [minimum, setMinimum] = useState('');
  const [busy, setBusy] = useState(false);
  const data = query.data;
  const generate = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const statement = await repo().createStatement(
        accountId,
        month,
        minimum ? minor(minimum) : (data?.card.minimum_payment ?? null)
      );
      query.retry();
      router.push({ pathname: '/statement/[id]', params: { id: statement } });
    } catch (e) {
      showError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Screen title={data?.card.name ?? 'Card details'} back>
      <QueryState {...query} />
      {data && (
        <>
          <Card>
            <Label>Outstanding {money(data.outstanding)}</Label>
            <Label>Available credit {money(data.card.credit_limit - data.outstanding)}</Label>
            <Label small>
              Limit {money(data.card.credit_limit)} · Closes on day {data.card.closing_day} · Due on
              day {data.card.due_day}
            </Label>
          </Card>
          <Button
            title="Record card purchase / interest / fee"
            onPress={() =>
              router.push({
                pathname: '/transaction/add',
                params: { type: 'expense', account: accountId },
              })
            }
          />
          <Button
            secondary
            title="Pay credit card"
            onPress={() =>
              router.push({
                pathname: '/transaction/add',
                params: {
                  type: 'transfer',
                  account: data.card.payment_account_id ?? '',
                  destination: accountId,
                },
              })
            }
          />
          <Button
            secondary
            title="Edit card preferences"
            onPress={() => router.push({ pathname: '/card/edit', params: { id: accountId } })}
          />
          <Button
            secondary
            title={data.card.archived ? 'Restore card' : 'Archive card'}
            onPress={() =>
              confirm(
                'Change card archive status?',
                'Existing purchases and statements remain available.',
                () => mutate(() => repo().archiveAccount(accountId, !data.card.archived))
              )
            }
          />
          <Card>
            <Label>Statement history</Label>
            <Field label="Closing month (YYYY-MM)" value={month} onChangeText={setMonth} />
            <Field
              label="Known minimum payment (optional, ₹)"
              value={minimum}
              onChangeText={setMinimum}
              keyboardType="decimal-pad"
            />
            <Button
              title="Generate or open statement"
              busy={busy}
              onPress={() => void generate()}
            />
            {data.statements.map((s) => (
              <Button
                secondary
                key={s.id}
                title={`${s.period_start} — ${s.period_end} · Due ${s.due_date}`}
                onPress={() => router.push({ pathname: '/statement/[id]', params: { id: s.id } })}
              />
            ))}
          </Card>
          <Label>Card activity</Label>
          {data.transactions.map((t) => (
            <TransactionItem key={t.id} item={t} />
          ))}
        </>
      )}
    </Screen>
  );
}
