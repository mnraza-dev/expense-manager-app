import { memo } from 'react';
import { MotionPressable } from './Motion';
import { DepthIcon } from './Depth';
import { Text, View } from 'react-native';
import { CategoryIcon } from './CategoryIcon';
import { useRouter } from 'expo-router';
import type { Transaction } from '../types';
import { useFinance } from '../store/useFinance';
import { money } from '../utils/finance';
import { styles, useTheme } from './ui';
export const TransactionItem = memo(function TransactionItem({
  item,
  divider = true,
}: {
  item: Transaction;
  divider?: boolean;
}) {
  const c = useTheme();
  const router = useRouter();
  const categoryName = useFinance((s) => s.categories.find((x) => x.id === item.category_id)?.name);
  const accountName = useFinance((s) => s.accounts.find((x) => x.id === item.account_id)?.name);
  const destinationName = useFinance(
    (s) => s.accounts.find((x) => x.id === item.destination_account_id)?.name
  );
  return (
    <MotionPressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/transaction/[id]', params: { id: item.id } })}
      style={[
        styles.row,
        { paddingVertical: 12, borderBottomWidth: divider ? 1 : 0, borderColor: c.border },
      ]}>
      <DepthIcon colors={c}>
        <CategoryIcon name={categoryName ?? ''} transfer={item.type === 'transfer'} />
      </DepthIcon>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={2} style={{ color: c.text, fontWeight: '600', fontSize: 15 }}>
          {item.description}
        </Text>
        <Text numberOfLines={2} style={{ color: c.muted, fontSize: 12, marginTop: 5 }}>
          {item.refund_of_id
            ? 'Refund'
            : item.split_count
              ? 'Split expense'
              : (categoryName ?? 'Transfer')}{' '}
          · {accountName}
          {item.destination_account_id ? ` → ${destinationName}` : ''}
        </Text>
        <Text style={{ color: c.muted, fontSize: 12, marginTop: 3 }}>
          {item.date}
          {item.receipt_count
            ? ` · ${item.receipt_count} receipt${item.receipt_count === 1 ? '' : 's'}`
            : ''}
        </Text>
      </View>
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
        style={{
          maxWidth: '40%',
          color: c.text,
          fontWeight: '600',
          fontVariant: ['tabular-nums'],
        }}>
        {item.type === 'income' || item.refund_of_id ? '+' : item.type === 'expense' ? '−' : '↔'}
        {money(item.amount)}
      </Text>
    </MotionPressable>
  );
});
