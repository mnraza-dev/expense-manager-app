import { useRouter } from 'expo-router';
import { Button, Screen, Label } from '../src/components/ui';
export default function NotFound() {
  const router = useRouter();
  return (
    <Screen title="Page not found">
      <Label>Return to your dashboard to continue.</Label>
      <Button title="Go home" onPress={() => router.replace('/')} />
    </Screen>
  );
}
