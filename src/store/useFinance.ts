import { initializeDatabase, repo } from '../db/database';
import { createFinanceStore } from './financeStore';
export const useFinance = createFinanceStore({
  initialize: initializeDatabase,
  snapshot: () => repo().referenceSnapshot(),
  settings: () => repo().settingsSnapshot(),
});
