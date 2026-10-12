import { create } from 'zustand';
import type { ReferenceSnapshot } from '../types';
export interface FinanceState extends ReferenceSnapshot {
  revision: number;
  budgetRevision: number;
  planningRevision: number;
  refreshError: string | null;
  ready: boolean;
  error: string | null;
  initialize: () => Promise<void>;
  refresh: () => Promise<void>;
  mutate: (task: () => Promise<unknown>, scope?: 'ledger' | 'all') => Promise<void>;
  mutateBudget: (task: () => Promise<unknown>) => Promise<void>;
  mutatePlanning: (task: () => Promise<unknown>) => Promise<void>;
  mutatePreference: (task: () => Promise<unknown>) => Promise<void>;
}
export interface FinanceSource {
  initialize: () => Promise<unknown>;
  snapshot: () => Promise<ReferenceSnapshot>;
  settings: () => Promise<Record<string, string>>;
}
function equalRow<T extends object>(a: T, b: T) {
  const keys = Object.keys(a) as (keyof T)[];
  return keys.length === Object.keys(b).length && keys.every((k) => a[k] === b[k]);
}
function retainRows<T extends { id: number }>(previous: T[], next: T[]): T[] {
  const byId = new Map(previous.map((row) => [row.id, row]));
  const rows = next.map((row) => {
    const old = byId.get(row.id);
    return old && equalRow(old, row) ? old : row;
  });
  return rows.length === previous.length && rows.every((row, i) => row === previous[i])
    ? previous
    : rows;
}
export function createFinanceStore(source: FinanceSource) {
  let request = 0;
  return create<FinanceState>((set, get) => ({
    revision: 0,
    budgetRevision: 0,
    planningRevision: 0,
    refreshError: null,
    accounts: [],
    categories: [],
    templates: [],
    transactionCount: 0,
    settings: {},
    ready: false,
    error: null,
    initialize: async () => {
      set({ error: null });
      try {
        await source.initialize();
        await get().refresh();
        set({ ready: true });
      } catch {
        set({
          error:
            'Unable to open your local database. Your records have not been removed. Please retry.',
        });
      }
    },
    refresh: async () => {
      const token = ++request;
      let data: ReferenceSnapshot;
      try {
        data = await source.snapshot();
      } catch (error) {
        if (token !== request) return;
        throw error;
      }
      if (token !== request) return;
      set((state) => ({
        ...data,
        accounts: retainRows(state.accounts, data.accounts),
        categories: retainRows(state.categories, data.categories),
        templates: retainRows(state.templates, data.templates),
        settings: equalRow(state.settings, data.settings) ? state.settings : data.settings,
        refreshError: null,
      }));
    },
    mutate: async (task, scope = 'ledger') => {
      await task();
      set((s) => ({
        revision: s.revision + 1,
        ...(scope === 'all'
          ? { planningRevision: s.planningRevision + 1, budgetRevision: s.budgetRevision + 1 }
          : {}),
      }));
      try {
        await get().refresh();
      } catch {
        set({
          refreshError:
            'Your change was saved locally, but this view could not refresh. Retry to show the latest records.',
        });
      }
    },
    mutateBudget: async (task) => {
      await task();
      set((s) => ({ budgetRevision: s.budgetRevision + 1 }));
    },
    mutatePlanning: async (task) => {
      await task();
      set((s) => ({ planningRevision: s.planningRevision + 1 }));
    },
    mutatePreference: async (task) => {
      await task();
      try {
        const settings = await source.settings();
        set((s) => ({ settings: equalRow(s.settings, settings) ? s.settings : settings }));
      } catch {
        set({
          refreshError: 'Your preference was saved locally, but could not refresh. Please retry.',
        });
      }
    },
  }));
}
