import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { secureSessionStorage } from './sessionStorage';
import { cloudAccountsAvailable, publicReleaseAuth } from '../release/features';
const sessionStorage = secureSessionStorage(
  AsyncStorage,
  {
    getItem: SecureStore.getItemAsync,
    setItem: (name, value) =>
      SecureStore.setItemAsync(name, value, {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      }),
    removeItem: SecureStore.deleteItemAsync,
  },
  Crypto.getRandomBytes
);
const url = process.env.EXPO_PUBLIC_SUPABASE_URL,
  key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
let client: SupabaseClient | null = null;
let releaseClient: SupabaseClient | null = null;
export function updateBackendConfigured() {
  return !!url && !!key;
}
export function cloudConfigured() {
  return cloudAccountsAvailable(updateBackendConfigured());
}
function backendConfiguration() {
  if (!url || !key)
    throw new Error(
      'Cloud is not configured. Add the project URL and public publishable key from .env.example. Local finance remains available.'
    );
  if (!url.startsWith('https://')) throw new Error('Cloud requires an HTTPS Supabase URL.');
  if (key.startsWith('sb_secret_'))
    throw new Error('A privileged secret cannot be used in the mobile app.');
  if (key.split('.').length === 3) {
    let role;
    try {
      role = JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).role;
    } catch {
      throw new Error('Invalid public Supabase key.');
    }
    if (role !== 'anon') throw new Error('Privileged Supabase keys are not permitted in this app.');
  }
  return { url, key };
}
export function cloudClient() {
  if (!cloudConfigured()) throw new Error('Online accounts are disabled in this local release.');
  const backend = backendConfiguration();
  if (!client)
    client = createClient(backend.url, backend.key, {
      auth: {
        storage: sessionStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
        flowType: 'pkce',
      },
    });
  return client;
}
// Minimum-version metadata is public. This client never loads saved Auth sessions.
export function publicReleaseClient() {
  const backend = backendConfiguration();
  releaseClient ??= createClient(backend.url, backend.key, { auth: { ...publicReleaseAuth } });
  return releaseClient;
}
export const authRedirect = 'pocketbook://cloud/callback';
