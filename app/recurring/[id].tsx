import { useCallback } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { RecurringForm } from '../../src/features/RecurringForm';
import { QueryState } from '../../src/components/QueryState';
import { Label, Screen } from '../../src/components/ui';
import { repo } from '../../src/db/database';
import { useDatabaseQuery } from '../../src/hooks/useDatabaseQuery';
export default function EditRecurring() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const load = useCallback(
    async () => ({ recurring: await repo().recurring(), loans: await repo().loans() }),
    []
  );
  const query = useDatabaseQuery(load, 'ledger');
  const rule = query.data?.recurring.rules.find((r) => r.id === Number(id));
  return rule ? (
    <RecurringForm rule={rule} loans={query.data!.loans} />
  ) : (
    <Screen title="Edit recurrence" back>
      <QueryState {...query} />
      {query.data && !rule && <Label>Rule not found.</Label>}
    </Screen>
  );
}
