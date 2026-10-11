import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import { gcm } from '@noble/ciphers/aes.js';
import { digest } from '../security/crypto';
const sessionStorage = {
  async getItem(name: string) {
    const envelope = await AsyncStorage.getItem(name);
    if (!envelope) return null;
    const key = await SecureStore.getItemAsync('session.' + digest(name));
    if (!key) throw new Error('Secure session key is unavailable. Sign in again.');
    const e = JSON.parse(envelope);
    return new TextDecoder().decode(
      gcm(hexToBytes(key), hexToBytes(e.nonce)).decrypt(hexToBytes(e.ciphertext))
    );
  },
  async setItem(name: string, value: string) {
    const keyName = 'session.' + digest(name);
    let key = await SecureStore.getItemAsync(keyName);
    if (!key) {
      key = bytesToHex(Crypto.getRandomBytes(32));
      await SecureStore.setItemAsync(keyName, key, {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      });
    }
    const nonce = Crypto.getRandomBytes(12);
    await AsyncStorage.setItem(
      name,
      JSON.stringify({
        nonce: bytesToHex(nonce),
        ciphertext: bytesToHex(gcm(hexToBytes(key), nonce).encrypt(utf8ToBytes(value))),
      })
    );
  },
  async removeItem(name: string) {
    await AsyncStorage.removeItem(name);
    await SecureStore.deleteItemAsync('session.' + digest(name));
  },
};
const url = process.env.EXPO_PUBLIC_SUPABASE_URL,
  key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
let client: SupabaseClient | null = null;
export function cloudConfigured() {
  return !!url && !!key;
}
export function cloudClient() {
  if (!url || !key)
    throw new Error(
      'Cloud is not configured. Add the project URL and public publishable key from .env.example. Local finance remains available.'
    );
  if (!url.startsWith('https://')) throw new Error('Cloud requires an HTTPS Supabase URL.');
  if (key.startsWith('sb_secret_'))
    throw new Error('A privileged secret cannot be used in the mobile app.');
  if (!client)
    client = createClient(url, key, {
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
export const authRedirect = 'pocketbook://cloud/callback';
