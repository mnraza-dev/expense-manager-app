import { useRouter } from 'expo-router';
import type { Loan, RecurringRule } from '../typesAdvanced';
import { AdvancedForm, type FormField } from '../components/AdvancedForm';
import { Label, Screen } from '../components/ui';
import { useFinance } from '../store/useFinance';
import { repo } from '../db/database';
import { localDate, minor } from '../utils/finance';
export function RecurringForm({ rule, loans }: { rule?: RecurringRule; loans: Loan[] }) {
  const router = useRouter();
  const { accounts, categories, mutate } = useFinance();
  const assets = accounts.filter(
    (a) => !a.archived && a.kind === 'asset' && a.subtype === 'standard'
  );
  const fields: FormField[] = [
    {
      name: 'type',
      label: 'Recurring event',
      choices: [
        { value: 'expense', label: 'Expense' },
        { value: 'income', label: 'Income' },
        { value: 'loan_payment', label: 'Loan principal payment' },
      ],
    },
    { name: 'description', label: 'Description' },
    { name: 'amount', label: 'Amount / loan principal per occurrence (₹)', kind: 'amount' },
    {
      name: 'account',
      label: 'Asset account',
      choices: assets.map((a) => ({ value: String(a.id), label: a.name })),
    },
    {
      name: 'category',
      label: 'Income / expense category (not used for loan principal)',
      optional: true,
      choices: (v) =>
        v.type === 'loan_payment'
          ? [{ value: '0', label: 'Principal has no expense category' }]
          : categories
              .filter((c) => !c.archived && c.type === v.type)
              .map((c) => ({ value: String(c.id), label: c.name })),
    },
    {
      name: 'loan',
      label: 'Loan (only for principal payments)',
      optional: true,
      choices: [
        { value: '0', label: 'No loan' },
        ...loans
          .filter((l) => l.status === 'active')
          .map((l) => ({ value: String(l.id), label: l.name })),
      ],
    },
    { name: 'start', label: 'Original start date (YYYY-MM-DD)', kind: 'date' },
    { name: 'end', label: 'End date (optional, YYYY-MM-DD)', kind: 'date', optional: true },
    {
      name: 'frequency',
      label: 'Frequency',
      choices: ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'].map((value) => ({
        value,
        label: value[0].toUpperCase() + value.slice(1),
      })),
    },
  ];
  return (
    <Screen title={rule ? 'Edit future recurrence' : 'New recurrence'} back>
      <Label small>
        Occurrences are reminders until you explicitly confirm them. Loan recurrences post principal
        only; record interest and fees separately on the loan screen. Monthly dates retain their
        original anchor and clamp at month end.
      </Label>
      <AdvancedForm
        fields={fields}
        defaults={{
          type: rule?.type ?? 'expense',
          description: rule?.description ?? '',
          amount: rule ? (rule.amount / 100).toFixed(2) : '',
          account: String(rule?.account_id ?? assets[0]?.id ?? 0),
          category: String(
            rule?.category_id ??
              categories.find((c) => !c.archived && c.type === 'expense')?.id ??
              0
          ),
          loan: String(rule?.loan_id ?? 0),
          start: rule?.start_date ?? localDate(),
          end: rule?.end_date ?? '',
          frequency: rule?.frequency ?? 'monthly',
        }}
        onSubmit={async (v) => {
          await mutate(() =>
            repo().saveRecurring(
              {
                type: v.type as RecurringRule['type'],
                amount: minor(v.amount),
                account_id: Number(v.account),
                category_id: v.type === 'loan_payment' ? null : Number(v.category),
                loan_id: v.type === 'loan_payment' ? Number(v.loan) : null,
                description: v.description,
                start_date: v.start,
                end_date: v.end || null,
                frequency: v.frequency as RecurringRule['frequency'],
              },
              rule?.id
            )
          );
          router.back();
        }}
        cancel={() => router.back()}
      />
    </Screen>
  );
}
