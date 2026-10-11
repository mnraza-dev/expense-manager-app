import { AppState } from 'react-native';
import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';
import { cloudClient, cloudConfigured } from './client';
export const useCloudAuth = create<{
  session: Session | null;
  ready: boolean;
  error: string | null;
  initialize: () => Promise<void>;
  signOut: () => Promise<void>;
}>((set) => ({
  session: null,
  ready: false,
  error: null,
  initialize: async () => {
    if (!cloudConfigured()) {
      set({ ready: true });
      return;
    }
    try {
      const client = cloudClient();
      const result = await client.auth.getSession();
      if (result.error) throw result.error;
      set({ session: result.data.session, ready: true, error: null });
    } catch {
      set({
        ready: true,
        error:
          'Cloud authentication is unavailable. Local records remain accessible; retry sign in.',
      });
    }
  },
  signOut: async () => {
    const result = await cloudClient().auth.signOut({ scope: 'local' });
    if (result.error) throw result.error;
    set({ session: null });
  },
}));
let cleanup: (() => void) | null = null;
export function startCloudAuth() {
  if (cleanup || !cloudConfigured()) return () => {};
  let client;
  try {
    client = cloudClient();
  } catch {
    useCloudAuth.setState({
      ready: true,
      error: 'Cloud configuration is invalid. Local finance remains available.',
    });
    return () => {};
  }
  const { data } = client.auth.onAuthStateChange((_event, session) => {
    useCloudAuth.setState({ session, ready: true });
  });
  const listener = AppState.addEventListener('change', (state) => {
    if (state === 'active') client.auth.startAutoRefresh();
    else client.auth.stopAutoRefresh();
  });
  if (AppState.currentState === 'active') client.auth.startAutoRefresh();
  void useCloudAuth.getState().initialize();
  cleanup = () => {
    data.subscription.unsubscribe();
    listener.remove();
    client.auth.stopAutoRefresh();
    cleanup = null;
  };
  return cleanup;
}
export async function verifiedOwner() {
  const { data, error } = await cloudClient().auth.getUser();
  if (error || !data.user)
    throw new Error('Sign in again to access cloud services. Local data has not been removed.');
  return data.user.id;
}
