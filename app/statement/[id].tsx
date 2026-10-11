import { useCallback } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { Card, Label, Screen } from '../../src/components/ui';
import { QueryState } from '../../src/components/QueryState';
import { useDatabaseQuery } from '../../src/hooks/useDatabaseQuery';
import { repo } from '../../src/db/database';
import { money } from '../../src/utils/finance';
export default function Statement() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const load = useCallback(() => repo().statement(Number(id)), [id]);
  const query = useDatabaseQuery(load, 'ledger');
  const s = query.data;
  return (
    <Screen title="Card statement" subtitle="Derived from your posted ledger" back>
      <QueryState {...query} />
      {s ? (
        <>
          <Card>
            <Label>
              {s.period_start} — {s.period_end}
            </Label>
            <Label>Closing balance {money(s.closing)}</Label>
            <Label small>
              Due {s.due_date} · {s.status}
            </Label>
            <Label small>
              Minimum payment{' '}
              {s.minimum_payment === null ? 'Not supplied' : money(s.minimum_payment)}
            </Label>
          </Card>
          <Card>
            {[
              ['Opening balance', s.opening],
              ['Purchases', s.purchases],
              ['Interest', s.interest],
              ['Fees', s.fees],
              ['Payments in cycle', s.payments],
              ['Other credits / adjustments', s.credits],
              ['Payments after closing', s.paid_after],
              ['Unpaid statement balance', s.remaining],
            ].map(([name, value]) => (
              <Label key={String(name)}>
                {name}: {money(Number(value))}
              </Label>
            ))}
          </Card>
          <Label small>
            Current outstanding includes activity after this statement. Corrections restate the
            original effective period. Payments after closing reduce the carried statement balance.
            Statement snapshots include prior carried debt and must not be added together. No
            minimum or interest is estimated.
          </Label>
        </>
      ) : (
        !query.loading && !query.error && <Label>Statement not found.</Label>
      )}
    </Screen>
  );
}
