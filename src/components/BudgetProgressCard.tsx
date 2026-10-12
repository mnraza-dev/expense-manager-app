import Animated, { useAnimatedStyle, withTiming, ReduceMotion } from 'react-native-reanimated';
import { tokens } from '../design/tokens';
import { StyleSheet, Text, View } from 'react-native';
import { budgetStatus, DEFAULT_WARNING_PERCENT } from '../utils/budgets';
import { money } from '../utils/finance';
import { Card, useTheme } from './ui';
import { useFinance } from '../store/useFinance';
import { FinanceArt } from './Depth';
export function BudgetProgressBar({
  limit,
  spent,
  warning = DEFAULT_WARNING_PERCENT,
}: {
  limit: number;
  spent: number;
  warning?: number;
}) {
  const c = useTheme();
  const state = budgetStatus(limit, spent, warning);
  const color =
    state.status === 'exceeded' ? c.negative : state.status === 'warning' ? c.warning : c.accent;
  const motion = useAnimatedStyle(() => ({
    width: withTiming(`${state.bar}%`, {
      duration: tokens.motion.progress,
      reduceMotion: ReduceMotion.System,
    }),
  }));
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{
        min: 0,
        max: 100,
        now: Math.round(state.bar),
        text:
          state.status === 'unbudgeted'
            ? 'No budget configured'
            : `${state.percent.toFixed(1)}% used, ${state.status}`,
      }}
      style={{ height: 8, borderRadius: 6, backgroundColor: c.border, marginVertical: 10 }}>
      <Animated.View style={[{ height: 8, borderRadius: 6, backgroundColor: color }, motion]} />
    </View>
  );
}
export function BudgetProgressCard({
  name,
  limit,
  spent,
  art = false,
  period,
  animate = true,
}: {
  name: string;
  limit: number;
  spent: number;
  art?: boolean;
  period?: string;
  animate?: boolean;
}) {
  const configuredWarning = Number(
    useFinance((s) => s.settings.budget_warning_percent) ?? DEFAULT_WARNING_PERCENT
  );
  const warning =
    Number.isFinite(configuredWarning) && configuredWarning >= 1 && configuredWarning <= 100
      ? configuredWarning
      : DEFAULT_WARNING_PERCENT;
  const state = budgetStatus(limit, spent, warning);
  const c = useTheme();
  const statusColor =
    state.status === 'exceeded' ? c.negative : state.status === 'warning' ? c.warning : c.accent;
  const statusLabel =
    state.status === 'exceeded'
      ? 'Over budget'
      : state.status === 'warning'
        ? 'Near limit'
        : state.status === 'normal'
          ? 'On track'
          : 'No limit';
  return (
    <Card animate={animate}>
      <View style={cardStyles.header}>
        <View style={cardStyles.heading}>
          <Text style={[cardStyles.name, { color: c.text }]}>{name}</Text>
          <View style={[cardStyles.badge, { backgroundColor: c.soft }]}>
            <Text style={{ color: statusColor, fontSize: 12, fontWeight: '600' }}>
              {statusLabel}
            </Text>
          </View>
        </View>
        {art && <FinanceArt kind="chart" colors={c} size={56} />}
      </View>
      <Text style={{ color: c.muted, fontSize: 13, marginTop: 8 }}>
        {period ? `Spent in ${period}` : 'Spent this month'}
      </Text>
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.6}
        style={[cardStyles.amount, { color: c.text }]}>
        {money(spent)}
      </Text>
      <Text style={{ color: c.muted, fontSize: 13 }}>Monthly limit {money(limit)}</Text>
      <BudgetProgressBar limit={limit} spent={spent} warning={warning} />
      <View style={cardStyles.footer}>
        <Text style={{ color: c.muted, fontSize: 13 }}>
          {state.status === 'unbudgeted'
            ? 'No limit configured'
            : `${state.percent.toFixed(1)}% used`}
        </Text>
        <Text style={{ color: statusColor, fontSize: 13, fontWeight: '600', flexShrink: 1 }}>
          {state.status === 'unbudgeted'
            ? 'Set a limit to track progress'
            : state.excess > 0
              ? `${money(state.excess)} over budget`
              : `${money(state.remaining)} left`}
        </Text>
      </View>
    </Card>
  );
}

const cardStyles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  heading: { flex: 1, minWidth: 0, gap: 8 },
  name: { fontSize: 17, fontWeight: '600' },
  badge: { alignSelf: 'flex-start', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5 },
  amount: { fontSize: 30, fontWeight: '600', fontVariant: ['tabular-nums'] },
  footer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 },
});
