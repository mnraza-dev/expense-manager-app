import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
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
  const categories = useFinance((s) => s.categories);
  const load = useCallback(
    async () => ({
      month,
      progress: await repo().budgetProgress(month),
    }),
    [month]
  );
  const query = useDatabaseQuery(load, 'both', { keepPreviousData: true });
  const historyQuery = useDatabaseQuery(
    useCallback(() => repo().budgetHistory(), []),
    'budget'
  );
  const data = query.data;
  const p = data?.progress;
  const waiting = query.loading || query.refreshing || query.isPreviousData;
  const displayedMonth = data?.month ?? month;
  const changeMonth = (value: string) => {
    setManage(false);
    setMonth(value);
  };
  const editBudget = () => {
    if (!waiting && p?.budget)
      router.push({ pathname: '/budget/[id]', params: { id: p.budget.id } });
  };
  const createBudget = () => {
    if (!waiting) router.push({ pathname: '/budget/add', params: { month } });
  };
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
            accessibilityState={{ disabled: waiting }}
            disabled={waiting}
            onPress={p.budget ? editBudget : createBudget}
            style={[
              budgetStyles.headerAction,
              { backgroundColor: c.accent, opacity: waiting ? 0.5 : 1 },
            ]}>
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
          <View style={budgetStyles.monthTools}>
            <View style={budgetStyles.queryStatus} accessibilityLiveRegion="polite">
              {(query.loading || query.refreshing) && (
                <>
                  <ActivityIndicator size="small" color={c.accent} />
                  <Text style={{ color: c.muted, fontSize: 12 }}>Updating…</Text>
                </>
              )}
            </View>
            <MotionPressable
              accessibilityRole="button"
              accessibilityLabel="Return to this month's budget"
              accessibilityState={{ disabled: month === currentMonth }}
              disabled={month === currentMonth}
              onPress={() => changeMonth(currentMonth)}
              style={[
                budgetStyles.thisMonth,
                { backgroundColor: c.soft, opacity: month === currentMonth ? 0.5 : 1 },
              ]}>
              <Text style={{ color: c.accent, fontWeight: '600', fontSize: 12 }}>This month</Text>
            </MotionPressable>
          </View>
        </DepthSurface>
        <QueryState {...query} refreshing={false} />
        {p && (
          <>
            {p.budget ? (
              <View style={budgetStyles.section}>
                <BudgetProgressCard
                  art
                  threeDimensional
                  animate={false}
                  period={monthLabel(displayedMonth)}
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
                  disabled={waiting}
                  title={manage ? 'Hide budget options' : 'Manage budget'}
                  onPress={() => setManage((value) => !value)}
                />
                {manage && (
                  <Reveal style={budgetStyles.section}>
                    <Button
                      secondary
                      title="Edit this budget"
                      disabled={waiting}
                      onPress={editBudget}
                    />
                    <Button
                      danger
                      disabled={waiting}
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
                  animate={false}
                  title="Plan this month's spending"
                  detail={`You've spent ${money(p.spent)} in ${monthLabel(displayedMonth)}. Set a monthly limit to track what's left.`}
                />
                <View style={budgetStyles.createAction}>
                  <Button
                    title="Create a monthly budget"
                    disabled={waiting}
                    onPress={createBudget}
                  />
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
                        animate={false}
                        period={monthLabel(displayedMonth)}
                        name={row.name + (row.archived ? ' (archived)' : '')}
                        categoryIcon={
                          categories.find((category) => category.id === row.category_id)?.icon
                        }
                        limit={row.allocated}
                        spent={row.spent}
                      />
                    ))}
                    <Button
                      secondary
                      title={comparison ? 'Hide comparison' : 'View budget vs actual'}
                      onPress={() => setComparison((value) => !value)}
                    />
                    {comparison && <BudgetComparisonChart animate={false} rows={p.categories} />}
                  </>
                ) : (
                  <Card animate={false}>
                    <Label>No category limits yet</Label>
                    <Label small>
                      Your monthly limit is active. Add optional category allocations to see
                      individual progress.
                    </Label>
                    <Button
                      secondary
                      title="Add category allocations"
                      disabled={waiting}
                      onPress={editBudget}
                    />
                  </Card>
                )}
              </View>
            )}
            {p.unbudgeted.length > 0 && (
              <View style={budgetStyles.section}>
                <Card animate={false}>
                  <Label>
                    {p.budget ? 'Spending without a category limit' : 'Spending by category'}
                  </Label>
                  <Label small>
                    Expenses for {monthLabel(displayedMonth)}.
                    {p.budget ? ' Included in your total monthly spending.' : ''}
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
                <Card animate={false}>
                  <QueryState {...historyQuery} />
                  {historyQuery.data?.length ? (
                    historyQuery.data.map((row, index) => {
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
                  ) : !historyQuery.loading && !historyQuery.error ? (
                    <Label small>No saved budgets yet.</Label>
                  ) : null}
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
  monthTools: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 8,
    paddingBottom: 4,
    minHeight: 44,
  },
  queryStatus: { flex: 1, minHeight: 24, flexDirection: 'row', alignItems: 'center', gap: 6 },
  thisMonth: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12 },
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
