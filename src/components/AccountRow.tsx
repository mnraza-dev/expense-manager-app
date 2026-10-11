import { MotionPressable } from './Motion';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import type { Account } from '../types';
import { AmountText, Label, styles, useTheme } from './ui';
import { money } from '../utils/finance';
export function AccountRow({ account, balance }: { account: Account; balance: number }) {
  const router = useRouter();
  const c = useTheme();
  return (
    <MotionPressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/account/[id]', params: { id: account.id } })}
      style={[styles.row, { paddingVertical: 12, borderBottomWidth: 1, borderColor: c.border }]}>
      <View style={{ flex: 1 }}>
        <Label>{account.name}</Label>
        <Label small>
          {(account.subtype === 'standard' ? account.type : account.subtype)?.replaceAll('_', ' ')}
        </Label>
      </View>
      <AmountText>{money(balance, account.currency)}</AmountText>
    </MotionPressable>
  );
}
