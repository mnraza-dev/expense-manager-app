import { create } from 'zustand';
import type { Snapshot } from '../types';
import { initializeDatabase, repo } from '../db/database';
interface State extends Snapshot {
  revision: number;
  budgetRevision: number;
  refreshError: string | null;
  mutateBudget: (task: () => Promise<unknown>) => Promise<void>;
  mutatePreference: (task: () => Promise<unknown>) => Promise<void>;
  ready: boolean;
  error: string | null;
  initialize: () => Promise<void>;
  refresh: () => Promise<void>;
  mutate: (task: () => Promise<unknown>) => Promise<void>;
}
export const useFinance = create<State>((set, get) => ({
  revision: 0,
  budgetRevision: 0,
  refreshError: null,
  accounts: [],
  categories: [],
  transactions: [],
  settings: {},
  ready: false,
  error: null,
  initialize: async () => {
    set({ error: null });
    try {
      await initializeDatabase();
      await get().refresh();
      set({ ready: true });
    } catch {
      set({
        error:
          'Unable to open your local database. Your records have not been removed. Please retry.',
      });
    }
  },
  refresh: async () => set({ ...(await repo().snapshot()), refreshError: null }),
  mutate: async (task) => {
    await task();
    set((s) => ({ revision: s.revision + 1 }));
    try {
      await get().refresh();
    } catch {
      set({
        refreshError:
          'Your change was saved locally, but this view could not refresh. Retry to show the latest records.',
      });
    }
  },
  mutatePreference: async (task) => {
    await task();
    try {
      set({ settings: await repo().settingsSnapshot() });
    } catch {
      set({
        refreshError: 'Your preference was saved locally, but could not refresh. Please retry.',
      });
    }
  },
  mutateBudget: async (task) => {
    await task();
    set((s) => ({ budgetRevision: s.budgetRevision + 1 }));
  },
}));
