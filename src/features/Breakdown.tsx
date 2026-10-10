import { View } from 'react-native';
import { Card, Label, useTheme } from '../components/ui';
import { useFinance } from '../store/useFinance';
import type { Transaction } from '../types';
import { money } from '../utils/finance';
export function Breakdown({ rows }: { rows: Transaction[] }) {
  const categories = useFinance((s) => s.categories);
  const c = useTheme();
  const total = rows.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const data = categories
    .map((cat) => ({
      ...cat,
      amount: rows
        .filter((t) => t.type === 'expense' && t.category_id === cat.id)
        .reduce((s, t) => s + t.amount, 0),
    }))
    .filter((x) => x.amount > 0)
    .sort((a, b) => b.amount - a.amount);
  return (
    <Card>
      <Label>Where your money goes</Label>
      {!data.length && <Label small>Expenses will appear here when you add them.</Label>}
      {data.map((cat) => (
        <View key={cat.id} style={{ marginTop: 10 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Label small>{cat.name}</Label>
            <Label small>
              {money(cat.amount)} · {Math.round((cat.amount / total) * 100)}%
            </Label>
          </View>
          <View style={{ height: 7, backgroundColor: c.bg, borderRadius: 4, marginTop: 5 }}>
            <View
              style={{
                height: 7,
                borderRadius: 4,
                backgroundColor: cat.color,
                width: `${(cat.amount / total) * 100}%`,
              }}
            />
          </View>
        </View>
      ))}
    </Card>
  );
}
