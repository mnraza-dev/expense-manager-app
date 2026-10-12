import { useLocalSearchParams } from 'expo-router';
import { TransactionForm } from '../../src/features/TransactionForm';
export default function Refund() {
  const { original } = useLocalSearchParams<{ original: string }>();
  return <TransactionForm initialRefundId={Number(original)} />;
}
