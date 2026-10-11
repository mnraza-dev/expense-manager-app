import { useSafeBack } from '../../src/hooks/useSafeBack';
import { AdvancedForm, type FormField } from '../../src/components/AdvancedForm';
import { Card, Label, Screen } from '../../src/components/ui';
import { useFinance } from '../../src/store/useFinance';
import { repo } from '../../src/db/database';
import { localDate, minor } from '../../src/utils/finance';
import type { Loan } from '../../src/typesAdvanced';
export default function AddLoan() {
  const goBack = useSafeBack('/loan');
  const { accounts, categories, mutate } = useFinance();
  const assets = accounts.filter(
    (a) => !a.archived && a.kind === 'asset' && a.subtype === 'standard'
  );
  const fields: FormField[] = [
    { name: 'name', label: 'Loan name' },
    {
      name: 'direction',
      label: 'Money direction',
      choices: [
        { value: 'borrowed', label: 'Borrowed / owed' },
        { value: 'lent', label: 'Lent to someone' },
      ],
    },
    {
      name: 'label',
      label: 'Loan type',
      choices: [
        { value: 'personal', label: 'Personal loan' },
        { value: 'other', label: 'Other debt / loan' },
      ],
    },
    { name: 'counterparty', label: 'Lender / borrower (optional)', optional: true },
    { name: 'principal', label: 'Original principal (₹)', kind: 'amount' },
    { name: 'start', label: 'Disbursement date (YYYY-MM-DD)', kind: 'date' },
    {
      name: 'account',
      label: 'Payment / disbursement account',
      choices: assets.map((a) => ({ value: String(a.id), label: a.name })),
    },
    {
      name: 'method',
      label: 'Interest method',
      choices: [
        { value: 'none', label: 'No interest' },
        { value: 'flat', label: 'Flat simple interest' },
        { value: 'reducing', label: 'Reducing simple interest' },
      ],
    },
    {
      name: 'rate',
      label: 'Nominal annual interest rate (%)',
      optional: true,
      kind: 'amount',
      zero: true,
      hint: 'Required for interest-bearing loans. Maximum 100%; no compounding or penalties are assumed.',
    },
    {
      name: 'frequency',
      label: 'Repayment frequency',
      choices: [
        { value: 'monthly', label: 'Monthly' },
        { value: 'quarterly', label: 'Quarterly' },
        { value: 'yearly', label: 'Yearly' },
      ],
    },
    {
      name: 'term',
      label: 'Term in months (optional)',
      kind: 'integer',
      optional: true,
      hint: 'A whole number of repayment periods is required to generate an equal-principal schedule.',
    },
    { name: 'fees', label: 'Upfront fees paid (₹)', kind: 'amount', zero: true },
    {
      name: 'category',
      label: 'Interest / payment-fee category',
      choices: (v) =>
        categories
          .filter((c) => !c.archived && c.type === (v.direction === 'lent' ? 'income' : 'expense'))
          .map((c) => ({ value: String(c.id), label: c.name })),
    },
  ];
  return (
    <Screen title="New loan" back backTo="/loan">
      <Card>
        <Label>Principal stays on the balance sheet</Label>
        <Label small>
          Borrowed interest and fees are expenses; received interest and payment fees on lent money
          are income. Upfront fees are expenses. Schedules are forecasts, and actual payments
          require confirmation.
        </Label>
      </Card>
      <AdvancedForm
        fields={fields}
        defaults={{
          name: '',
          direction: 'borrowed',
          label: 'personal',
          counterparty: '',
          principal: '',
          start: localDate(),
          account: String(assets[0]?.id ?? 0),
          method: 'none',
          rate: '',
          frequency: 'monthly',
          term: '',
          fees: '0.00',
          category: String(categories.find((c) => !c.archived && c.type === 'expense')?.id ?? 0),
        }}
        onSubmit={async (v) => {
          await mutate(() =>
            repo().createLoan({
              name: v.name,
              direction: v.direction as Loan['direction'],
              label: v.label as Loan['label'],
              principal: minor(v.principal),
              start_date: v.start,
              annual_rate_bps: v.rate ? minor(v.rate) : null,
              interest_method: v.method as Loan['interest_method'],
              frequency: v.frequency as Loan['frequency'],
              term_months: v.term ? Number(v.term) : null,
              payment_account_id: Number(v.account),
              counterparty: v.counterparty,
              category_id: Number(v.category),
              origination_fees: minor(v.fees),
            })
          );
          goBack();
        }}
        cancel={() => goBack()}
      />
    </Screen>
  );
}
