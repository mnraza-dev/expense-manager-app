import { useRouter } from 'expo-router';
import { AdvancedForm } from '../components/AdvancedForm';
import { Label, Screen } from '../components/ui';
import { repo } from '../db/database';
import { useFinance } from '../store/useFinance';
import { minor } from '../utils/finance';
import type { SavingsGoal } from '../typesMvp4';
export function GoalForm({ goal, onDone }: { goal?: SavingsGoal; onDone?: () => void }) {
  const router = useRouter(),
    mutate = useFinance((s) => s.mutate);
  return (
    <Screen title={goal ? 'Edit savings goal' : 'New savings goal'} back backTo="/goal">
      <Label small>Track earmarked savings separately from your account balances.</Label>
      <AdvancedForm
        fields={[
          { name: 'name', label: 'Goal name' },
          { name: 'target', label: 'Target amount (₹)', kind: 'amount' },
          { name: 'date', label: 'Target date (optional)', kind: 'date', optional: true },
        ]}
        cancel={onDone}
        defaults={{
          name: goal?.name ?? '',
          target: goal ? (goal.target_amount / 100).toFixed(2) : '',
          date: goal?.due_date ?? '',
        }}
        onSubmit={async (v) => {
          let id = goal?.id;
          await mutate(async () => {
            id = await repo().saveGoal(
              { name: v.name, target_amount: minor(v.target), due_date: v.date || null },
              goal?.id
            );
          });
          if (onDone) {
            onDone();
            return;
          }
          router.replace({ pathname: '/goal/[id]', params: { id: id! } });
        }}
      />
    </Screen>
  );
}
