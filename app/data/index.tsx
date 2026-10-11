import { useRef, useState } from 'react';
import { waitForForegroundAccess } from '../../src/security/lock';
import { restoreWithConfirmation } from '../../src/services/restorePolicy';
import { Alert } from 'react-native';
import { Screen, Card, Label, Button, Field, Choices, showError } from '../../src/components/ui';
import { useFinance } from '../../src/store/useFinance';
import { repo } from '../../src/db/database';
import { transactionWorkbook } from '../../src/utils/workbook';
import { transactionCSV } from '../../src/utils/export';
import {
  createBackupFile,
  prepareBackup,
  readBackupFile,
  replaceFromBackup,
  shareLatestRecovery,
  shareText,
  shareWorkbook,
  useDataOperation,
} from '../../src/services/files';
import type { IntegrityIssue } from '../../src/db/dataRepository';
import { ExpenseReportExport } from '../../src/components/ExpenseReportExport';
export default function DataScreen() {
  const { accounts, categories, mutate } = useFinance();
  const [start, setStart] = useState(''),
    [end, setEnd] = useState(''),
    [type, setType] = useState('all'),
    [account, setAccount] = useState('all'),
    [category, setCategory] = useState('all');
  const [password, setPassword] = useState(''),
    [issues, setIssues] = useState<IntegrityIssue[] | null>(null),
    [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const run = async (task: () => Promise<void>, message: string) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    useDataOperation.getState().setMessage(message);
    try {
      await task();
    } catch (e) {
      showError(e);
    } finally {
      setPassword('');
      inFlight.current = false;
      setBusy(false);
      useDataOperation.getState().setMessage(null);
    }
  };
  const restore = async () => {
    const input = await readBackupFile();
    if (input === null) return;
    const prepared = await prepareBackup(input, password);
    await waitForForegroundAccess();
    // End the progress gate before displaying a destructive choice.
    useDataOperation.getState().setMessage(null);
    const accepted = await new Promise<boolean>((resolve) =>
      Alert.alert(
        'Replace all financial data?',
        `${prepared.backup.payload.tables.accounts.length} accounts, ${prepared.backup.payload.tables.transactions.length} transactions and complete ledger/history from ${prepared.backup.payload.createdAt}. Existing data will be replaced, not merged. A private recovery backup will be saved first. ${password ? 'Recovery backup uses the entered password.' : 'Recovery backup is unencrypted.'}`,
        [
          { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
          { text: 'Replace data', style: 'destructive', onPress: () => resolve(true) },
        ],
        { cancelable: false }
      )
    );
    const replaced = await restoreWithConfirmation(
      async () => accepted,
      async () => {
        await waitForForegroundAccess();
        useDataOperation.getState().setMessage('Saving recovery copy and restoring data…');
        await mutate(() => replaceFromBackup(prepared.text, password));
      }
    );
    if (!replaced) return;
    useFinance.setState((s) => ({ budgetRevision: s.budgetRevision + 1 }));
    Alert.alert(
      'Restore complete',
      'The validated backup was restored. Your prior data is available in the recovery backup.'
    );
  };
  return (
    <Screen title="Data & backups" back subtitle="Export, recover and verify your records">
      <ExpenseReportExport busy={busy} run={run} />
      <Card>
        <Label>CSV for Excel</Label>
        <Label small>
          UTF-8 CSV with numeric decimal amounts, INR currency, escaped text and spreadsheet formula
          protection. Open or import the .csv in Excel. The Excel option creates a genuine .xlsx
          workbook with selected transactions, referenced account/category names and monthly totals.
        </Label>
        <Field label="From date (optional YYYY-MM-DD)" value={start} onChangeText={setStart} />
        <Field label="Through date (optional YYYY-MM-DD)" value={end} onChangeText={setEnd} />
        <Choices
          label="Transaction type"
          value={type}
          onChange={setType}
          options={['all', 'income', 'expense', 'transfer'].map((value) => ({
            value,
            label: value,
          }))}
        />
        <Choices
          label="Account (source or destination)"
          value={account}
          onChange={setAccount}
          options={[
            { value: 'all', label: 'All accounts' },
            ...accounts.map((a) => ({ value: String(a.id), label: a.name })),
          ]}
        />
        <Choices
          label="Category"
          value={category}
          onChange={setCategory}
          options={[
            { value: 'all', label: 'All categories' },
            ...categories.map((c) => ({ value: String(c.id), label: c.name })),
          ]}
        />
        <Button
          title="Export selected CSV"
          busy={busy}
          onPress={() =>
            void run(async () => {
              const rows = await repo().exportTransactions({
                start: start || undefined,
                end: end || undefined,
                type: type === 'all' ? undefined : type,
                account: account === 'all' ? undefined : Number(account),
                category: category === 'all' ? undefined : Number(category),
              });
              await shareText(transactionCSV(rows), 'csv', 'transactions');
            }, 'Preparing selected CSV…')
          }
        />
      </Card>
      <Button
        secondary
        title="Export selected Excel workbook"
        busy={busy}
        onPress={() =>
          void run(async () => {
            const rows = await repo().exportTransactions({
              start: start || undefined,
              end: end || undefined,
              type: type === 'all' ? undefined : type,
              account: account === 'all' ? undefined : Number(account),
              category: category === 'all' ? undefined : Number(category),
            });
            await shareWorkbook(transactionWorkbook(rows));
          }, 'Preparing selected Excel workbook…')
        }
      />
      <Card>
        <Label>Complete backup & replace restore</Label>
        <Label small>
          Includes all financial data, audit journals, schedules and preferences. App-lock secrets
          and receipt files are excluded. Share receipts separately from their transaction before
          changing devices or uninstalling. Share and retain a backup outside this device before
          relying on it.
        </Label>
        <Field
          label="Backup encryption password (optional, 12+ characters)"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="off"
        />
        <Label small>
          Leave blank for an unencrypted backup. Enter the original password to restore an encrypted
          file. Losing the password makes encrypted backups unrecoverable.
        </Label>
        <Button
          title="Create and share complete backup"
          busy={busy}
          onPress={() =>
            void run(async () => {
              await shareText(await createBackupFile(password), 'json', 'settler-backup');
            }, 'Creating complete backup…')
          }
        />
        <Button
          secondary
          title="Select backup to validate & restore"
          busy={busy}
          onPress={() => void run(restore, 'Reading and validating backup…')}
        />
        <Button
          secondary
          title="Share latest pre-restore recovery copy"
          busy={busy}
          onPress={() => void run(shareLatestRecovery, 'Opening recovery backup…')}
        />
      </Card>
      <Card>
        <Label>Data integrity</Label>
        <Label small>
          Read-only checks report issues that require review. No financial records are repaired
          automatically.
        </Label>
        <Button
          secondary
          title="Run integrity checks"
          busy={busy}
          onPress={() =>
            void run(
              async () => setIssues(await repo().integrity()),
              'Checking financial integrity…'
            )
          }
        />
        {issues !== null &&
          (issues.length ? (
            issues.map((i) => (
              <Card key={i.code}>
                <Label>
                  {i.code.replaceAll('_', ' ')} · {i.count}
                </Label>
                <Label small>{i.action}</Label>
              </Card>
            ))
          ) : (
            <Label>No issues detected in the supported checks.</Label>
          ))}
      </Card>
    </Screen>
  );
}
