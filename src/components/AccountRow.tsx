import { MotionPressable } from './Motion';
import { DepthIcon } from './Depth';
import { CreditCard, Landmark, Wallet } from 'lucide-react-native';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import type { Account } from '../types';
import { AmountText, Label, styles, useTheme } from './ui';
import { money } from '../utils/finance';
export function AccountRow({ account, balance }: { account: Account; balance: number }) {
  const router = useRouter();
  const c = useTheme();
  const Icon =
    account.type === 'bank' ? Landmark : account.kind === 'liability' ? CreditCard : Wallet;
  return (
    <MotionPressable
      depth
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/account/[id]', params: { id: account.id } })}
      style={[styles.row, { paddingVertical: 12, borderBottomWidth: 1, borderColor: c.border }]}>
      <DepthIcon colors={c}>
        <Icon size={20} color={c.accent} />
      </DepthIcon>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Label>{account.name}</Label>
        <Label small>
          {(account.subtype === 'standard' ? account.type : account.subtype)?.replaceAll('_', ' ')}
        </Label>
      </View>
      <AmountText>{money(balance, account.currency)}</AmountText>
    </MotionPressable>
  );
}
