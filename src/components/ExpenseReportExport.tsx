import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { Button, Card, Choices, Field, InlineFeedback, Label } from './ui';
import { useDatabaseQuery } from '../hooks/useDatabaseQuery';
import {
  expenseCurrencyTotals,
  expensePeriodRange,
  expenseReportLabel,
  moveExpensePeriod,
  type ExpensePeriod,
} from '../utils/expenseReports';
import { expenseReportHTML } from '../utils/expensePDF';
import { localDate, money, validDate } from '../utils/finance';
import { transactionWorkbook } from '../utils/workbook';
import { sharePDFReport, shareWorkbook } from '../services/files';
import { waitForForegroundAccess } from '../security/lock';
import { repo } from '../db/database';
import { useFinance } from '../store/useFinance';
export function ExpenseReportExport({
  busy,
  run,
}: {
  busy: boolean;
  run: (task: () => Promise<void>, message: string) => Promise<void>;
}) {
  const [period, setPeriod] = useState<ExpensePeriod>('monthly');
  const [anchor, setAnchor] = useState(localDate);
  const [account, setAccount] = useState('all');
  const accounts = useFinance((s) => s.accounts);
  const load = useCallback(async () => {
    const rows = await repo().exportTransactions({
      ...expensePeriodRange(period, anchor),
      type: 'expense',
      account: account === 'all' ? undefined : Number(account),
    });
    expenseCurrencyTotals(rows);
    return rows;
  }, [period, anchor, account]);
  const query = useDatabaseQuery(load, 'ledger');
  const invalid = period !== 'all' && !validDate(anchor);
  const label = invalid ? 'Choose a valid report date' : expenseReportLabel(period, anchor);
  const blocked = query.loading || Boolean(query.error) || invalid;
  return (
    <Card>
      <Label>Expense reports</Label>
      <Label small>
        Browse any past day, Monday–Sunday week or month. All history includes every posted expense.
        Income, transfers and deleted entries are excluded.
      </Label>
      <Choices
        label="Report period"
        value={period}
        onChange={setPeriod}
        options={[
          { value: 'daily', label: 'Daily' },
          { value: 'weekly', label: 'Weekly' },
          { value: 'monthly', label: 'Monthly' },
          { value: 'all', label: 'All history' },
        ]}
      />
      <Choices
        label="Expense account"
        value={account}
        onChange={setAccount}
        options={[
          { value: 'all', label: 'All accounts' },
          ...accounts.map((a) => ({
            value: String(a.id),
            label: a.name + (a.archived ? ' (archived)' : ''),
          })),
        ]}
      />
      {period !== 'all' && (
        <>
          <Field
            label="Date in the report period (YYYY-MM-DD)"
            value={anchor}
            onChangeText={setAnchor}
            error={invalid ? 'Enter a valid date.' : undefined}
          />
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Button
                secondary
                title="Previous period"
                busy={busy}
                disabled={invalid}
                onPress={() => setAnchor(moveExpensePeriod(period, anchor, -1))}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                secondary
                title="Next period"
                busy={busy}
                disabled={invalid}
                onPress={() => setAnchor(moveExpensePeriod(period, anchor, 1))}
              />
            </View>
          </View>
          <Button
            secondary
            title="Current period"
            busy={busy}
            onPress={() => setAnchor(localDate())}
          />
        </>
      )}
      <Label>{label}</Label>
      {query.loading && <Label small>Loading expenses…</Label>}
      {query.error && (
        <>
          <InlineFeedback message={query.error} />
          <Button secondary title="Retry report" onPress={query.retry} busy={busy} />
        </>
      )}
      {query.data && (
        <>
          <Label small>{query.data.length} expenses</Label>
          {expenseCurrencyTotals(query.data).map((total) => (
            <Label key={total.currency}>{money(total.amount, total.currency)}</Label>
          ))}
          {!query.data.length && (
            <Label small>No expenses in this period. Try another period or all history.</Label>
          )}
        </>
      )}
      <Label small>
        Excel includes all expense details and daily, weekly and monthly summaries. PDF includes
        details and period totals. PDF supports 1,000 expenses; Excel supports 50,000. Receipt files
        are excluded.
      </Label>
      <Button
        title="Export expense report as PDF"
        busy={busy}
        disabled={blocked}
        onPress={() =>
          void run(async () => {
            const rows = await load();
            await sharePDFReport(expenseReportHTML(rows, label, period), `expenses-${period}`);
          }, 'Preparing expense PDF…')
        }
      />
      <Button
        secondary
        title="Export expense report as Excel"
        busy={busy}
        disabled={blocked}
        onPress={() =>
          void run(async () => {
            const rows = await load();
            await waitForForegroundAccess();
            await shareWorkbook(transactionWorkbook(rows));
          }, 'Preparing expense Excel workbook…')
        }
      />
    </Card>
  );
}
