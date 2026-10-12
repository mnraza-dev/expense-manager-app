import { useId, useMemo, useState } from 'react';
import { ScrollView, Text, View, useWindowDimensions } from 'react-native';
import Svg, {
  Defs,
  LinearGradient,
  Stop,
  Line,
  Rect,
  Circle,
  G,
  Text as SvgText,
} from 'react-native-svg';
import type { BudgetComparison, CategoryTotal, PeriodTotal } from '../types';
import { money } from '../utils/finance';
import {
  categoryRingSegments,
  chartDomain,
  chartPeriods,
  curvePath,
  type ChartPeriod,
} from '../utils/chartData';
import { Button, Empty, Label, useTheme } from './ui';
import { MotionPressable } from './Motion';
import {
  AnimatedAmount,
  AnimatedColumn,
  AnimatedLine,
  AnimatedTrack,
  ChartSurface,
  useChartColors,
} from './charting/AnimatedCharts';
import { ThreeRingChart } from './charting/ThreeRingChart';
import { CategoryIcon } from './CategoryIcon';
import { useFinance } from '../store/useFinance';
const plotHeight = 168,
  left = 52,
  top = 12,
  pitch = 46;
const shortLabel = (period: string) =>
  period.length === 10
    ? `${period.slice(8)}/${period.slice(5, 7)}`
    : `${period.slice(5, 7)}/${period.slice(2, 4)}`;
const periodLabel = (row: ChartPeriod) =>
  row.period === row.endPeriod ? row.period : `${row.period} – ${row.endPeriod}`;
