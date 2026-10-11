import { useLocalSearchParams } from 'expo-router';
import { TransactionForm } from '../../src/features/TransactionForm';
export default function AddTransaction() {
  const { type, account, destination } = useLocalSearchParams<{
    type: string;
    account?: string;
    destination?: string;
  }>();
  return (
    <TransactionForm
      initialType={type === 'income' || type === 'transfer' ? type : 'expense'}
      initialAccount={account ? Number(account) : undefined}
      initialDestination={destination ? Number(destination) : undefined}
    />
  );
}
