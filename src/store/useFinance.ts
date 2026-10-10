import { create } from 'zustand';
import type { Snapshot } from '../types';
import { initializeDatabase, repo } from '../db/database';
interface State extends Snapshot {
  ready: boolean;
  error: string | null;
  initialize: () => Promise<void>;
  refresh: () => Promise<void>;
  mutate: (task: () => Promise<unknown>) => Promise<void>;
}
export const useFinance = create<State>((set, get) => ({
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
  refresh: async () => set(await repo().snapshot()),
  mutate: async (task) => {
    await task();
    await get().refresh();
  },
}));
