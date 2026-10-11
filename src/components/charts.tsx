import { useState } from 'react';
import { Pressable, Text, View, useWindowDimensions } from 'react-native';
import { BarChart, LineChart, PieChart } from 'react-native-gifted-charts';
import type { BudgetComparison, CategoryTotal, PeriodTotal } from '../types';
import { money } from '../utils/finance';
import { percentage } from '../utils/budgets';
import { Button, Card, Empty, Label, styles, useTheme } from './ui';

const compact = (v: string) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(Number(v));
function useChartStyle() {
  const c = useTheme();
  const { width } = useWindowDimensions();
  return {
    width: Math.max(140, Math.min(560, width - 122)),
    height: 180,
    noOfSections: 4,
    yAxisLabelWidth: 56,
    yAxisColor: c.border,
    xAxisColor: c.border,
    rulesColor: c.border,
    yAxisTextStyle: { color: c.muted, fontSize: 10 },
    xAxisLabelTextStyle: { color: c.muted, fontSize: 10 },
    formatYLabel: compact,
    isAnimated: false,
  };
}
const shortLabel = (period: string) =>
  period.length === 10
    ? `${period.slice(8)}/${period.slice(5, 7)}`
    : `${period.slice(5, 7)}/${period.slice(2, 4)}`;
function DataTable({ rows }: { rows: { label: string; detail: string; onPress?: () => void }[] }) {
  const [show, setShow] = useState(false);
  return (
    <>
      <Button
        secondary
        title={show ? 'Hide accessible data table' : 'View accessible data table'}
        onPress={() => setShow(!show)}
      />
      {show &&
        rows.map((r, i) => (
          <Pressable accessibilityRole={r.onPress ? 'button' : 'text'} onPress={r.onPress} key={i}>
            <Label small>
              {r.label} · {r.detail}
            </Label>
          </Pressable>
        ))}
    </>
  );
}
export function IncomeExpenseChart({ periods }: { periods: PeriodTotal[] }) {
  const c = useTheme();
  const expenseColor = c.negative;
  const common = useChartStyle();
  const [selection, setSelection] = useState<PeriodTotal | null>(null);
  if (!periods.some((p) => p.income || p.expense))
    return <Empty title="Income vs expenses" detail="No income or expenses in this period." />;
  const skip = Math.max(1, Math.ceil(periods.length / 6));
  const data = periods.flatMap((p, i) => [
    {
      value: p.income / 100,
      label: i % skip === 0 ? shortLabel(p.period) : '',
      frontColor: c.accent,
      spacing: 3,
      onPress: () => setSelection(p),
    },
    {
      value: p.expense / 100,
      frontColor: expenseColor,
      spacing: 14,
      onPress: () => setSelection(p),
    },
  ]);
  return (
    <Card>
      <Label>Income vs expenses</Label>
      <Label small>Teal: income · Red: expenses · Tap a bar; swipe to explore.</Label>
      <BarChart
        {...common}
        data={data}
        barWidth={14}
        initialSpacing={10}
        barBorderTopLeftRadius={4}
        barBorderTopRightRadius={4}
      />
      {selection && (
        <Label small>
          {selection.period} · Income {money(selection.income)} · Expenses{' '}
          {money(selection.expense)}
        </Label>
      )}
      <DataTable
        rows={periods.map((p) => ({
          label: p.period,
          detail: `Income ${money(p.income)}, Expenses ${money(p.expense)}`,
          onPress: () => setSelection(p),
        }))}
      />
    </Card>
  );
}
export function ExpenseBreakdownChart({
  categories,
  title = 'Spending by category',
  onSelect,
}: {
  categories: CategoryTotal[];
  title?: string;
  onSelect?: (id: number) => void;
}) {
  const c = useTheme();
  const { width } = useWindowDimensions();
  const [selected, setSelected] = useState<CategoryTotal | null>(null);
  const total = categories.reduce((s, x) => s + x.amount, 0);
  if (!total) return <Empty title={title} detail="No matching category activity in this range." />;
  const select = (cat: CategoryTotal) => {
    setSelected(cat);
    onSelect?.(cat.id);
  };
  const radius = Math.min(108, (width - 96) / 2);
  return (
    <Card>
      <Label>{title}</Label>
      <View style={{ alignItems: 'center', padding: 12 }}>
        <PieChart
          donut
          radius={radius}
          innerRadius={radius * 0.68}
          innerCircleColor={c.bg}
          strokeWidth={2}
          strokeColor={c.bg}
          data={categories.map((cat) => ({
            value: cat.amount,
            color: ['#167461', '#527E72', '#7F9A8C', '#B2C4B9', '#667273', '#A7AEAA'][
              categories.indexOf(cat) % 6
            ],
            onPress: () => select(cat),
          }))}
          centerLabelComponent={() => (
            <View style={{ alignItems: 'center' }}>
              <Text style={{ color: c.muted, fontSize: 11 }}>TOTAL</Text>
              <Text style={{ color: c.text, fontWeight: '700', fontSize: 14 }}>{money(total)}</Text>
            </View>
          )}
        />
      </View>
      <Label small>Tap a slice or category to inspect its amount.</Label>
      {selected && (
        <Label>
          {selected.name} · {money(selected.amount)} ·{' '}
          {percentage(selected.amount, total).toFixed(1)}%
        </Label>
      )}
      {categories.map((cat) => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${cat.name}, ${money(cat.amount)}, ${percentage(cat.amount, total).toFixed(1)} percent`}
          onPress={() => select(cat)}
          key={cat.id}
          style={[styles.row, { paddingVertical: 8 }]}>
          <View
            style={{
              width: 12,
              height: 12,
              borderRadius: 4,
              backgroundColor: ['#167461', '#527E72', '#7F9A8C', '#B2C4B9', '#667273', '#A7AEAA'][
                categories.indexOf(cat) % 6
              ],
            }}
          />
          <View style={{ flex: 1 }}>
            <Label small>{cat.name}</Label>
          </View>
          <Label small>
            {money(cat.amount)} · {percentage(cat.amount, total).toFixed(1)}%
          </Label>
        </Pressable>
      ))}
    </Card>
  );
}
export function SpendingTrendChart({
  periods,
  title = 'Income & spending trends',
  expensesOnly = false,
}: {
  periods: PeriodTotal[];
  title?: string;
  expensesOnly?: boolean;
}) {
  const c = useTheme();
  const expenseColor = c.negative;
  const common = useChartStyle();
  const [selected, setSelected] = useState<PeriodTotal | null>(null);
  if (!periods.some((p) => p.expense || (!expensesOnly && p.income)))
    return <Empty title={title} detail="No activity to plot for this period." />;
  const skip = Math.max(1, Math.ceil(periods.length / 6));
  const data = periods.map((p, i) => ({
    value: p.expense / 100,
    label: i % skip === 0 ? shortLabel(p.period) : '',
    onPress: () => setSelected(p),
  }));
  const income = periods.map((p) => ({ value: p.income / 100 }));
  return (
    <Card>
      <Label>{title}</Label>
      <Label small>
        {expensesOnly ? 'Expenses' : 'Red: expenses · Teal: income'} · Tap a point; swipe to
        explore.
      </Label>
      <LineChart
        {...common}
        data={data}
        data2={expensesOnly ? undefined : income}
        color={expenseColor}
        color2={c.accent}
        dataPointsColor={expenseColor}
        dataPointsColor2={c.accent}
        spacing={42}
        initialSpacing={10}
        thickness={2}
        focusEnabled
        onFocus={(_: unknown, index: number) => {
          if (periods[index]) setSelected(periods[index]);
        }}
      />
      {selected && (
        <Label small>
          {selected.period} · Expenses {money(selected.expense)}
          {!expensesOnly ? ` · Income ${money(selected.income)}` : ''}
        </Label>
      )}
      <DataTable
        rows={periods.map((p) => ({
          label: p.period,
          detail: `Expenses ${money(p.expense)}${!expensesOnly ? `, Income ${money(p.income)}` : ''}`,
          onPress: () => setSelected(p),
        }))}
      />
    </Card>
  );
}
export function BudgetComparisonChart({ rows }: { rows: BudgetComparison[] }) {
  const c = useTheme();
  const expenseColor = c.negative;
  const common = useChartStyle();
  const [selected, setSelected] = useState<BudgetComparison | null>(null);
  if (!rows.length)
    return (
      <Empty
        title="Budget vs actual"
        detail="Category allocations will appear here after you create a budget."
      />
    );
  const data = rows.flatMap((r, i) => [
    {
      value: r.allocated / 100,
      label: String(i + 1),
      frontColor: c.accent,
      spacing: 3,
      onPress: () => setSelected(r),
    },
    {
      value: r.spent / 100,
      frontColor: r.spent > r.allocated ? c.negative : expenseColor,
      spacing: 18,
      onPress: () => setSelected(r),
    },
  ]);
  return (
    <Card>
      <Label>Category budget vs actual</Label>
      <Label small>First bar: category limit · Second bar: spending. Tap a bar for details.</Label>
      <BarChart {...common} data={data} barWidth={17} initialSpacing={10} />
      {selected && (
        <Label small>
          {selected.month} · {selected.name} · Limit {money(selected.allocated)} · Spent{' '}
          {money(selected.spent)}
        </Label>
      )}
      {rows.map((r, i) => (
        <Pressable
          accessibilityRole="button"
          onPress={() => setSelected(r)}
          key={`${r.budget_id}-${r.category_id}`}>
          <Label small>
            {i + 1}. {r.month} · {r.name} · {money(r.spent)} of {money(r.allocated)}
            {r.spent > r.allocated ? ` · Exceeded by ${money(r.spent - r.allocated)}` : ''}
          </Label>
        </Pressable>
      ))}
    </Card>
  );
}