const compact = (minor: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(minor / 100);
function Legend({ label, color }: { label: string; color: string }) {
  const c = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 8, height: 8, borderRadius: 3, backgroundColor: color }} />
      <Text style={{ color: c.muted, fontSize: 12 }}>{label}</Text>
    </View>
  );
}
function DataTable({ rows }: { rows: { label: string; detail: string; onPress?: () => void }[] }) {
  const [show, setShow] = useState(false);
  return (
    <>
      <Button
        secondary
        title={show ? 'Hide data table' : 'View exact values'}
        onPress={() => setShow(!show)}
      />
      {show &&
        rows.map((row, index) => (
          <MotionPressable
            accessibilityRole={row.onPress ? 'button' : 'text'}
            onPress={row.onPress}
            key={`${row.label}-${index}`}
            style={{ paddingVertical: 8 }}>
            <Label small>
              {row.label} · {row.detail}
            </Label>
          </MotionPressable>
        ))}
    </>
  );
}
function usePlot(periods: PeriodTotal[]) {
  const { width } = useWindowDimensions();
  const rows = useMemo(() => chartPeriods(periods), [periods]);
  const available = Math.max(180, Math.min(640, width - 84));
  const chartWidth = Math.max(available, left + rows.length * pitch + 16);
  const step = (chartWidth - left - 24) / Math.max(1, rows.length);
  const x = (index: number) => left + step * index + step / 2;
  return { rows, chartWidth, x };
}
function Grid({ domain, width }: { domain: ReturnType<typeof chartDomain>; width: number }) {
  const c = useTheme();
  return (
    <>
      {Array.from({ length: 5 }, (_, index) => {
        const value = domain.max - ((domain.max - domain.min) * index) / 4;
        const y = top + domain.y(value);
        return (
          <G key={index}>
            <Line x1={left} x2={width - 8} y1={y} y2={y} stroke={c.border} strokeDasharray="3 6" />
            <SvgText x={left - 8} y={y + 4} textAnchor="end" fill={c.muted} fontSize={10}>
              {compact(value)}
            </SvgText>
          </G>
        );
      })}
      <Line
        x1={left}
        x2={width - 8}
        y1={top + domain.zero}
        y2={top + domain.zero}
        stroke={c.muted}
        opacity={0.45}
        strokeWidth={1}
      />
    </>
  );
}
export function IncomeExpenseChart({ periods }: { periods: PeriodTotal[] }) {
  const chartColors = useChartColors();
  const c = useTheme(),
    id = useId().replace(/:/g, '');
  const plot = usePlot(periods),
    [selected, setSelected] = useState<string | null>(null);
  const selection = plot.rows.find((row) => row.period === selected);
  const domain = chartDomain(
    plot.rows.flatMap((row) => [row.income, row.expense]),
    plotHeight
  );
  const net = periods.reduce((sum, row) => sum + row.income - row.expense, 0);
  if (!periods.some((row) => row.income || row.expense))
    return (
      <Empty animate={false} title="Cash flow" detail="No income or spending in this period." />
    );
  return (
    <ChartSurface
      title="Cash flow"
      subtitle="Income and net spending, side by side"
      amount={net}
      badge="NET FLOW">
      <View style={{ flexDirection: 'row', gap: 16 }}>
        <Legend label="Income" color={chartColors[0]} />
        <Legend label="Spending" color={chartColors[2]} />
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginHorizontal: -4 }}>
        <Svg width={plot.chartWidth} height={222}>
          <Defs>
            <LinearGradient id={`${id}income`} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={chartColors[0]} />
              <Stop offset="1" stopColor={chartColors[4]} />
            </LinearGradient>
            <LinearGradient id={`${id}expense`} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={chartColors[2]} />
              <Stop offset="1" stopColor={chartColors[2]} stopOpacity={0.65} />
            </LinearGradient>
          </Defs>
          <Grid domain={domain} width={plot.chartWidth} />
          {plot.rows.map((row, index) => (
            <BarPeriod
              key={row.period}
              row={row}
              x={plot.x(index)}
              domain={domain}
              selected={selected === row.period}
              incomeFill={`url(#${id}income)`}
              expenseFill={`url(#${id}expense)`}
              color={c.muted}
              onSelect={() => setSelected(row.period)}
            />
          ))}
        </Svg>
      </ScrollView>
      <View style={{ minHeight: 52, gap: 4 }}>
        <Text style={{ color: c.text, fontSize: 13, fontWeight: '600' }}>
          {selection ? periodLabel(selection) : 'Tap a bar to inspect a period'}
        </Text>
        <Text style={{ color: c.muted, fontSize: 12 }}>
          {selection
            ? `Income ${money(selection.income)} · Spent ${money(selection.expense)}`
            : 'Swipe for more dates. Refunds appear below zero.'}
        </Text>
      </View>
      {plot.rows.length < periods.length && (
        <Label small>Adjacent periods are grouped; every amount is included.</Label>
      )}
      <DataTable
        rows={periods.map((row) => ({
          label: row.period,
          detail: `Income ${money(row.income)} · Spent ${money(row.expense)}`,
        }))}
      />
    </ChartSurface>
  );
}
function BarPeriod({
  row,
  x,
  domain,
  selected,
  incomeFill,
  expenseFill,
  color,
  onSelect,
}: {
  row: ChartPeriod;
  x: number;
  domain: ReturnType<typeof chartDomain>;
  selected: boolean;
  incomeFill: string;
  expenseFill: string;
  color: string;
  onSelect: () => void;
}) {
  const c = useTheme();
  return (
    <>
      <Rect
        x={x - 20}
        y={top}
        width={40}
        height={plotHeight + 8}
        fill={selected ? c.accent : 'transparent'}
        opacity={selected ? 0.08 : 1}
        rx={8}
      />
      <AnimatedColumn
        x={x - 14}
        width={12}
        y={top + domain.y(row.income)}
        zero={top + domain.zero}
        fill={incomeFill}
      />
      <AnimatedColumn
        x={x + 3}
        width={12}
        y={top + domain.y(row.expense)}
        zero={top + domain.zero}
        fill={expenseFill}
      />
      <SvgText x={x} y={plotHeight + 36} textAnchor="middle" fill={color} fontSize={10}>
        {shortLabel(row.period)}
      </SvgText>
      <Rect x={x - 22} y={0} width={44} height={222} fill="transparent" onPress={onSelect} />
    </>
  );
}
export function ExpenseBreakdownChart({
  categories,
  title = 'Spending mix',
  onSelect,
}: {
  categories: CategoryTotal[];
  title?: string;
  onSelect?: (id: number) => void;
}) {
  const chartColors = useChartColors();
  const referenceCategories = useFinance((state) => state.categories);
  const c = useTheme(),
    [selected, setSelected] = useState<string | null>(null);
  const segments = useMemo(
    () => categoryRingSegments(categories, chartColors),
    [categories, chartColors]
  );
  const total = categories.reduce((sum, row) => sum + row.amount, 0),
    signed = categories.some((row) => row.amount < 0);
  const selectedCategory = categories.find((row) => String(row.id) === selected),
    chosen = segments.find((row) => row.key === selected);
  const scale = Math.max(1, ...categories.map((row) => Math.abs(row.amount)));
  const select = (key: string) => {
    setSelected(key);
    const row = categories.find((row) => String(row.id) === key);
    if (row) onSelect?.(row.id);
  };
  if (!categories.some((row) => row.amount))
    return (
      <Empty animate={false} title={title} detail="No matching category activity in this range." />
    );
  return (
    <ChartSurface
      title={title}
      subtitle={signed ? 'Net amounts include refund credits' : 'Net spending by category'}
      badge={signed ? 'NET SPENDING' : `${categories.length} CATEGORIES`}>
      {!signed ? (
        <ThreeRingChart
          segments={segments}
          selected={selected}
          onSelect={select}
          center={
            <>
              <Text numberOfLines={2} style={{ color: c.muted, textAlign: 'center', fontSize: 11 }}>
                {selectedCategory?.name ?? chosen?.label ?? 'TOTAL'}
              </Text>
              <AnimatedAmount
                amount={selectedCategory?.amount ?? chosen?.value ?? total}
                size={21}
              />
            </>
          }
        />
      ) : (
        <AnimatedAmount amount={total} size={30} />
      )}
      {categories.map((row, index) => {
        const color =
          segments.find((segment) => segment.key === String(row.id))?.color ??
          segments.find((segment) => segment.key === 'other')?.color ??
          chartColors[index % chartColors.length];
        return (
          <MotionPressable
            key={row.id}
            accessibilityRole="button"
            accessibilityState={{ selected: selected === String(row.id) }}
            accessibilityLabel={`${row.name}, ${money(row.amount)}`}
            onPress={() => select(String(row.id))}
            style={{
              gap: 7,
              paddingVertical: 10,
              paddingHorizontal: 10,
              borderRadius: 14,
              backgroundColor: selected === String(row.id) ? c.soft : 'transparent',
            }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <CategoryIcon
                name={row.name}
                icon={referenceCategories.find((category) => category.id === row.id)?.icon}
                color={color}
                size={19}
              />
              <Text style={{ color: c.text, fontSize: 13, fontWeight: '600', flex: 1 }}>
                {row.name}
              </Text>
              <Text
                style={{
                  color: row.amount < 0 ? c.positive : c.text,
                  fontSize: 13,
                  fontWeight: '600',
                  fontVariant: ['tabular-nums'],
                }}>
                {money(row.amount)}
              </Text>
            </View>
            <AnimatedTrack
              fraction={signed ? Math.abs(row.amount) / scale : row.amount / Math.max(1, total)}
              color={row.amount < 0 ? c.positive : color}
              height={5}
            />
            <Text style={{ color: c.muted, fontSize: 11 }}>
              {signed
                ? row.amount < 0
                  ? 'Net refund credit'
                  : 'Net spending'
                : `${((row.amount / total) * 100).toFixed(1)}% of total`}
            </Text>
          </MotionPressable>
        );
      })}
      {signed && (
        <Label small>
          Refund credits retain their sign. A percentage ring is unavailable for negative net
          spending.
        </Label>
      )}
    </ChartSurface>
  );
}
export function SpendingTrendChart({
  periods,
  title = 'Spending trend',
  expensesOnly = false,
}: {
  periods: PeriodTotal[];
  title?: string;
  expensesOnly?: boolean;
}) {
  const chartColors = useChartColors();
  const c = useTheme(),
    id = useId().replace(/:/g, '');
  const plot = usePlot(periods),
    [selected, setSelected] = useState<string | null>(null);
  const selection = plot.rows.find((row) => row.period === selected);
  const domain = chartDomain(
    plot.rows.flatMap((row) => (expensesOnly ? [row.expense] : [row.expense, row.income])),
    plotHeight
  );
  const points = plot.rows.map((row, index) => ({
    x: plot.x(index),
    y: top + domain.y(row.expense),
  }));
  const incomePoints = plot.rows.map((row, index) => ({
    x: plot.x(index),
    y: top + domain.y(row.income),
  }));
  const path = curvePath(points),
    incomePath = curvePath(incomePoints);
  const area = points.length
    ? `${path} L ${points[points.length - 1].x} ${top + domain.zero} L ${points[0].x} ${top + domain.zero} Z`
    : '';
  const pathLength = (values: typeof points) =>
    values.reduce(
      (sum, point, index) =>
        index
          ? sum + Math.abs(point.x - values[index - 1].x) + Math.abs(point.y - values[index - 1].y)
          : sum,
      1
    );
  const length = pathLength(points);
  if (!periods.some((row) => row.expense || (!expensesOnly && row.income)))
    return <Empty animate={false} title={title} detail="No activity to plot for this period." />;
  return (
    <ChartSurface title={title} subtitle="Income and net spending over time" badge="TREND">
      <View style={{ flexDirection: 'row', gap: 16 }}>
        <Legend label="Spending" color={chartColors[1]} />
        {!expensesOnly && <Legend label="Income" color={chartColors[0]} />}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <Svg width={plot.chartWidth} height={222}>
          <Defs>
            <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={chartColors[1]} stopOpacity={1} />
              <Stop offset="1" stopColor={chartColors[1]} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Grid domain={domain} width={plot.chartWidth} />
          <AnimatedLine
            path={path}
            color={chartColors[1]}
            length={length}
            area={area}
            gradient={`url(#${id})`}
          />
          {!expensesOnly && (
            <AnimatedLine
              path={incomePath}
              color={chartColors[0]}
              length={pathLength(incomePoints)}
            />
          )}
          {plot.rows.map((row, index) => (
            <PlotPoint
              key={row.period}
              row={row}
              x={plot.x(index)}
              y={points[index].y}
              selected={selected === row.period}
              color={c.muted}
              onSelect={() => setSelected(row.period)}
            />
          ))}
        </Svg>
      </ScrollView>
      <View style={{ minHeight: 52, gap: 4 }}>
        <Text style={{ color: c.text, fontWeight: '600', fontSize: 13 }}>
          {selection ? periodLabel(selection) : 'Tap a point to explore'}
        </Text>
        <Text style={{ color: c.muted, fontSize: 12 }}>
          {selection
            ? `Spent ${money(selection.expense)}${expensesOnly ? '' : ` · Income ${money(selection.income)}`}`
            : 'Exact signed amounts, including refunds.'}
        </Text>
      </View>
      <DataTable
        rows={periods.map((row) => ({
          label: row.period,
          detail: `Expenses ${money(row.expense)}${expensesOnly ? '' : ` · Income ${money(row.income)}`}`,
        }))}
      />
    </ChartSurface>
  );
}
function PlotPoint({
  row,
  x,
  y,
  selected,
  color,
  onSelect,
}: {
  row: ChartPeriod;
  x: number;
  y: number;
  selected: boolean;
  color: string;
  onSelect: () => void;
}) {
  const chartColors = useChartColors(),
    c = useTheme();
  return (
    <>
      {selected && (
        <Line
          x1={x}
          x2={x}
          y1={top}
          y2={top + plotHeight}
          stroke={chartColors[1]}
          strokeDasharray="3 4"
          opacity={0.4}
        />
      )}
      <Circle
        cx={x}
        cy={y}
        r={selected ? 6 : 3.5}
        fill={chartColors[1]}
        stroke={c.card}
        strokeWidth={2}
      />
      <SvgText x={x} y={plotHeight + 36} textAnchor="middle" fill={color} fontSize={10}>
        {shortLabel(row.period)}
      </SvgText>
      <Rect x={x - 22} y={0} width={44} height={222} fill="transparent" onPress={onSelect} />
    </>
  );
}
export function BudgetComparisonChart({ rows }: { rows: BudgetComparison[]; animate?: boolean }) {
  const chartColors = useChartColors();
  const c = useTheme(),
    [selectedKey, setSelectedKey] = useState<string | null>(null);
  const maximum = Math.max(1, ...rows.flatMap((row) => [row.allocated, Math.abs(row.spent)]));
  if (!rows.length)
    return (
      <Empty
        animate={false}
        title="Budget vs actual"
        detail="Category comparisons will appear after you allocate a budget."
      />
    );
  return (
    <ChartSurface
      title="Plan vs actual"
      subtitle="Your category limits and net spending"
      badge={`${rows.length} ALLOCATIONS`}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
        <Legend label="Allocated" color={chartColors[0]} />
        <Legend label="Spent" color={chartColors[2]} />
        <Legend label="Over limit" color={c.negative} />
      </View>
      {rows.map((row) => {
        const key = `${row.budget_id}-${row.category_id}`,
          over = row.spent > row.allocated;
        return (
          <MotionPressable
            key={key}
            accessibilityRole="button"
            accessibilityState={{ selected: selectedKey === key }}
            accessibilityLabel={`${row.month}, ${row.name}, limit ${money(row.allocated)}, spent ${money(row.spent)}`}
            onPress={() => setSelectedKey(key)}
            style={{
              gap: 9,
              padding: 12,
              borderRadius: 15,
              backgroundColor: selectedKey === key ? c.soft : c.card,
            }}>
            <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={{ color: c.text, fontWeight: '600', fontSize: 14 }}>{row.name}</Text>
                <Text style={{ color: c.muted, fontSize: 11 }}>{row.month}</Text>
              </View>
              <Text
                style={{
                  color: over ? c.negative : c.text,
                  fontWeight: '700',
                  fontVariant: ['tabular-nums'],
                }}>
                {money(row.spent)}
              </Text>
            </View>
            <AnimatedTrack fraction={row.allocated / maximum} color={chartColors[0]} height={6} />
            <AnimatedTrack
              fraction={Math.abs(row.spent) / maximum}
              color={row.spent < 0 ? c.positive : over ? c.negative : chartColors[2]}
              height={6}
            />
            <Text style={{ color: c.muted, fontSize: 11 }}>
              Limit {money(row.allocated)} ·{' '}
              {row.spent < 0
                ? 'Net refund credit'
                : over
                  ? `${money(row.spent - row.allocated)} over`
                  : `${money(row.allocated - row.spent)} remaining`}
            </Text>
          </MotionPressable>
        );
      })}
    </ChartSurface>
  );
}
