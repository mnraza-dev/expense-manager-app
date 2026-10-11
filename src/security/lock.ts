import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import * as LocalAuthentication from 'expo-local-authentication';
import { create } from 'zustand';
import { AppState } from 'react-native';
import { LockCore, authenticateBiometric } from './lockCore';
let lockGeneration = 0;
const biometricKey = 'pocketbook.biometric.v1';
export async function configureLock(current: string, biometric: boolean, seconds: number) {
  await lockCore.check(current);
  if (biometric) {
    if (!(await biometricsAvailable()))
      throw new Error('Strong enrolled biometrics are unavailable. Use your app passcode.');
    await SecureStore.setItemAsync(biometricKey, 'enabled', {
      requireAuthentication: true,
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      authenticationPrompt: 'Enable Pocketbook biometric unlock',
    });
  } else await SecureStore.deleteItemAsync(biometricKey);
  await lockCore.configure(current, biometric, seconds);
}

const key = 'pocketbook.lock.v1';
export const lockCore = new LockCore(
  {
    get: () => SecureStore.getItemAsync(key),
    set: (value) =>
      SecureStore.setItemAsync(key, value, {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      }),
    remove: () => SecureStore.deleteItemAsync(key),
  },
  Crypto.getRandomBytes
);
export async function biometricsAvailable() {
  return (
    (await LocalAuthentication.hasHardwareAsync()) &&
    (await LocalAuthentication.isEnrolledAsync()) &&
    (await LocalAuthentication.getEnrolledLevelAsync()) ===
      LocalAuthentication.SecurityLevel.BIOMETRIC_STRONG
  );
}
export const useLock = create<{
  ready: boolean;
  locked: boolean;
  enabled: boolean;
  error: string | null;
  load: () => Promise<void>;
  unlock: (passcode: string) => Promise<void>;
  biometric: () => Promise<void>;
  sync: () => void;
  lock: () => void;
}>((set) => ({
  ready: false,
  locked: true,
  enabled: false,
  error: null,
  load: async () => {
    try {
      await lockCore.load();
      set({ ready: true, enabled: !!lockCore.record, locked: !!lockCore.record, error: null });
    } catch {
      set({
        error:
          'Unable to read secure app-lock settings. Your database remains intact. Retry secure storage.',
      });
    }
  },
  unlock: async (passcode) => {
    const generation = lockGeneration;
    await lockCore.check(passcode);
    if (generation === lockGeneration && AppState.currentState === 'active') set({ locked: false });
  },
  biometric: async () => {
    if (!lockCore.record?.biometric) throw new Error('Biometric unlock is disabled.');
    await authenticateBiometric(biometricsAvailable, async () => {
      try {
        return (
          (await SecureStore.getItemAsync(biometricKey, {
            requireAuthentication: true,
            authenticationPrompt: 'Unlock Pocketbook',
          })) === 'enabled'
        );
      } catch {
        return false;
      }
    });
    if (AppState.currentState === 'active') set({ locked: false });
  },
  sync: () => set({ enabled: !!lockCore.record }),
  lock: () => {
    lockGeneration++;
    set({ locked: !!lockCore.record });
  },
}));

export async function waitForForegroundAccess() {
  const allowed = () =>
    useLock.getState().ready && !useLock.getState().locked && AppState.currentState === 'active';
  if (allowed()) return;
  await new Promise<void>((resolve) => {
    const finish = () => {
      if (allowed()) {
        unsubscribe();
        listener.remove();
        resolve();
      }
    };
    const unsubscribe = useLock.subscribe(finish);
    const listener = AppState.addEventListener('change', finish);
    finish();
  });
}
