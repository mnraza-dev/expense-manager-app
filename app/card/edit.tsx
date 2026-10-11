import { useLocalSearchParams } from 'expo-router';
import { CardForm } from '../../src/features/CardForm';
export default function EditCard() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <CardForm id={Number(id)} />;
}
