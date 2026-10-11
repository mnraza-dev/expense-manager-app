import { useRouter } from 'expo-router';
import { Button, Card, Choices, Label, Screen, showError } from '../../src/components/ui';
import { useFinance } from '../../src/store/useFinance';
import { repo } from '../../src/db/database';
import { migrations } from '../../src/db/migrations';
export default function Settings() {
  const router = useRouter();
  const { settings, accounts, transactions, mutatePreference } = useFinance();
  return (
    <Screen back title="Settings" subtitle="Make Pocketbook your own">
      <Choices
        label="Appearance"
        value={settings.theme ?? 'system'}
        options={['system', 'light', 'dark'].map((v) => ({
          value: v,
          label: v[0].toUpperCase() + v.slice(1),
        }))}
        onChange={(v) => {
          void mutatePreference(() => repo().setting('theme', v)).catch(showError);
        }}
      />
      <Choices
        label="Budget warning threshold"
        value={settings.budget_warning_percent ?? '80'}
        options={['70', '80', '90'].map((value) => ({ value, label: `${value}% used` }))}
        onChange={(value) => {
          void mutatePreference(() => repo().setting('budget_warning_percent', value)).catch(
            showError
          );
        }}
      />
      <Card>
        <Label>Currency</Label>
        <Label small>INR · Indian rupee · 2 decimal places</Label>
        <Label small>All accounts use INR. Currency conversion is not included.</Label>
      </Card>
      <Button
        secondary
        title="Manage income & expense categories"
        onPress={() => router.push('/category')}
      />
      <Button secondary title="Finance tools & ledger" onPress={() => router.push('/finance')} />
      <Button
        secondary
        title="Export, backup, restore & integrity"
        onPress={() => router.push('/data')}
      />
      <Button
        secondary
        title="Passcode & biometric app lock"
        onPress={() => router.push('/security')}
      />
      <Button
        secondary
        title="Optional cloud, sync & subscriptions"
        onPress={() => router.push('/cloud')}
      />
      <Card>
        <Label>Local database</Label>
        <Label small>SQLite · pocketbook.db · schema v{migrations.length}</Label>
        <Label small>
          {accounts.length} accounts · {transactions.length} transactions
        </Label>
        <Label small>
          Your financial records stay on this device. No account, cloud sync or bank connection is
          required.
        </Label>
        <Label small>
          Uninstalling the app may remove its database. Local storage alone does not protect against
          device compromise.
        </Label>
      </Card>
      <Label small>Pocketbook 1.0 · Personal finance, thoughtfully simple.</Label>
    </Screen>
  );
}
