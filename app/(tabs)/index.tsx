import { LinearGradient } from 'expo-linear-gradient';
import { Reveal, MotionPressable } from '../../src/components/Motion';
import { DepthSurface, FinanceArt } from '../../src/components/Depth';
import {
  ArrowDownLeft,
  ArrowUpRight,
  ChartNoAxesColumn,
  ChevronRight,
  Plus,
  Settings,
} from 'lucide-react-native';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { useFinance } from '../../src/store/useFinance';
import { balance, localDate, money, summary } from '../../src/utils/finance';
import { Button, Screen, useTheme } from '../../src/components/ui';
import { TransactionItem } from '../../src/components/TransactionItem';
import { BudgetProgressCard } from '../../src/components/BudgetProgressCard';
import { useDatabaseQuery } from '../../src/hooks/useDatabaseQuery';
import { repo } from '../../src/db/database';

export default function Home() {
  const router = useRouter();
  const c = useTheme();
  const { accounts, transactions } = useFinance();
  const [month] = useState(() => localDate().slice(0, 7));
  const totals = summary(transactions, month);
  const active = accounts.filter((a) => !a.archived && a.kind !== 'liability');
  const hasAccount = accounts.some((account) => !account.archived);
  const recent = transactions.slice(0, 5);
  const loadBudget = useCallback(() => repo().budgetProgress(month), [month]);
  const budget = useDatabaseQuery(loadBudget);
  return (
    <Screen
      title="Overview"
      subtitle={new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
      headerActions={
        <View style={home.actions}>
          {(
            [
              { label: 'Reports', Icon: ChartNoAxesColumn, route: '/(tabs)/reports' },
              { label: 'Settings', Icon: Settings, route: '/(tabs)/settings' },
            ] as const
          ).map(({ label, Icon, route }) => (
            <MotionPressable
              depth
              key={label}
              accessibilityRole="button"
              accessibilityLabel={label}
              onPress={() => router.push(route)}
              style={[home.iconButton, { backgroundColor: c.card, borderColor: c.border }]}>
              <Icon size={20} color={c.text} />
            </MotionPressable>
          ))}
        </View>
      }>
           <View style={home.balanceSpacer} />
      <View>
        <Reveal delay={40}>
          <DepthSurface
            radius={24}
            depth={6}
            edgeColor={c.hero}
            faceStyle={{ backgroundColor: c.hero }}>
            <LinearGradient
              colors={[c.hero, c.heroEnd]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={home.balanceCard}>
              <View style={home.balanceHeading}>
                <Text style={{ color: c.heroMuted, fontSize: 13, fontWeight: '500', flex: 1 }}>
                  Total asset balance
                </Text>
                <FinanceArt kind="wallet" colors={c} size={62} animated />
              </View>
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.5}
                style={[home.balanceAmount, { color: c.onHero }]}>
                {money(active.reduce((sum, account) => sum + balance(account, transactions), 0))}
              </Text>
              <MotionPressable
                accessibilityRole="button"
                accessibilityLabel="View your accounts"
                onPress={() => router.push('/(tabs)/accounts')}
                style={[home.balanceFooter, { borderColor: 'rgba(255,255,255,0.16)' }]}>
                <Text style={{ color: c.heroMuted, fontSize: 13, flex: 1 }}>
                  {active.length} active asset {active.length === 1 ? 'account' : 'accounts'}
                </Text>
                <ChevronRight size={18} color={c.heroMuted} />
              </MotionPressable>
            </LinearGradient>
          </DepthSurface>
        </Reveal>
        <View style={home.balanceSpacer} />
        <View style={home.stats}>
          {(
            [
              {
                label: 'Income this month',
                amount: totals.income,
                Icon: ArrowDownLeft,
                art: 'coins',
                color: c.positive,
              },
              {
                label: 'Spent this month',
                amount: totals.expense,
                Icon: ArrowUpRight,
                art: 'receipt',
                color: c.negative,
              },
            ] as const
          ).map(({ label, amount, Icon, color, art }) => (
            <Reveal key={label} delay={80} style={{ flex: 1, minWidth: 0 }}>
              <DepthSurface
                radius={18}
                edgeColor={c.border}
                faceStyle={[home.statCard, { backgroundColor: c.card }]}>
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}>
                  <FinanceArt kind={art} colors={c} size={42} />
                  <Icon size={18} color={color} />
                </View>
                <Text style={{ color: c.muted, fontSize: 12 }}>{label}</Text>
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.6}
                  style={[home.statAmount, { color: c.text }]}>
                  {money(amount)}
                </Text>
              </DepthSurface>
            </Reveal>
          ))}
        </View>
      </View>
      <View style={home.addButtonSection}>
        <MotionPressable
          depth
          accessibilityRole="button"
          accessibilityLabel={hasAccount ? 'Add transaction' : 'Add account'}
          onPress={() => router.push(hasAccount ? '/transaction/add' : '/account/add')}
          style={[
            home.addButton,
            { backgroundColor: c.accent, borderBottomColor: c.hero, borderBottomWidth: 4 },
          ]}>
          <Plus size={20} color={c.onAccent} />
          <Text style={{ color: c.onAccent, fontSize: 15, fontWeight: '600' }}>
            {hasAccount ? 'Add transaction' : 'Add account'}
          </Text>
        </MotionPressable>
      </View>
      {!hasAccount && (
        <View style={[home.setupCard, { backgroundColor: c.soft }]}>
          <Text style={{ color: c.text, fontSize: 15, fontWeight: '600' }}>
            Start with your first account
          </Text>
          <Text style={{ color: c.muted, fontSize: 13, lineHeight: 20 }}>
            Add cash, a bank account or a wallet with its opening balance to start tracking.
          </Text>
        </View>
      )}
      {budget.loading ? (
        <ActivityIndicator accessibilityLabel="Loading budget" color={c.accent} />
      ) : budget.error ? (
        <View style={[home.setupCard, { backgroundColor: c.card }]}>
          <Text style={{ color: c.negative }}>{budget.error}</Text>
          <Button secondary title="Retry budget" onPress={budget.retry} />
        </View>
      ) : budget.data?.budget ? (
        <MotionPressable
          accessibilityRole="button"
          accessibilityLabel="View monthly budget"
          onPress={() => router.push('/(tabs)/budgets')}>
          <BudgetProgressCard
            art
            name={budget.data.budget.name}
            limit={budget.data.budget.total_limit_minor}
            spent={budget.data.spent}
          />
        </MotionPressable>
      ) : null}
      <View style={home.sectionHeading}>
        <Text
          accessibilityRole="header"
          style={{ color: c.text, fontSize: 17, fontWeight: '600', flex: 1 }}>
          Recent activity
        </Text>
        <MotionPressable
          accessibilityRole="button"
          accessibilityLabel="View all transactions"
          onPress={() => router.push('/(tabs)/transactions')}
          style={home.viewAll}>
          <Text style={{ color: c.accent, fontSize: 13, fontWeight: '600' }}>View all</Text>
          <ChevronRight size={16} color={c.accent} />
        </MotionPressable>
      </View>
      <DepthSurface
        edgeColor={c.border}
        faceStyle={[home.activityCard, { backgroundColor: c.card }]}>
        {recent.length ? (
          recent.map((transaction, index) => (
            <Reveal key={transaction.id} delay={Math.min(index * 35, 140)}>
              <TransactionItem item={transaction} divider={index < recent.length - 1} />
            </Reveal>
          ))
        ) : (
          <View style={home.emptyActivity}>
            <FinanceArt kind="receipt" colors={c} size={88} />
            <Text style={{ color: c.text, fontSize: 15, fontWeight: '600' }}>No activity yet</Text>
            <Text style={{ color: c.muted, fontSize: 13, lineHeight: 20, textAlign: 'center' }}>
              {hasAccount
                ? 'Your first transaction will appear here.'
                : 'Add an account, then record your first transaction.'}
            </Text>
          </View>
        )}
      </DepthSurface>
    </Screen>
  );
}

const home = StyleSheet.create({
  actions: { flexDirection: 'row', gap: 8, },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    borderWidth: 1,
  },
  balanceCard: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 8,
    borderRadius: 24,
    // marginTop: 4,
    gap: 12,
  },
  balanceHeading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  balanceAmount: {
    fontSize: 36,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    paddingBottom: 4,
  },
  balanceFooter: {
    minHeight: 48,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderTopWidth: 1,
  },
  stats: { flexDirection: 'row', gap: 12 },
  balanceSpacer: { height: 24 },
  statCard: { minWidth: 0, padding: 16, borderRadius: 18, gap: 8 },
  statAmount: { fontSize: 22, fontWeight: '600', fontVariant: ['tabular-nums'] },
  addButtonSection: { paddingTop: 24 },
  addButton: {
    minHeight: 54,
    padding: 16,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  setupCard: { padding: 16, borderRadius: 18, gap: 6 },
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 4,
    marginBottom: 0,
  },
  viewAll: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 4 },
  activityCard: { borderRadius: 20, paddingHorizontal: 16, paddingVertical: 4 },
  emptyActivity: { alignItems: 'center', paddingHorizontal: 8, paddingVertical: 24, gap: 10 },
});
