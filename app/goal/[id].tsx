import { useCallback, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { Button, Card, Label, Screen, confirm } from '../../src/components/ui';
import { AdvancedForm } from '../../src/components/AdvancedForm';
import { QueryState } from '../../src/components/QueryState';
import { useDatabaseQuery } from '../../src/hooks/useDatabaseQuery';
import { repo } from '../../src/db/database';
import { useFinance } from '../../src/store/useFinance';
import { localDate, minor, money } from '../../src/utils/finance';
import { GoalForm } from '../../src/features/GoalForm';
export default function GoalDetail() {
  const { id } = useLocalSearchParams<{ id: string }>(),
    goalId = Number(id),
    mutate = useFinance((s) => s.mutatePlanning);
  const [editing, setEditing] = useState(false),
    [adding, setAdding] = useState(false);
  const query = useDatabaseQuery(
      useCallback(() => repo().goal(goalId), [goalId]),
      'planning'
    ),
    data = query.data;
  if (editing && data) return <GoalForm goal={data.goal} onDone={() => setEditing(false)} />;
  return (
    <Screen title={data?.goal.name ?? 'Savings goal'} back backTo="/goal">
      <QueryState {...query} />
      {data === null && <Label>Goal no longer exists.</Label>}
      {data && (
        <>
          <Card>
            <Label>
              {money(data.goal.saved)} of {money(data.goal.target_amount)}
            </Label>
            <Label small>
              {data.goal.due_date ? `Target date ${data.goal.due_date}` : 'No target date'} ·{' '}
              {data.goal.saved >= data.goal.target_amount
                ? 'Target reached'
                : `${money(data.goal.target_amount - data.goal.saved)} remaining`}
            </Label>
            <Label small>
              Contributions earmark money only. Record actual savings transfers in Transactions.
            </Label>
          </Card>
          <Button secondary title="Edit goal" onPress={() => setEditing(true)} />
          <Button
            secondary
            title={data.goal.archived ? 'Restore goal' : 'Archive goal'}
            onPress={() =>
              confirm('Change goal status?', 'Your contribution history is retained.', () =>
                mutate(() => repo().archiveGoal(goalId, !data.goal.archived))
              )
            }
          />
          {!data.goal.archived && (
            <Button
              title={adding ? 'Hide contribution form' : 'Add or withdraw earmarked savings'}
              onPress={() => setAdding(!adding)}
            />
          )}
          {adding && !data.goal.archived && (
            <AdvancedForm
              key={data.contributions.length}
              title="Save contribution"
              fields={[
                {
                  name: 'direction',
                  label: 'Action',
                  choices: [
                    { value: 'add', label: 'Add savings' },
                    { value: 'withdraw', label: 'Withdraw savings' },
                  ],
                },
                { name: 'amount', label: 'Amount (₹)', kind: 'amount' },
                { name: 'date', label: 'Contribution date', kind: 'date' },
                { name: 'notes', label: 'Notes', optional: true },
              ]}
              defaults={{ direction: 'add', amount: '', date: localDate(), notes: '' }}
              onSubmit={async (v) => {
                await mutate(() =>
                  repo().contribute({
                    goal_id: goalId,
                    direction: v.direction as 'add' | 'withdraw',
                    amount: minor(v.amount),
                    date: v.date,
                    notes: v.notes,
                  })
                );
                setAdding(false);
              }}
            />
          )}
          <Label>Contribution history</Label>
          {!data.contributions.length && <Label small>No contributions yet.</Label>}
          {data.contributions.map((c) => (
            <Card key={c.id}>
              <Label>
                {c.direction === 'add' ? '+' : '−'}
                {money(c.amount)} · {c.date}
              </Label>
              {c.notes && <Label small>{c.notes}</Label>}
              <Button
                secondary
                title="Remove contribution"
                onPress={() =>
                  confirm(
                    'Remove contribution?',
                    'This recalculates earmarked savings for this goal.',
                    () => mutate(() => repo().deleteContribution(c.id))
                  )
                }
              />
            </Card>
          ))}
        </>
      )}
    </Screen>
  );
}
