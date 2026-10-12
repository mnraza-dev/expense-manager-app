import { ActivityIndicator, View } from 'react-native';
import { Button, Card, Label, useTheme } from './ui';
export function QueryState({
  loading,
  refreshing = false,
  error,
  retry,
}: {
  loading: boolean;
  refreshing?: boolean;
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
  ) : refreshing ? (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <ActivityIndicator size="small" color={c.accent} />
      <Label small>Updating your local records…</Label>
    </View>
  ) : null;
}
