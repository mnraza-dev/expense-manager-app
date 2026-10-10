import { useRouter } from 'expo-router';
import { Button, Card, Choices, Label, Screen, showError } from '../../src/components/ui';
import { useFinance } from '../../src/store/useFinance';
import { repo } from '../../src/db/database';
import { migrations } from '../../src/db/migrations';
export default function Settings() {
  const router = useRouter();
  const { settings, accounts, transactions, mutate } = useFinance();
  return (
    <Screen title="Settings" subtitle="Make Pocketbook your own">
      <Choices
        label="Appearance"
        value={settings.theme ?? 'system'}
        options={['system', 'light', 'dark'].map((v) => ({
          value: v,
          label: v[0].toUpperCase() + v.slice(1),
        }))}
        onChange={(v) => {
          void mutate(() => repo().setting('theme', v)).catch(showError);
        }}
      />
      <Card>
        <Label>Currency</Label>
        <Label small>INR · Indian rupee · 2 decimal places</Label>
        <Label small>All accounts use INR in Phase 1. Currency conversion is not included.</Label>
      </Card>
      <Button
        secondary
        title="Manage income & expense categories"
        onPress={() => router.push('/category')}
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
