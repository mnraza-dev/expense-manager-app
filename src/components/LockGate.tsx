import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, View, ActivityIndicator, Platform } from 'react-native';
import * as ScreenCapture from 'expo-screen-capture';
import { Button, Field, Label, showError, useTheme } from './ui';
import { lockCore, useLock } from '../security/lock';
import { shouldRelock } from '../security/lockCore';
export function LockGate({ children }: { children: ReactNode }) {
  const { ready, locked, enabled, error, load, unlock, biometric, lock } = useLock();
  const [privateScreen, setPrivateScreen] = useState(AppState.currentState !== 'active');
  const [passcode, setPasscode] = useState(''),
    [busy, setBusy] = useState(false);
  const background = useRef<number | null>(null),
    c = useTheme();
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    const listener = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        if (background.current === null) background.current = Date.now();
        setPrivateScreen(true);
        setPasscode('');
      } else {
        if (
          background.current !== null &&
          enabled &&
          shouldRelock(background.current, Date.now(), lockCore.record?.relockSeconds ?? 0)
        )
          lock();
        background.current = null;
        setPrivateScreen(false);
      }
    });
    return () => listener.remove();
  }, [enabled, lock]);
  useEffect(() => {
    if (enabled) {
      void ScreenCapture.preventScreenCaptureAsync('app-lock').catch(() => {});
      if (Platform.OS === 'ios')
        void ScreenCapture.enableAppSwitcherProtectionAsync().catch(() => {});
    } else {
      void ScreenCapture.allowScreenCaptureAsync('app-lock').catch(() => {});
      if (Platform.OS === 'ios')
        void ScreenCapture.disableAppSwitcherProtectionAsync().catch(() => {});
    }
    return () => {
      void ScreenCapture.allowScreenCaptureAsync('app-lock').catch(() => {});
    };
  }, [enabled]);
  const attempt = async (bio = false) => {
    if (busy) return;
    setBusy(true);
    try {
      await (bio ? biometric() : unlock(passcode));
      setPasscode('');
    } catch (e) {
      setPasscode('');
      showError(e);
    } finally {
      setBusy(false);
    }
  };
  if (ready && !locked && !privateScreen) return children;
  return (
    <View
      style={{ flex: 1, backgroundColor: c.bg, justifyContent: 'center', padding: 30, gap: 16 }}>
      <Label>Pocketbook</Label>
      {error ? (
        <>
          <Label>{error}</Label>
          <Button title="Retry secure storage" onPress={() => void load()} />
        </>
      ) : !ready ? (
        <ActivityIndicator color={c.accent} />
      ) : privateScreen ? (
        <Label>Your financial information is hidden.</Label>
      ) : (
        <>
          <Label>Unlock your financial records</Label>
          <Field
            label="App passcode"
            value={passcode}
            onChangeText={setPasscode}
            secureTextEntry
            keyboardType="number-pad"
            maxLength={12}
            autoComplete="off"
          />
          <Button title="Unlock" busy={busy} onPress={() => void attempt()} />
          {lockCore.record?.biometric && (
            <Button
              secondary
              title="Unlock with biometrics"
              busy={busy}
              onPress={() => void attempt(true)}
            />
          )}
          <Label small>
            Use your app passcode if biometrics are unavailable. Forgotten passcodes cannot be reset
            here; keep an external backup.
          </Label>
        </>
      )}
    </View>
  );
}
