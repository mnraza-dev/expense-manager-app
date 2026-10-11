import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronDown, ChevronRight, ChevronUp, Pencil, Plus } from 'lucide-react-native';
import { Button, Card, Empty, Label, Screen, confirm, useTheme } from '../../src/components/ui';
import { DepthSurface } from '../../src/components/Depth';
import { MotionPressable, Reveal } from '../../src/components/Motion';
import { MonthSelector } from '../../src/components/MonthSelector';
import { BudgetProgressCard } from '../../src/components/BudgetProgressCard';
import { BudgetComparisonChart } from '../../src/components/charts';
import { QueryState } from '../../src/components/QueryState';
import { useDatabaseQuery } from '../../src/hooks/useDatabaseQuery';
import { repo } from '../../src/db/database';
import { useFinance } from '../../src/store/useFinance';
import { localDate, money } from '../../src/utils/finance';
import { monthRange } from '../../src/utils/periods';

function monthLabel(month: string) {
  const [year, value] = month.split('-').map(Number);
  return new Date(year, value - 1, 1).toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
  });
}

export default function Budgets() {
  const router = useRouter();
  const c = useTheme();
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
  const [manage, setManage] = useState(false);
  const [comparison, setComparison] = useState(false);
  const mutate = useFinance((s) => s.mutateBudget);
  const load = useCallback(
    async () => ({
      month,
      progress: await repo().budgetProgress(month),
      history: await repo().budgetHistory(),
    }),
    [month]
  );
  const query = useDatabaseQuery(load);
  const data = query.data?.month === month ? query.data : undefined;
  const p = data?.progress;
  const changeMonth = (value: string) => {
    setManage(false);
    setComparison(false);
    setMonth(value);
  };
  const editBudget = () => {
    if (p?.budget) router.push({ pathname: '/budget/[id]', params: { id: p.budget.id } });
  };
  const createBudget = () => router.push({ pathname: '/budget/add', params: { month } });
  const currentMonth = localDate().slice(0, 7);

  return (
    <Screen
      title="Budgets"
      subtitle="Your monthly spending plan"
      headerActions={
        p && (
          <MotionPressable
            depth
            accessibilityRole="button"
            accessibilityLabel={p.budget ? 'Edit monthly budget' : 'Create monthly budget'}
            onPress={p.budget ? editBudget : createBudget}
            style={[budgetStyles.headerAction, { backgroundColor: c.accent }]}>
            {p.budget ? (
              <Pencil size={20} color={c.onAccent} />
            ) : (
              <Plus size={22} color={c.onAccent} />
            )}
          </MotionPressable>
        )
      }>
      <View style={budgetStyles.content}>
        <DepthSurface
          edgeColor={c.border}
          radius={16}
          faceStyle={[budgetStyles.month, { backgroundColor: c.card, borderColor: c.border }]}>
          <MonthSelector month={month} onChange={changeMonth} />
        </DepthSurface>
        {month !== currentMonth && (
          <MotionPressable
            accessibilityRole="button"
            accessibilityLabel="Return to this month's budget"
            onPress={() => changeMonth(currentMonth)}
            style={[budgetStyles.thisMonth, { backgroundColor: c.soft }]}>
            <Text style={{ color: c.accent, fontWeight: '600' }}>Back to this month</Text>
          </MotionPressable>
        )}
        <QueryState {...query} loading={query.loading || (!data && !query.error)} />
        {p && (
          <>
            {p.budget ? (
              <View style={budgetStyles.section}>
                <BudgetProgressCard
                  art
                  name={p.budget.name}
                  limit={p.budget.total_limit_minor}
                  spent={p.spent}
                />
                <Text style={{ color: c.muted, fontSize: 13, lineHeight: 20 }}>
                  All monthly expenses count toward this limit, including categories without an
                  allocation.
                </Text>
                <Button
                  secondary
                  title={manage ? 'Hide budget options' : 'Manage budget'}
                  onPress={() => setManage((value) => !value)}
                />
                {manage && (
                  <Reveal style={budgetStyles.section}>
                    <Button secondary title="Edit this budget" onPress={editBudget} />
                    <Button
                      danger
                      title="Delete this month's budget"
                      onPress={() => {
                        const id = p.budget!.id;
                        confirm(
                          'Delete monthly budget?',
                          'This removes the budget and its allocations. All transactions remain intact.',
                          () => mutate(() => repo().deleteBudget(id))
                        );
                      }}
                    />
                  </Reveal>
                )}
              </View>
            ) : (
              <View style={budgetStyles.section}>
                <Empty
                  art="chart"
                  title="Plan this month's spending"
                  detail={`You've spent ${money(p.spent)} in ${monthLabel(month)}. Set a monthly limit to track what's left.`}
                />
                <View style={budgetStyles.createAction}>
                  <Button title="Create a monthly budget" onPress={createBudget} />
                </View>
              </View>
            )}
            {p.budget && (
              <View style={budgetStyles.section}>
                <View style={budgetStyles.sectionHeading}>
                  <Text accessibilityRole="header" style={[budgetStyles.title, { color: c.text }]}>
                    Category allocations
                  </Text>
                  <Text style={{ color: c.muted, fontSize: 13 }}>
                    {p.categories.length} allocated ·{' '}
                    {p.categories.filter((row) => row.spent > row.allocated).length} over limit
                  </Text>
                </View>
                {p.categories.length ? (
                  <>
                    {p.categories.map((row) => (
                      <BudgetProgressCard
                        key={row.category_id}
                        name={row.name + (row.archived ? ' (archived)' : '')}
                        limit={row.allocated}
                        spent={row.spent}
                      />
                    ))}
                    <Button
                      secondary
                      title={comparison ? 'Hide comparison' : 'View budget vs actual'}
                      onPress={() => setComparison((value) => !value)}
                    />
                    {comparison && <BudgetComparisonChart key={month} rows={p.categories} />}
                  </>
                ) : (
                  <Card>
                    <Label>No category limits yet</Label>
                    <Label small>
                      Your monthly limit is active. Add optional category allocations to see
                      individual progress.
                    </Label>
                    <Button secondary title="Add category allocations" onPress={editBudget} />
                  </Card>
                )}
              </View>
            )}
            {p.unbudgeted.length > 0 && (
              <View style={budgetStyles.section}>
                <Card>
                  <Label>
                    {p.budget ? 'Spending without a category limit' : 'Spending by category'}
                  </Label>
                  <Label small>
                    {p.budget
                      ? 'Included in your total monthly spending.'
                      : 'These are your expenses for the selected month.'}
                  </Label>
                  {p.unbudgeted.map((row, index) => (
                    <View
                      key={row.id}
                      style={[
                        budgetStyles.spendingRow,
                        index > 0 && { borderTopWidth: 1, borderTopColor: c.border },
                      ]}>
                      <Text style={{ color: c.text, fontSize: 14, flex: 1 }}>{row.name}</Text>
                      <Text style={[budgetStyles.rowAmount, { color: c.text }]}>
                        {money(row.amount)}
                      </Text>
                    </View>
                  ))}
                </Card>
              </View>
            )}
            <View style={budgetStyles.section}>
              <MotionPressable
                accessibilityRole="button"
                accessibilityState={{ expanded: history }}
                onPress={() => setHistory((value) => !value)}
                style={[
                  budgetStyles.historyToggle,
                  { backgroundColor: c.card, borderColor: c.border },
                ]}>
                <Text style={[budgetStyles.title, { color: c.text, flex: 1 }]}>Budget history</Text>
                {history ? (
                  <ChevronUp color={c.muted} size={20} />
                ) : (
                  <ChevronDown color={c.muted} size={20} />
                )}
              </MotionPressable>
              {history && (
                <Card>
                  {data.history.length ? (
                    data.history.map((row, index) => {
                      const savedMonth = row.period_start.slice(0, 7);
                      return (
                        <MotionPressable
                          key={row.id}
                          accessibilityRole="button"
                          accessibilityLabel={`View ${monthLabel(savedMonth)} budget, ${row.name}`}
                          accessibilityState={{ selected: savedMonth === month }}
                          onPress={() => changeMonth(savedMonth)}
                          style={[
                            budgetStyles.historyRow,
                            index > 0 && { borderTopWidth: 1, borderTopColor: c.border },
                          ]}>
                          <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                            <Text
                              style={{
                                color: savedMonth === month ? c.accent : c.text,
                                fontWeight: '600',
                              }}>
                              {monthLabel(savedMonth)}
                            </Text>
                            <Text style={{ color: c.muted, fontSize: 13 }}>{row.name}</Text>
                            <Text style={{ color: c.text, fontSize: 14 }}>
                              Limit {money(row.total_limit_minor)}
                            </Text>
                          </View>
                          <ChevronRight size={20} color={c.muted} />
                        </MotionPressable>
                      );
                    })
                  ) : (
                    <Label small>No saved budgets yet.</Label>
                  )}
                </Card>
              )}
            </View>
          </>
        )}
      </View>
    </Screen>
  );
}

const budgetStyles = StyleSheet.create({
  headerAction: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { paddingTop: 12, paddingBottom: 24, gap: 24 },
  month: { padding: 4, borderRadius: 16, borderWidth: 1 },
  thisMonth: { alignSelf: 'center', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12 },
  section: { gap: 16 },
  sectionHeading: { gap: 6 },
  title: { fontSize: 17, fontWeight: '600' },
  createAction: { paddingTop: 8 },
  spendingRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  rowAmount: { maxWidth: '60%', fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] },
  historyToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 1,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 16,
    minHeight: 64,
  },
});
