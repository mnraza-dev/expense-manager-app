import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useFinance } from '../store/useFinance';
import {
  beginDatabaseQuery,
  databaseQueryView,
  type DatabaseQueryState,
} from '../utils/databaseQueryState';
type Scope = 'ledger' | 'budget' | 'planning';
export function useDatabaseQuery<T>(
  load: () => Promise<T>,
  scope: Scope | 'both' | Scope[] = 'both',
  { keepPreviousData = false }: { keepPreviousData?: boolean } = {}
) {
  const ledger = useFinance((s) => s.revision),
    budgets = useFinance((s) => s.budgetRevision),
    planning = useFinance((s) => s.planningRevision);
  const scopes = Array.isArray(scope) ? scope : scope === 'both' ? ['ledger', 'budget'] : [scope];
  const revision = scopes.includes('ledger') ? ledger : 0,
    budgetRevision = scopes.includes('budget') ? budgets : 0,
    planningRevision = scopes.includes('planning') ? planning : 0;
  const [retryKey, setRetryKey] = useState(0);
  const [state, setState] = useState<DatabaseQueryState<T>>({
    key: load,
    dataKey: null,
    data: undefined,
    pending: true,
    error: null,
  });
  useFocusEffect(
    useCallback(() => {
      let active = true;
      setState((previous) => beginDatabaseQuery(previous, load, keepPreviousData));
      Promise.resolve()
        .then(load)
        .then((data) => {
          if (active) setState({ key: load, dataKey: load, data, pending: false, error: null });
        })
        .catch(() => {
          if (active)
            setState((previous) => ({
              ...beginDatabaseQuery(previous, load, keepPreviousData),
              pending: false,
              error: 'Unable to load local records. Please retry.',
            }));
        });
      return () => {
        active = false;
      };
      // Revisions invalidate only selected domains. Keeping a previous query is explicit and labeled.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [load, revision, budgetRevision, planningRevision, retryKey, keepPreviousData])
  );
  return {
    ...databaseQueryView(state, load, keepPreviousData),
    retry: () => setRetryKey((n) => n + 1),
  };
}
