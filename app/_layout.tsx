import { useEffect } from 'react';
import { DataOperationGate } from '../src/components/DataOperationGate';
import { shareMigrationRecovery } from '../src/services/files';
import { LockGate } from '../src/components/LockGate';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFinance } from '../src/store/useFinance';
import { Button, useTheme, showError } from '../src/components/ui';
export default function RootLayout() {
  const { ready, error, initialize } = useFinance();
  const c = useTheme();
  useEffect(() => {
    void initialize();
  }, [initialize]);
  return (
    <SafeAreaProvider>
      <StatusBar style={c.bg === '#101B20' ? 'light' : 'dark'} />
      <LockGate>
        <DataOperationGate>
          {ready ? (
            <Stack
              screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }}
            />
          ) : (
            <View
              style={{
                flex: 1,
                backgroundColor: c.bg,
                justifyContent: 'center',
                padding: 30,
                gap: 20,
              }}>
              <Text style={{ color: c.text, fontSize: 30, fontWeight: '800', textAlign: 'center' }}>
                Pocketbook
              </Text>
              {error ? (
                <>
                  <Text style={{ color: c.text }}>{error}</Text>
                  <Button title="Retry database initialization" onPress={() => void initialize()} />
                  <Button
                    secondary
                    title="Share pre-upgrade recovery copy"
                    onPress={() => void shareMigrationRecovery().catch(showError)}
                  />
                  <Text style={{ color: c.muted }}>
                    Preserve this installation and recovery copy. A SQLite recovery file needs
                    technical assistance; it is not a JSON backup. Do not clear app storage.
                  </Text>
                </>
              ) : (
                <>
                  <ActivityIndicator color={c.accent} />
                  <Text style={{ color: c.muted, textAlign: 'center' }}>
                    Preparing your local ledger…
                  </Text>
                </>
              )}
            </View>
          )}
        </DataOperationGate>
      </LockGate>
    </SafeAreaProvider>
  );
}
