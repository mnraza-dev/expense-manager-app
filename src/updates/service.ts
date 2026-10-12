import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, Linking, Platform } from 'react-native';
import { isRunningInExpoGo } from 'expo';
import NetInfo from '@react-native-community/netinfo';
import { create } from 'zustand';
import { cloudClient, cloudConfigured } from '../cloud/client';
import { digest } from '../security/crypto';
import {
  UpdateController,
  withUpdateTimeout,
  validUpdateURL,
  type UpdatePlatform,
  type UpdateState,
} from './core';
export const useRequiredUpdate = create<UpdateState>(() => ({
  ready: false,
  checking: false,
  required: false,
  policy: null,
  error: null,
}));
let controller: UpdateController | undefined;
let starting: Promise<void> | undefined;
async function initialize() {
  if (controller) return;
  if (__DEV__ || isRunningInExpoGo() || Platform.OS === 'web' || !cloudConfigured()) {
    useRequiredUpdate.setState({ ready: true, checking: false, required: false, error: null });
    return;
  }
  let version: string | null = null,
    build: string | null = null;
  try {
    const application = await import('expo-application');
    version = application.nativeApplicationVersion;
    build = application.nativeBuildVersion;
  } catch {
    /* Unknown native versions cannot satisfy an enabled requirement. */
  }
  const platform = Platform.OS as UpdatePlatform;
  const key =
    'settler.update-policy.v1.' +
    digest(String(process.env.EXPO_PUBLIC_SUPABASE_URL) + platform).slice(0, 24);
  controller = new UpdateController(
    platform,
    { version, build },
    {
      readCache: () => AsyncStorage.getItem(key),
      writeCache: (value) => AsyncStorage.setItem(key, value),
      fetchPolicy: async () => {
        const abort = new AbortController();
        const request = cloudClient()
          .from('app_release_policy')
          .select('platform,enabled,minimum_version,minimum_build,store_url,message')
          .eq('platform', platform)
          .abortSignal(abort.signal)
          .maybeSingle();
        const response = await withUpdateTimeout(request, () => abort.abort());
        if (response.error || !response.data) throw new Error('Update policy unavailable.');
        return response.data;
      },
    },
    (state) => useRequiredUpdate.setState(state)
  );
}
export async function checkRequiredUpdate() {
  starting ??= initialize().finally(() => {
    starting = undefined;
  });
  await starting;
  await controller?.refresh();
}
export async function openRequiredUpdate() {
  const url = useRequiredUpdate.getState().policy?.store_url;
  if (!validUpdateURL(url))
    throw new Error('The update download link is unavailable. Please retry.');
  try {
    await Linking.openURL(url);
  } catch {
    throw new Error('Could not open the update page. Check your connection and retry.');
  }
}
export function startUpdateObservers() {
  void checkRequiredUpdate();
  const app = AppState.addEventListener('change', (state) => {
    if (state === 'active') void checkRequiredUpdate();
  });
  const network = NetInfo.addEventListener((state) => {
    if (state.isConnected && AppState.currentState === 'active') void checkRequiredUpdate();
  });
  const timer = setInterval(() => {
    if (AppState.currentState === 'active') void checkRequiredUpdate();
  }, 300000);
  return () => {
    app.remove();
    network();
    clearInterval(timer);
  };
}
