import AsyncStorage from '@react-native-async-storage/async-storage';
import type * as NotificationsAPI from 'expo-notifications';
import { AppState, Platform } from 'react-native';
import { create } from 'zustand';
import { repo } from '../db/database';
import { useFinance } from '../store/useFinance';
import { reminderPlan, reconcileReminders } from '../utils/reminderPlan';
let notificationModule: Promise<typeof NotificationsAPI> | undefined;
function notifications() {
  return (notificationModule ??= import('expo-notifications').catch((error) => {
    notificationModule = undefined;
    throw error;
  }));
}
const KEY = 'settler-device-reminders-v1';
export const useReminders = create<{
  enabled: boolean;
  leadDays: number;
  ready: boolean;
  error: string | null;
  scheduled: number;
}>(() => ({ enabled: false, leadDays: 1, ready: false, error: null, scheduled: 0 }));
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(task: () => Promise<T>): Promise<T> {
  const next = queue.then(task);
  queue = next.catch(() => {});
  return next;
}
const port = {
  scheduled: async () =>
    (await (await notifications()).getAllScheduledNotificationsAsync()).map((n) => n.identifier),
  cancel: async (identifier: string) =>
    (await notifications()).cancelScheduledNotificationAsync(identifier),
  schedule: async ({ identifier, at }: { identifier: string; at: number }) => {
    const Notifications = await notifications();
    await Notifications.scheduleNotificationAsync({
      identifier,
      content: {
        title: 'Settler reminder',
        body: 'You have an upcoming payment. Open Settler to review your bills.',
        sound: 'default',
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: new Date(at),
        channelId: 'settler-bills',
      },
    });
  },
};
async function reconcile() {
  try {
    if (Platform.OS === 'web')
      throw new Error('Payment notifications require the Android or iOS app.');
    const Notifications = await notifications();
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
    const state = useReminders.getState();
    const permission = await Notifications.getPermissionsAsync();
    const permitted =
      permission.granted ||
      permission.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
    const plan =
      state.enabled && permitted ? reminderPlan(await repo().dueReminders(), state.leadDays) : [];
    await reconcileReminders(plan, port);
    useReminders.setState({
      scheduled: plan.length,
      error:
        state.enabled && !permitted
          ? 'Notifications are disabled in device settings. Bills remain available here.'
          : null,
    });
  } catch {
    useReminders.setState({
      error:
        'Could not update device reminders. Rebuild the native app if needed, check notification permissions and retry.',
      scheduled: 0,
    });
  }
}
export function refreshReminders() {
  return serial(reconcile);
}
export function configureReminders(enabled: boolean, leadDays = useReminders.getState().leadDays) {
  return serial(async () => {
    if (![0, 1, 3].includes(leadDays)) throw new Error('Choose a supported reminder lead time.');
    if (enabled) {
      const Notifications = await notifications();
      if (Platform.OS === 'web') throw new Error('Notifications require the Android or iOS app.');
      if (Platform.OS === 'android')
        await Notifications.setNotificationChannelAsync('settler-bills', {
          name: 'Payment reminders',
          importance: Notifications.AndroidImportance.DEFAULT,
          lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
        });
      const p = await Notifications.requestPermissionsAsync();
      if (!p.granted && p.ios?.status !== Notifications.IosAuthorizationStatus.PROVISIONAL)
        throw new Error('Allow notifications in device settings to receive payment reminders.');
    }
    await AsyncStorage.setItem(KEY, JSON.stringify({ enabled, leadDays }));
    useReminders.setState({ enabled, leadDays, error: null });
    await reconcile();
  });
}
export function startReminderObservers() {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      if (!stopped && AppState.currentState === 'active') void refreshReminders();
    }, 300);
  };
  void serial(async () => {
    try {
      const raw = await AsyncStorage.getItem(KEY),
        value = raw ? JSON.parse(raw) : {};
      if (!stopped)
        useReminders.setState({
          enabled: value.enabled === true,
          leadDays: [0, 1, 3].includes(value.leadDays) ? value.leadDays : 1,
          ready: true,
        });
    } catch {
      if (!stopped)
        useReminders.setState({
          ready: true,
          error: 'Could not load device reminder preferences. Retry.',
        });
    }
    if (!stopped) await reconcile();
  });
  const off = useFinance.subscribe((s, p) => {
    if (s.revision !== p.revision || s.budgetRevision !== p.budgetRevision) schedule();
  });
  const app = AppState.addEventListener('change', (s) => {
    if (s === 'active') schedule();
  });
  const interval = setInterval(schedule, 3600000);
  return () => {
    stopped = true;
    off();
    app.remove();
    clearInterval(interval);
    if (timer) clearTimeout(timer);
  };
}
