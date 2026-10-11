import { useCallback, useState } from 'react';
import { Button, Card, Label, Screen } from '../../src/components/ui';
import { QueryState } from '../../src/components/QueryState';
import { useDatabaseQuery } from '../../src/hooks/useDatabaseQuery';
import { repo } from '../../src/db/database';
import { money } from '../../src/utils/finance';
export default function Ledger() {
  const [expanded, setExpanded] = useState<number | null>(null);
  const load = useCallback(() => repo().ledgerActivity(), []);
  const query = useDatabaseQuery(load, 'ledger');
  return (
    <Screen title="Ledger activity" subtitle="Latest 200 immutable postings and reversals" back>
      <QueryState {...query} />
      {query.data?.map((j) => (
        <Card key={j.id}>
          <Label>
            #{j.id} · {j.description}
          </Label>
          <Label small>
            {j.date} · {j.status} · {j.kind}
            {j.reversal_of ? ` · Reverses #${j.reversal_of}` : ''}
          </Label>
          <Label small>
            Posted {j.created_at}
            {j.transaction_id ? ` · Transaction #${j.transaction_id}` : ''}
          </Label>
          <Button
            secondary
            title={expanded === j.id ? 'Hide debit / credit lines' : 'Inspect debit / credit lines'}
            onPress={() => setExpanded(expanded === j.id ? null : j.id)}
          />
          {expanded === j.id && (
            <>
              {j.lines.map((l) => (
                <Label small key={l.id}>
                  {l.name} · {l.kind} · Debit {money(l.debit, l.currency)} · Credit{' '}
                  {money(l.credit, l.currency)}
                </Label>
              ))}
              <Label>
                Balanced: {money(j.lines.reduce((s, l) => s + l.debit, 0))} debits ={' '}
                {money(j.lines.reduce((s, l) => s + l.credit, 0))} credits
              </Label>
            </>
          )}
        </Card>
      ))}
      {query.data?.length === 0 && <Label>No posted journal entries yet.</Label>}
      <Label small>
        Posted journals cannot be edited. Correct transactions in their editor or reverse loan
        payments on the loan screen. Effective-date corrections restate historical totals while
        retaining posting timestamps.
      </Label>
    </Screen>
  );
}
