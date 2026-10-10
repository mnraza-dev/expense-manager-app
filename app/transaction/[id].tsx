import { useLocalSearchParams } from 'expo-router';
import { TransactionForm } from '../../src/features/TransactionForm';
export default function EditTransaction() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <TransactionForm id={Number(id)} />;
}
