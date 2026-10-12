import { useRouter } from 'expo-router';
import { Button, Card, Choices, Label, Screen, showError, useTheme } from '../../src/components/ui';
import { FinanceArt } from '../../src/components/Depth';
import { useFinance } from '../../src/store/useFinance';
import { repo } from '../../src/db/database';
import { migrations } from '../../src/db/migrations';
import { requireOptionalNativeModule } from 'expo';
import Constants from 'expo-constants';
export default function Settings() {
  const router = useRouter();
  const c = useTheme();
  const application = requireOptionalNativeModule<{
    nativeApplicationVersion?: string;
    nativeBuildVersion?: string;
  }>('ExpoApplication');
  const version = application?.nativeApplicationVersion ?? Constants.expoConfig?.version;
  const { settings, accounts, transactionCount, mutatePreference } = useFinance();
  return (
    <Screen
      back
      title="Settings"
      subtitle="Appearance, categories and app settings"
      headerActions={<FinanceArt kind="shield" colors={c} size={48} />}>
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
        <Label small>SQLite · schema v{migrations.length}</Label>
        <Label small>
          {accounts.length} accounts · {transactionCount} transactions
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
      <Label small>
        Settler{version ? ` ${version}` : ''}
        {application?.nativeBuildVersion ? ` · Build ${application.nativeBuildVersion}` : ''}
      </Label>
    </Screen>
  );
}
