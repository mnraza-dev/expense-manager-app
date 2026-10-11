import { useEffect, type ReactNode } from 'react';
import { ActivityIndicator, BackHandler, View } from 'react-native';
import { useDataOperation } from '../services/files';
import { Label, useTheme } from './ui';
export function DataOperationGate({ children }: { children: ReactNode }) {
  const message = useDataOperation((s) => s.message),
    c = useTheme();
  useEffect(() => {
    if (!message) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => subscription.remove();
  }, [message]);
  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1, display: message ? 'none' : 'flex' }}>{children}</View>
      {message ? (
        <View style={{ flex: 1, justifyContent: 'center', padding: 30, backgroundColor: c.bg }}>
          <ActivityIndicator color={c.accent} />
          <Label>{message}</Label>
          <Label small>Keep the app open until this operation finishes.</Label>
        </View>
      ) : null}
    </View>
  );
}
