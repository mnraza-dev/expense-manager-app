import { useLocalSearchParams } from 'expo-router';
import { BudgetForm } from '../../src/features/BudgetForm';
export default function AddBudget() {
  const { month } = useLocalSearchParams<{ month?: string }>();
  return <BudgetForm initialMonth={month} />;
}
