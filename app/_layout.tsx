import * as SplashScreen from 'expo-splash-screen';
import { OnboardingGate } from '../src/components/OnboardingGate';
import { useLock } from '../src/security/lock';
import { startCloudAuth, useCloudAuth } from '../src/cloud/auth';
import { startSyncObservers } from '../src/cloud/sync';
import { billingUser } from '../src/cloud/entitlements';
import { useEffect } from 'react';
import { DataOperationGate } from '../src/components/DataOperationGate';
import { shareMigrationRecovery } from '../src/services/files';
import { LockGate } from '../src/components/LockGate';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, Image, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFinance } from '../src/store/useFinance';
import { Button, useTheme, showError } from '../src/components/ui';
void SplashScreen.preventAutoHideAsync().catch(() => {});
export default function RootLayout() {
  const { ready, error, initialize } = useFinance();
  const c = useTheme();
  const lockReady = useLock((s) => s.ready);
  const lockError = useLock((s) => s.error);
  useEffect(() => {
    if ((ready || error) && (lockReady || lockError)) void SplashScreen.hideAsync().catch(() => {});
  }, [ready, error, lockReady, lockError]);
  useEffect(() => {
    void initialize();
  }, [initialize]);
  useEffect(() => {
    const stop = startCloudAuth();
    return stop;
  }, []);
  useEffect(() => {
    if (!ready) return;
    return startSyncObservers();
  }, [ready]);
  const cloudOwner = useCloudAuth((s) => s.session?.user.id ?? null);
  useEffect(() => {
    void billingUser(cloudOwner).catch(() => {});
  }, [cloudOwner]);
  return (
    <SafeAreaProvider>
      <StatusBar style={c.bg === '#172020' ? 'light' : 'dark'} />
      <LockGate>
        <DataOperationGate>
          {ready ? (
            <OnboardingGate>
              <Stack
                screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }}
              />
            </OnboardingGate>
          ) : (
            <View
              style={{
                flex: 1,
                backgroundColor: c.bg,
                justifyContent: 'center',
                padding: 30,
                gap: 20,
              }}>
              <Image
                source={require('../assets/icon.png')}
                accessibilityLabel="Pocketbook"
                style={{ width: 120, height: 120, alignSelf: 'center', borderRadius: 24 }}
                resizeMode="contain"
              />
              <Text style={{ color: c.text, fontSize: 22, fontWeight: '600', textAlign: 'center' }}>
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
