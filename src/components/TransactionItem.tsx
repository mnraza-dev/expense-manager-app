import { Pressable, Text, View } from 'react-native';
import { ArrowDownLeft, ArrowUpRight, ArrowRightLeft } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import type { Transaction } from '../types';
import { useFinance } from '../store/useFinance';
import { money } from '../utils/finance';
import { styles, useTheme } from './ui';
export function TransactionItem({ item }: { item: Transaction }) {
  const c = useTheme();
  const router = useRouter();
  const { accounts, categories } = useFinance();
  const icon =
    item.type === 'income'
      ? ArrowDownLeft
      : item.type === 'expense'
        ? ArrowUpRight
        : ArrowRightLeft;
  const Icon = icon;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/transaction/[id]', params: { id: item.id } })}
      style={[styles.row, { paddingVertical: 15, borderBottomWidth: 1, borderColor: c.border }]}>
      <View style={{ backgroundColor: c.bg, padding: 12, borderRadius: 14 }}>
        <Icon
          color={item.type === 'income' ? c.accent : item.type === 'expense' ? '#CE7651' : c.muted}
          size={20}
        />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: c.text, fontWeight: '600', fontSize: 15 }}>{item.description}</Text>
        <Text style={{ color: c.muted, fontSize: 12, marginTop: 5 }}>
          {categories.find((x) => x.id === item.category_id)?.name ?? 'Transfer'} ·{' '}
          {accounts.find((x) => x.id === item.account_id)?.name}
          {item.destination_account_id
            ? ` → ${accounts.find((x) => x.id === item.destination_account_id)?.name}`
            : ''}
        </Text>
        <Text style={{ color: c.muted, fontSize: 12, marginTop: 3 }}>{item.date}</Text>
      </View>
      <Text style={{ color: c.text, fontWeight: '700' }}>
        {item.type === 'income' ? '+' : item.type === 'expense' ? '−' : '↔'}
        {money(item.amount)}
      </Text>
    </Pressable>
  );
}
