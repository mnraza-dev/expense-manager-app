import { useCallback } from 'react';
import { useRouter } from 'expo-router';
import { Button, Card, Empty, Label, Screen } from '../../src/components/ui';
import { QueryState } from '../../src/components/QueryState';
import { useDatabaseQuery } from '../../src/hooks/useDatabaseQuery';
import { repo } from '../../src/db/database';
import { money } from '../../src/utils/finance';
export default function Loans() {
  const router = useRouter();
  const load = useCallback(() => repo().loans(), []);
  const query = useDatabaseQuery(load, 'ledger');
  return (
    <Screen
      title="Loans & debts"
      subtitle="Money borrowed and money lent"
      back
      action={() => router.push('/loan/add')}>
      <QueryState {...query} />
      {query.data?.map((l) => (
        <Card key={l.id}>
          <Label>{l.name}</Label>
          <Label small>
            {l.direction === 'borrowed' ? 'Borrowed · Liability' : 'Lent · Receivable'} · {l.status}{' '}
            · {l.counterparty}
          </Label>
          <Label small>Original principal {money(l.principal)}</Label>
          <Button
            secondary
            title="Balance, payments & schedule"
            onPress={() => router.push({ pathname: '/loan/[id]', params: { id: l.id } })}
          />
        </Card>
      ))}
      {query.data?.length === 0 && (
        <Empty
          title="No loans recorded"
          detail="Add a borrowed loan or money lent. Principal is tracked separately from interest and fees."
        />
      )}
    </Screen>
  );
}
