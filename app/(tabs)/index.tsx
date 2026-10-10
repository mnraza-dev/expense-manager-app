import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useFinance } from '../../src/store/useFinance';
import { balance, localDate, money, summary } from '../../src/utils/finance';
import { Button, Card, Empty, Label, Screen, styles, useTheme } from '../../src/components/ui';
import { TransactionItem } from '../../src/components/TransactionItem';
import { Breakdown } from '../../src/features/Breakdown';
export default function Home() {
  const router = useRouter();
  const c = useTheme();
  const { accounts, transactions } = useFinance();
  const [date, setDate] = useState(() => new Date());
  const month = localDate(date).slice(0, 7);
  const totals = summary(transactions, month);
  const active = accounts.filter((a) => !a.archived);
  const move = (n: number) => setDate(new Date(date.getFullYear(), date.getMonth() + n, 1));
  return (
    <Screen
      title="Pocketbook"
      subtitle="A little clarity. Every day."
      action={() => router.push('/transaction/add')}>
      <View style={styles.row}>
        <Pressable
          accessibilityLabel="Previous month"
          onPress={() => move(-1)}
          style={styles.touch}>
          <ChevronLeft color={c.text} />
        </Pressable>
        <Text style={{ color: c.text, fontWeight: '600' }}>
          {date.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
        </Text>
        <Pressable accessibilityLabel="Next month" onPress={() => move(1)} style={styles.touch}>
          <ChevronRight color={c.text} />
        </Pressable>
      </View>
      <View style={{ backgroundColor: '#173F3B', borderRadius: 26, padding: 24, gap: 12 }}>
        <Text style={{ color: '#B9D8CF', fontSize: 13 }}>TOTAL BALANCE · ACTIVE ACCOUNTS</Text>
        <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 34 }}>
          {money(active.reduce((s, a) => s + balance(a, transactions), 0))}
        </Text>
        <Text style={{ color: '#B9D8CF' }}>Your balances, all in one place</Text>
      </View>
      <View style={[styles.row, { alignItems: 'stretch' }]}>
        <View style={{ flex: 1 }}>
          <Card>
            <Label small>↙ Income</Label>
            <Label>{money(totals.income)}</Label>
          </Card>
        </View>
        <View style={{ flex: 1 }}>
          <Card>
            <Label small>↗ Expenses</Label>
            <Label>{money(totals.expense)}</Label>
          </Card>
        </View>
      </View>
      <View style={styles.row}>
        <Label small>Net cash flow {money(totals.net)}</Label>
        <Label small>{totals.count} transactions</Label>
      </View>
      <View style={styles.wrap}>
        {(['expense', 'income', 'transfer'] as const).map((type) => (
          <View key={type} style={{ flex: 1 }}>
            <Button
              secondary
              title={
                type === 'transfer' ? '↔ Transfer' : type === 'income' ? '+ Income' : '− Expense'
              }
              onPress={() => router.push({ pathname: '/transaction/add', params: { type } })}
            />
          </View>
        ))}
      </View>
      {!active.length && (
        <>
          <Empty
            title="Start with an account"
            detail="Add your cash, bank or wallet and its opening balance. Your financial story starts here."
          />
          <Button title="Create your first account" onPress={() => router.push('/account/add')} />
        </>
      )}
      <Label>Recent activity</Label>
      <Card>
        {totals.rows.length ? (
          totals.rows.slice(0, 5).map((t) => <TransactionItem key={t.id} item={t} />)
        ) : (
          <Label small>No transactions this month. Add your first income or expense.</Label>
        )}
      </Card>
      {active.length > 0 && (
        <>
          <Label>Your accounts</Label>
          <Card>
            {active.map((a) => (
              <Pressable
                key={a.id}
                onPress={() => router.push({ pathname: '/account/[id]', params: { id: a.id } })}
                style={[styles.row, { paddingVertical: 10 }]}>
                <View>
                  <Label>{a.name}</Label>
                  <Label small>{a.type}</Label>
                </View>
                <Label>{money(balance(a, transactions), a.currency)}</Label>
              </Pressable>
            ))}
          </Card>
        </>
      )}
      <Breakdown rows={totals.rows} />
    </Screen>
  );
}
