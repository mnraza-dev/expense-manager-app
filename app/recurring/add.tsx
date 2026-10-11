import { useCallback } from 'react';
import { RecurringForm } from '../../src/features/RecurringForm';
import { QueryState } from '../../src/components/QueryState';
import { Screen } from '../../src/components/ui';
import { repo } from '../../src/db/database';
import { useDatabaseQuery } from '../../src/hooks/useDatabaseQuery';
export default function AddRecurring() {
  const load = useCallback(() => repo().loans(), []);
  const query = useDatabaseQuery(load, 'ledger');
  return query.data ? (
    <RecurringForm loans={query.data} />
  ) : (
    <Screen title="New recurrence" back>
      <QueryState {...query} />
    </Screen>
  );
}
