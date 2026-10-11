import { useCallback, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Button, Card, Empty, Label, Screen, confirm } from '../../src/components/ui';
import { MonthSelector } from '../../src/components/MonthSelector';
import { BudgetProgressCard } from '../../src/components/BudgetProgressCard';
import { BudgetComparisonChart } from '../../src/components/charts';
import { QueryState } from '../../src/components/QueryState';
import { useDatabaseQuery } from '../../src/hooks/useDatabaseQuery';
import { repo } from '../../src/db/database';
import { useFinance } from '../../src/store/useFinance';
import { localDate, money } from '../../src/utils/finance';
import { monthRange } from '../../src/utils/periods';
export default function Budgets() {
  const router = useRouter();
  const params = useLocalSearchParams<{ month?: string }>();
  const [month, setMonth] = useState(() => {
    try {
      monthRange(params.month ?? '');
      return params.month!;
    } catch {
      return localDate().slice(0, 7);
    }
  });
  const [history, setHistory] = useState(false);
  const mutate = useFinance((s) => s.mutateBudget);
  const load = useCallback(
    async () => ({
      progress: await repo().budgetProgress(month),
      history: await repo().budgetHistory(),
    }),
    [month]
  );
  const query = useDatabaseQuery(load);
  const p = query.data?.progress;
  return (
    <Screen
      title="Budgets"
      action={() => router.push({ pathname: '/budget/add', params: { month } })}>
      <MonthSelector month={month} onChange={setMonth} />
      <QueryState {...query} />
      {p && (
        <>
          {p.budget ? (
            <>
              <BudgetProgressCard
                name={p.budget.name}
                limit={p.budget.total_limit_minor}
                spent={p.spent}
              />
              <Label small>
                {p.categories.filter((c) => c.spent > c.allocated).length} categories exceeded ·{' '}
                {p.categories.length} allocated categories
              </Label>
              <Button
                secondary
                title="Edit this budget"
                onPress={() =>
                  router.push({ pathname: '/budget/[id]', params: { id: p.budget!.id } })
                }
              />
              <Button
                danger
                title="Delete this month's budget"
                onPress={() =>
                  confirm(
                    'Delete monthly budget?',
                    'This removes the budget and its allocations. All transactions remain intact.',
                    () => mutate(() => repo().deleteBudget(p.budget!.id))
                  )
                }
              />
              <Label>Category progress</Label>
              {p.categories.map((c) => (
                <BudgetProgressCard
                  key={c.category_id}
                  name={c.name + (c.archived ? ' (archived)' : '')}
                  limit={c.allocated}
                  spent={c.spent}
                />
              ))}
              <BudgetComparisonChart key={month} rows={p.categories} />
            </>
          ) : (
            <>
              <Empty
                title="No budget for this month"
                detail={`You've spent ${money(p.spent)}. Create a monthly limit to see remaining funds and progress.`}
              />
              <Button
                title="Create a monthly budget"
                onPress={() => router.push({ pathname: '/budget/add', params: { month } })}
              />
            </>
          )}
          {p.unbudgeted.length > 0 && (
            <Card>
              <Label>Spending without a category limit</Label>
              <Label small>These expenses still count against the overall monthly limit.</Label>
              {p.unbudgeted.map((c) => (
                <Label small key={c.id}>
                  {c.name} · {money(c.amount)} · No category budget
                </Label>
              ))}
            </Card>
          )}
        </>
      )}
      <Button
        secondary
        title={history ? 'Hide budget history' : 'View budget history'}
        onPress={() => setHistory(!history)}
      />
      {history &&
        query.data?.history.map((b) => (
          <Button
            secondary
            key={b.id}
            title={`${b.period_start.slice(0, 7)} · ${b.name} · ${money(b.total_limit_minor)}`}
            onPress={() => setMonth(b.period_start.slice(0, 7))}
          />
        ))}
      {history && query.data?.history.length === 0 && <Label small>No saved budgets yet.</Label>}
    </Screen>
  );
}
