import { useCallback } from 'react';
import { useRouter } from 'expo-router';
import { Button, Card, Empty, Label, Screen } from '../../src/components/ui';
import { QueryState } from '../../src/components/QueryState';
import { useDatabaseQuery } from '../../src/hooks/useDatabaseQuery';
import { repo } from '../../src/db/database';
import { localDate, money } from '../../src/utils/finance';
export default function Goals() {
  const router = useRouter(),
    query = useDatabaseQuery(
      useCallback(() => repo().goals(), []),
      'ledger'
    );
  return (
    <Screen
      title="Savings goals"
      subtitle="Give your savings a purpose"
      back
      action={() => router.push('/goal/add')}>
      <Label small>
        Contributions earmark money you already have. They do not move money or change account
        balances.
      </Label>
      <QueryState {...query} />
      {query.data?.length === 0 && (
        <Empty
          title="Your first savings goal"
          detail="Plan an emergency fund, a trip or a future purchase."
        />
      )}
      {query.data?.map((g) => (
        <Card key={g.id}>
          <Label>
            {g.name}
            {g.archived ? ' · Archived' : ''}
          </Label>
          <Label>
            {money(g.saved)} of {money(g.target_amount)} ·{' '}
            {Math.round((g.saved / g.target_amount) * 100)}%
          </Label>
          <Label small>
            {g.saved >= g.target_amount
              ? 'Target reached'
              : `${money(Math.max(0, g.target_amount - g.saved))} remaining`}
            {g.due_date
              ? ` · Target ${g.due_date}${g.due_date < localDate() && g.saved < g.target_amount ? ' · Past target date' : ''}`
              : ''}
          </Label>
          <Button
            secondary
            title="View goal & contributions"
            onPress={() => router.push({ pathname: '/goal/[id]', params: { id: g.id } })}
          />
        </Card>
      ))}
    </Screen>
  );
}
