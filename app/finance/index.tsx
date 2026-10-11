import { useRouter } from 'expo-router';
import { Button, Card, Label, Screen } from '../../src/components/ui';
export default function FinanceTools() {
  const router = useRouter();
  return (
    <Screen title="Finance tools" subtitle="Your accounts, commitments and financial history" back>
      <Button title="Credit cards & statements" onPress={() => router.push('/card')} />
      <Button secondary title="Recurring transactions" onPress={() => router.push('/recurring')} />
      <Button secondary title="Loans, debts & money lent" onPress={() => router.push('/loan')} />
      <Button secondary title="Net worth over time" onPress={() => router.push('/net-worth')} />
      <Button
        secondary
        title="Ledger activity & audit history"
        onPress={() => router.push('/ledger')}
      />
      <Card>
        <Label>One consistent ledger</Label>
        <Label small>
          Purchases are expenses. Card payments and loan principal are balance-sheet movements.
          Interest and fees are recorded separately. Corrections preserve the original posting
          through a reversal.
        </Label>
      </Card>
    </Screen>
  );
}
