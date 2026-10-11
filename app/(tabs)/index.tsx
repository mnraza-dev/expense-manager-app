import { View, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { useFinance } from '../../src/store/useFinance';
import { balance, localDate, money, summary } from '../../src/utils/finance';
import { AmountText, Button, Empty, Label, Screen, styles } from '../../src/components/ui';
import { TransactionItem } from '../../src/components/TransactionItem';
import { BudgetProgressCard } from '../../src/components/BudgetProgressCard';
import { useDatabaseQuery } from '../../src/hooks/useDatabaseQuery';
import { repo } from '../../src/db/database';
export default function Home() {
  const router = useRouter();
  const { accounts, transactions } = useFinance();
  const [month] = useState(() => localDate().slice(0, 7));
  const totals = summary(transactions, month);
  const active = accounts.filter((a) => !a.archived && a.kind !== 'liability');
  const loadBudget = useCallback(() => repo().budgetProgress(month), [month]);
  const budget = useDatabaseQuery(loadBudget);
  return (
    <Screen title="Pocketbook">
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/(tabs)/reports')}
          style={{ minHeight: 44, justifyContent: 'center' }}>
          <Label small>Reports</Label>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/(tabs)/settings')}
          style={{ minHeight: 44, justifyContent: 'center' }}>
          <Label small>Settings</Label>
        </Pressable>
      </View>
      <Label small>Available balance · active assets</Label>
      <AmountText large>
        {money(active.reduce((s, a) => s + balance(a, transactions), 0))}
      </AmountText>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push('/(tabs)/accounts')}
        style={{ minHeight: 44, justifyContent: 'center' }}>
        <Label small>View accounts</Label>
      </Pressable>
      <Label small>
        {new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
      </Label>
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
          style={styles.touch}>
          <Label small>All</Label>
        </Pressable>
      </View>
      {transactions.slice(0, 5).map((t) => (
        <TransactionItem key={t.id} item={t} />
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
