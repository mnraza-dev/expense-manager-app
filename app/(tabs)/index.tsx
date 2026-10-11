import { LinearGradient } from 'expo-linear-gradient';
import { Reveal } from '../../src/components/Motion';
import { ChartNoAxesColumn, Settings } from 'lucide-react-native';
import { Text, View, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { useFinance } from '../../src/store/useFinance';
import { balance, localDate, money, summary } from '../../src/utils/finance';
import {
  AmountText,
  Button,
  Empty,
  Label,
  Screen,
  styles,
  useTheme,
} from '../../src/components/ui';
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
  const loadBudget = useCallback(() => repo().budgetProgress(month), [month]);
  const budget = useDatabaseQuery(loadBudget);
  return (
    <Screen
      title="Overview"
      subtitle={new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
      headerActions={
        <View style={{ flexDirection: 'row' }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Reports"
            onPress={() => router.push('/(tabs)/reports')}
            style={styles.touch}>
            <ChartNoAxesColumn size={20} color={c.muted} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Settings"
            onPress={() => router.push('/(tabs)/settings')}
            style={styles.touch}>
            <Settings size={20} color={c.muted} />
          </Pressable>
        </View>
      }>
      <Reveal delay={40}>
        <LinearGradient
          colors={[c.hero, c.heroEnd]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ padding: 24, borderRadius: 24, gap: 12 }}>
          <Text style={{ color: c.heroMuted, fontSize: 13 }}>TOTAL BALANCE · ACTIVE ASSETS</Text>
          <Text
            style={{
              color: c.onHero,
              fontSize: 36,
              fontWeight: '600',
              fontVariant: ['tabular-nums'],
            }}>
            {money(active.reduce((s, a) => s + balance(a, transactions), 0))}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/(tabs)/accounts')}
            style={{ minHeight: 44, justifyContent: 'center' }}>
            <Text style={{ color: c.heroMuted }}>Across your accounts →</Text>
          </Pressable>
        </LinearGradient>
      </Reveal>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Label small>Income</Label>
          <AmountText>{money(totals.income)}</AmountText>
        </View>
        <View style={{ flex: 1 }}>
          <Label small>Spent this month</Label>
          <AmountText>{money(totals.expense)}</AmountText>
        </View>
      </View>
      <Button title="Add transaction" onPress={() => router.push('/transaction/add')} />
      {!active.length && (
        <>
          <Empty
            title="Start with an account"
            detail="Add cash, a bank account or a wallet with its opening balance."
          />
          <Button secondary title="Add account" onPress={() => router.push('/account/add')} />
        </>
      )}
      {budget.data?.budget && (
        <Pressable accessibilityRole="button" onPress={() => router.push('/(tabs)/budgets')}>
          <BudgetProgressCard
            name={budget.data.budget.name}
            limit={budget.data.budget.total_limit_minor}
            spent={budget.data.spent}
          />
        </Pressable>
      )}
      <View style={styles.row}>
        <Label>Recent activity</Label>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/(tabs)/transactions')}
          style={{ minHeight: 48, justifyContent: 'center' }}>
          <Label small>View all</Label>
        </Pressable>
      </View>
      {transactions.slice(0, 5).map((t, index) => (
        <Reveal key={t.id} delay={Math.min(index * 35, 140)}>
          <TransactionItem item={t} />
        </Reveal>
      ))}
      {!transactions.length && (
        <Empty
          title="No transactions yet"
          detail="Record your first expense or income using Add transaction."
        />
      )}
    </Screen>
  );
}
