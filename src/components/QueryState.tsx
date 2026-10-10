import { ActivityIndicator } from 'react-native';
import { Button, Card, Label, useTheme } from './ui';
export function QueryState({
  loading,
  error,
  retry,
}: {
  loading: boolean;
  error: string | null;
  retry: () => void;
}) {
  const c = useTheme();
  return loading ? (
    <Card>
      <ActivityIndicator color={c.accent} />
      <Label small>Loading your local records…</Label>
    </Card>
  ) : error ? (
    <Card>
      <Label>{error}</Label>
      <Button title="Retry" onPress={retry} />
    </Card>
  ) : null;
}
