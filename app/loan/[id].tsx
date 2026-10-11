import { useCallback, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { AdvancedForm, type FormField } from '../../src/components/AdvancedForm';
import { Button, Card, Field, Label, Screen, confirm, showError } from '../../src/components/ui';
import { QueryState } from '../../src/components/QueryState';
import { useDatabaseQuery } from '../../src/hooks/useDatabaseQuery';
import { repo } from '../../src/db/database';
import { useFinance } from '../../src/store/useFinance';
import { localDate, minor, money } from '../../src/utils/finance';
export default function LoanDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const loanId = Number(id);
  const { accounts, mutate } = useFinance();
  const load = useCallback(() => repo().loanDetail(loanId), [loanId]);
  const query = useDatabaseQuery(load, 'ledger');
  const [record, setRecord] = useState(false);
  const [recalc, setRecalc] = useState(false);
  const [date, setDate] = useState(localDate());
  const [periods, setPeriods] = useState('');
  const d = query.data;
  const fields: FormField[] = [
    { name: 'date', label: 'Payment date (YYYY-MM-DD)', kind: 'date' },
    { name: 'principal', label: 'Actual principal paid (₹)', kind: 'amount', zero: true },
    { name: 'interest', label: 'Actual interest paid / received (₹)', kind: 'amount', zero: true },
    { name: 'fees', label: 'Actual fees paid / received (₹)', kind: 'amount', zero: true },
    {
      name: 'account',
      label: 'Payment account',
      choices: accounts
        .filter((a) => !a.archived && a.kind === 'asset' && a.subtype === 'standard')
        .map((a) => ({ value: String(a.id), label: a.name })),
    },
  ];
  return (
    <Screen title={d?.loan.name ?? 'Loan details'} back>
      <QueryState {...query} />
      {d && (
        <>
          <Card>
            <Label>
              {d.loan.direction === 'borrowed' ? 'Liability' : 'Receivable'} · {d.loan.status}
            </Label>
            <Label>Outstanding principal {money(d.outstanding)}</Label>
            <Label small>
              Original {money(d.loan.principal)} · Interest {money(d.interest_paid)} · Fees{' '}
              {money(d.fees_paid)}
            </Label>
            <Label small>
              {d.loan.interest_method} · Annual rate{' '}
              {d.loan.annual_rate_bps === null
                ? 'Not supplied'
                : `${d.loan.annual_rate_bps / 100}%`}{' '}
              · {d.loan.frequency}
            </Label>
            <Label small>
              Next payment {d.next_date ?? 'No schedule'} · Forecast overdue {money(d.overdue)}
            </Label>
            <Label small>{d.schedule.length} remaining scheduled payments</Label>
          </Card>
          {d.needs_recalculation && (
            <Card>
              <Label>Review the forecast</Label>
              <Label small>
                Actual extra, early or reversed payments can change future interest. Recalculate
                unpaid forecasts explicitly; posted payment history stays intact.
              </Label>
            </Card>
          )}
          <Button
            title={record ? 'Hide payment form' : 'Record actual payment'}
            onPress={() => setRecord(!record)}
          />
          {record && (
            <AdvancedForm
              fields={fields}
              defaults={{
                date: localDate(),
                principal: '',
                interest: '0.00',
                fees: '0.00',
                account: String(d.loan.payment_account_id),
              }}
              title="Post payment"
              onSubmit={async (v) => {
                await mutate(() =>
                  repo().recordLoanPayment(loanId, {
                    date: v.date,
                    principal: minor(v.principal),
                    interest: minor(v.interest),
                    fees: minor(v.fees),
                    account_id: Number(v.account),
                  })
                );
                setRecord(false);
              }}
              cancel={() => setRecord(false)}
            />
          )}
          <Button
            secondary
            title={recalc ? 'Hide recalculation' : 'Recalculate remaining schedule'}
            onPress={() => setRecalc(!recalc)}
          />
          {recalc && (
            <Card>
              <Field label="Recalculation date (YYYY-MM-DD)" value={date} onChangeText={setDate} />
              <Field
                label="Number of remaining periods"
                keyboardType="number-pad"
                value={periods}
                onChangeText={setPeriods}
              />
              <Button
                title="Replace unpaid forecasts"
                onPress={() =>
                  confirm(
                    'Recalculate schedule?',
                    'Only unpaid forecasts will be superseded. Actual payments remain unchanged.',
                    async () => {
                      try {
                        await mutate(() => repo().recalculateLoan(loanId, date, Number(periods)));
                        setRecalc(false);
                      } catch (e) {
                        showError(e);
                      }
                    }
                  )
                }
              />
            </Card>
          )}
          <Card>
            <Label>Actual payments</Label>
            {d.payments.map((p) => (
              <Card key={p.id}>
                <Label small>
                  {p.date} · {p.status} · Principal {money(p.principal)} · Interest{' '}
                  {money(p.interest)} · Fees {money(p.fees)}
                </Label>
                {p.status === 'posted' && (
                  <Button
                    secondary
                    title="Reverse this payment"
                    onPress={() =>
                      confirm(
                        'Reverse loan payment?',
                        'The journal components will be reversed together. Recalculate forecasts afterward.',
                        () => mutate(() => repo().reverseLoanPayment(p.id))
                      )
                    }
                  />
                )}
              </Card>
            ))}
            {!d.payments.length && <Label small>No posted payments yet.</Label>}
          </Card>
          <Card>
            <Label>Remaining repayment forecasts</Label>
            {d.schedule.map((s) => (
              <Label small key={s.id}>
                {s.due_date} · Principal {money(s.principal)} · Interest {money(s.interest)}
              </Label>
            ))}
            {!d.schedule.length && (
              <Label small>
                No unpaid schedule. Supply a term at creation or recalculate remaining periods.
              </Label>
            )}
          </Card>
        </>
      )}
    </Screen>
  );
}
