import { useCallback, useState } from 'react';
import { useRouter } from 'expo-router';
import { Button, Card, Choices, Empty, Label, Screen, useTheme } from '../../src/components/ui';
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
import { AnimatedAmount, ChartSurface } from '../../src/components/charting/AnimatedCharts';
import { Text, View } from 'react-native';
export default function Reports() {
  const router = useRouter();
  const c = useTheme();
  const [range, setRange] = useState(() => presetRange('this-month'));
  const [category, setCategory] = useState(0);
  const [details, setDetails] = useState(false);
  const load = useCallback(() => repo().report(range), [range]);
  const query = useDatabaseQuery(load, 'both', { keepPreviousData: true });
  const report = query.data;
  const expense = report?.categories.filter((c) => c.type === 'expense') ?? [];
  const income = report?.categories.filter((c) => c.type === 'income') ?? [];
  const selected = expense.find((c) => c.id === category) ?? expense[0];
  const categoryPeriods =
    report && selected
      ? fillPeriods(
          report.range,
          report.categoryMonths
            .filter((row) => row.category_id === selected.id)
            .map((row) => ({ period: row.period, income: 0, expense: row.amount, count: 0 })),
          false
        )
      : [];
  return (
    <Screen title="Insights" subtitle="Find the pattern in your money" back>
      <DateRangeSelector value={range} onChange={setRange} />
      <QueryState {...query} />
      {report && (
        <>
          <ChartSurface
            title="Your money, at a glance"
            subtitle={`${report.range.start} – ${report.range.end}${query.isPreviousData ? ' · Previous selection' : ''}`}
            amount={report.net}
            badge="NET FLOW">
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
              {[
                { label: 'Income', amount: report.income, color: c.positive },
                { label: 'Net spending', amount: report.expense, color: c.warning },
              ].map((row) => (
                <View key={row.label} style={{ flex: 1, minWidth: 100, gap: 5 }}>
                  <Text style={{ color: c.muted, fontSize: 12 }}>{row.label}</Text>
                  <AnimatedAmount amount={row.amount} color={row.color} size={22} />
                </View>
              ))}
            </View>
            <Label small>{report.count} transactions · Transfers excluded from cash flow</Label>
            <Label small>Average daily expenses {money(report.dailyAverage)}</Label>
            <Label small>
              Expenses ÷ {report.days} calendar days in the selected range, including future days.
            </Label>
            <Label small>
              Highest spending category:{' '}
              {expense[0] ? `${expense[0].name} · ${money(expense[0].amount)}` : 'None'}
            </Label>
            <Label small>
              Refunds reduce spending on their recorded date and do not count as income.
            </Label>
          </ChartSurface>
          {report.count === 0 ? (
            <Empty
              title="Nothing to report yet"
              detail="Choose another period or add a transaction. Your actual activity will appear here."
            />
          ) : (
            <>
              <IncomeExpenseChart periods={report.periods} />
              <SpendingTrendChart periods={report.periods} />
              <ExpenseBreakdownChart
                categories={expense}
                onSelect={(id) => {
                  setCategory(id);
                  setDetails(true);
                }}
              />

              <Button
                secondary
                title={
                  details ? 'Hide detailed reports' : 'Category changes, income breakdown & more'
                }
                onPress={() => setDetails(!details)}
              />
              {details && (
                <>
                  <ExpenseBreakdownChart title="Income by category" categories={income} />
                  {expense.length > 0 && (
                    <>
                      <Choices
                        label="Expense category over time"
                        value={selected?.id}
                        onChange={setCategory}
                        options={expense.map((c) => ({ value: c.id, label: c.name }))}
                      />
                      <SpendingTrendChart
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
                  <BudgetComparisonChart rows={report.budgetComparisons} />
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
      <Button
        secondary
        title="Daily, weekly & monthly PDF / Excel exports →"
        onPress={() => router.push('/data')}
      />
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
    </Screen>
  );
}
