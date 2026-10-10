import { useLocalSearchParams } from 'expo-router';
import { TransactionForm } from '../../src/features/TransactionForm';
export default function AddTransaction() {
  const { type } = useLocalSearchParams<{ type: string }>();
  return (
    <TransactionForm initialType={type === 'income' || type === 'transfer' ? type : 'expense'} />
  );
}
