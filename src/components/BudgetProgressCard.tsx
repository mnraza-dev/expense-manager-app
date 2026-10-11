import Animated, { useAnimatedStyle, withTiming, ReduceMotion } from 'react-native-reanimated';
import { tokens } from '../design/tokens';
import { Text, View } from 'react-native';
import { budgetStatus, DEFAULT_WARNING_PERCENT } from '../utils/budgets';
import { money } from '../utils/finance';
import { Card, Label, styles, useTheme } from './ui';
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
      style={{ height: 4, borderRadius: 6, backgroundColor: c.border, marginVertical: 10 }}>
      <Animated.View style={[{ height: 4, borderRadius: 6, backgroundColor: color }, motion]} />
    </View>
  );
}
export function BudgetProgressCard({
  name,
  limit,
  spent,
  art = false,
}: {
  name: string;
  limit: number;
  spent: number;
  art?: boolean;
}) {
  const configuredWarning = Number(
    useFinance((s) => s.settings.budget_warning_percent) ?? DEFAULT_WARNING_PERCENT
  );
  const warning =
    configuredWarning >= 1 && configuredWarning <= 100
      ? configuredWarning
      : DEFAULT_WARNING_PERCENT;
  const state = budgetStatus(limit, spent, warning);
  const c = useTheme();
  return (
    <Card>
      <View style={styles.row}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Label>{name}</Label>
        </View>
        {art && <FinanceArt kind="chart" colors={c} size={56} />}
        <Text
          style={{ color: state.status === 'exceeded' ? c.negative : c.accent, fontWeight: '700' }}>
          {state.status === 'exceeded'
            ? 'Exceeded'
            : state.status === 'warning'
              ? 'Near limit'
              : state.status === 'normal'
                ? ''
                : 'Unbudgeted'}
        </Text>
      </View>
      <Label>
        {money(spent)} <Label small>of {money(limit)}</Label>
      </Label>
      <BudgetProgressBar limit={limit} spent={spent} warning={warning} />
      <View style={styles.row}>
        <Label small>
          {state.status === 'unbudgeted'
            ? 'No limit configured'
            : `${state.percent.toFixed(1)}% used`}
        </Label>
        <Label small>
          {state.excess > 0 ? `${money(state.excess)} over` : `${money(state.remaining)} remaining`}
        </Label>
      </View>
    </Card>
  );
}
