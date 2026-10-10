import { useLocalSearchParams } from 'expo-router';
import { AccountForm } from '../../src/features/AccountForm';
export default function EditAccount() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <AccountForm id={Number(id)} />;
}
