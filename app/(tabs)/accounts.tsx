import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useFinance } from '../../src/store/useFinance';
import { balance, money } from '../../src/utils/finance';
import { Button, Card, Choices, Empty, Label, Screen, styles } from '../../src/components/ui';
export default function Accounts() {
  const router = useRouter();
  const { accounts, transactions } = useFinance();
  const [mode, setMode] = useState('active');
  const rows = accounts.filter((a) => Boolean(a.archived) === (mode === 'archived'));
  return (
    <Screen
      title="Accounts"
      subtitle="A home for every rupee"
      action={() => router.push('/account/add')}>
      <Button secondary title="Credit cards & statements" onPress={() => router.push('/card')} />
      <Button secondary title="Loans & debts" onPress={() => router.push('/loan')} />
      <Choices
        label="Show accounts"
        value={mode}
        onChange={setMode}
        options={[
          { value: 'active', label: 'Active' },
          { value: 'archived', label: 'Archived' },
        ]}
      />
      {rows.map((a) => (
        <Pressable
          key={a.id}
          onPress={() => router.push({ pathname: '/account/[id]', params: { id: a.id } })}>
          <Card>
            <View style={styles.row}>
              <View>
                <Label>{a.name}</Label>
                <Label small>
                  {a.subtype === 'standard'
                    ? a.type.toUpperCase()
                    : a.subtype?.replaceAll('_', ' ').toUpperCase()}{' '}
                  · {a.kind ?? 'asset'} · {a.currency}
                </Label>
              </View>
              <Label>{money(balance(a, transactions), a.currency)}</Label>
            </View>
            {!!a.description && <Label small>{a.description}</Label>}
          </Card>
        </Pressable>
      ))}
      {!rows.length && (
        <Empty
          title={mode === 'active' ? 'No accounts yet' : 'No archived accounts'}
          detail="Use the + button to add an account with its opening balance."
        />
      )}
    </Screen>
  );
}
