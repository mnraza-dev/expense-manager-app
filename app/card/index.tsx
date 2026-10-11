import { useCallback } from 'react';
import { useRouter } from 'expo-router';
import { Button, Card, Empty, Label, Screen } from '../../src/components/ui';
import { QueryState } from '../../src/components/QueryState';
import { useDatabaseQuery } from '../../src/hooks/useDatabaseQuery';
import { repo } from '../../src/db/database';
import { money } from '../../src/utils/finance';
export default function Cards() {
  const router = useRouter();
  const load = useCallback(() => repo().cards(), []);
  const query = useDatabaseQuery(load, 'ledger');
  return (
    <Screen
      title="Credit cards"
      subtitle="Purchases, balances and statements"
      back
      action={() => router.push('/card/add')}>
      <Label small>
        Only card names and billing preferences are stored. Never enter card numbers, CVVs, PINs or
        banking credentials.
      </Label>
      <QueryState {...query} />
      {query.data?.map((c) => (
        <Card key={c.account_id}>
          <Label>
            {c.name}
            {c.archived ? ' (archived)' : ''}
          </Label>
          <Label small>{c.nickname}</Label>
          <Label>Outstanding {money(c.outstanding)}</Label>
          <Label small>
            Available credit {money(c.credit_limit - c.outstanding)} · Limit {money(c.credit_limit)}
          </Label>
          <Button
            secondary
            title="Card details & statements"
            onPress={() => router.push({ pathname: '/card/[id]', params: { id: c.account_id } })}
          />
        </Card>
      ))}
      {query.data?.length === 0 && (
        <Empty
          title="No credit cards yet"
          detail="Add a card with its limit and billing dates. Purchases will count as expenses; repayments will not."
        />
      )}
    </Screen>
  );
}
