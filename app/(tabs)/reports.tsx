import { useCallback, useState } from 'react';
import { useRouter } from 'expo-router';
import { Button, Card, Choices, Empty, Label, Screen } from '../../src/components/ui';
import { DateRangeSelector } from '../../src/components/DateRangeSelector';
import {
  IncomeExpenseChart,
  ExpenseBreakdownChart,
  SpendingTrendChart,
  BudgetComparisonChart,
} from '../../src/components/charts';
import { QueryState } from '../../src/components/QueryState';
import { TransactionItem } from '../../src/components/TransactionItem';
import { useDatabaseQuery } from '../../src/hooks/useDatabaseQuery';
import { repo } from '../../src/db/database';
import { fillPeriods, presetRange } from '../../src/utils/periods';
import { money } from '../../src/utils/finance';
export default function Reports() {
  const router = useRouter();
  const [range, setRange] = useState(() => presetRange('this-month'));
  const [category, setCategory] = useState(0);
  const [details, setDetails] = useState(false);
  const load = useCallback(() => repo().report(range), [range]);
  const query = useDatabaseQuery(load);
  const report = query.data;
  const expense = report?.categories.filter((c) => c.type === 'expense') ?? [];
  const income = report?.categories.filter((c) => c.type === 'income') ?? [];
  const selected = expense.find((c) => c.id === category) ?? expense[0];
  const categoryPeriods =
    report && selected
      ? fillPeriods(
          range,
          report.categoryMonths
            .filter((row) => row.category_id === selected.id)
            .map((row) => ({ period: row.period, income: 0, expense: row.amount, count: 0 })),
          false
        )
      : [];
  const chartKey = `${range.start}-${range.end}`;
  return (
    <Screen title="Reports" subtitle="Find the patterns behind your money">
      <Button
        secondary
        title="Monthly budgets & progress →"
        onPress={() => router.push('/budget')}
      />
      <Button
        secondary
        title="Assets, liabilities & net worth →"
        onPress={() => router.push('/net-worth')}
      />
      <DateRangeSelector value={range} onChange={setRange} />
      <QueryState {...query} />
      {report && (
        <>
          <Card>
            <Label>Income {money(report.income)}</Label>
            <Label>Expenses {money(report.expense)}</Label>
            <Label>Net cash flow {money(report.net)}</Label>
            <Label small>{report.count} transactions · Transfers excluded from cash flow</Label>
            <Label small>Average daily expenses {money(report.dailyAverage)}</Label>
            <Label small>
              Expenses ÷ {report.days} calendar days in the selected range, including future days.
            </Label>
            <Label small>
              Highest spending category:{' '}
              {expense[0] ? `${expense[0].name} · ${money(expense[0].amount)}` : 'None'}
            </Label>
          </Card>
          {report.count === 0 ? (
            <Empty
              title="Nothing to report yet"
              detail="Choose another period or add a transaction. Your actual activity will appear here."
            />
          ) : (
            <>
              <IncomeExpenseChart key={`bars-${chartKey}`} periods={report.periods} />
              <ExpenseBreakdownChart
                key={`expense-${chartKey}`}
                categories={expense}
                onSelect={(id) => {
                  setCategory(id);
                  setDetails(true);
                }}
              />
              <SpendingTrendChart key={`trend-${chartKey}`} periods={report.periods} />
              <Button
                secondary
                title={
                  details ? 'Hide detailed reports' : 'Category changes, income breakdown & more'
                }
                onPress={() => setDetails(!details)}
              />
              {details && (
                <>
                  <ExpenseBreakdownChart
                    key={`income-${chartKey}`}
                    title="Income by category"
                    categories={income}
                  />
                  {expense.length > 0 && (
                    <>
                      <Choices
                        label="Expense category over time"
                        value={selected?.id}
                        onChange={setCategory}
                        options={expense.map((c) => ({ value: c.id, label: c.name }))}
                      />
                      <SpendingTrendChart
                        key={`category-${chartKey}-${selected?.id}`}
                        title={`${selected?.name} · Monthly changes`}
                        periods={categoryPeriods}
                        expensesOnly
                      />
                      {categoryPeriods.map((p, i) => (
                        <Label small key={p.period}>
                          {p.period} · {money(p.expense)}
                          {i > 0
                            ? ` · Change ${p.expense >= categoryPeriods[i - 1].expense ? '+' : ''}${money(p.expense - categoryPeriods[i - 1].expense)}`
                            : ' · First month in range'}
                        </Label>
                      ))}
                    </>
                  )}
                  <Card>
                    <Label>Highest spending days</Label>
                    {report.highestDays.length ? (
                      report.highestDays.map((day) => (
                        <Label small key={day.date}>
                          {day.date} · {money(day.amount)}
                        </Label>
                      ))
                    ) : (
                      <Label small>No expenses in this range.</Label>
                    )}
                  </Card>
                  <Label small>
                    Budget comparisons use full-month category allocations and only the expenses
                    inside this selected report dates. Partial months are not prorated.
                  </Label>
                  <BudgetComparisonChart
                    key={`budget-${chartKey}`}
                    rows={report.budgetComparisons}
                  />
                </>
              )}
              <Card>
                <Label>Recent transactions in this range</Label>
                {report.recent.map((t) => (
                  <TransactionItem key={t.id} item={t} />
                ))}
              </Card>
            </>
          )}
        </>
      )}
    </Screen>
  );
}
