import { useCallback, useState } from 'react';
import { useRouter } from 'expo-router';
import { Button, Card, Choices, Empty, Label, Screen, confirm } from '../../src/components/ui';
import { QueryState } from '../../src/components/QueryState';
import { useDatabaseQuery } from '../../src/hooks/useDatabaseQuery';
import { repo } from '../../src/db/database';
import { useFinance } from '../../src/store/useFinance';
import { localDate, money } from '../../src/utils/finance';
import { scheduledDate } from '../../src/utils/schedules';
export default function Recurring() {
  const router = useRouter();
  const mutate = useFinance((s) => s.mutate);
  const [mode, setMode] = useState('upcoming');
  const load = useCallback(() => repo().recurring(), []);
  const query = useDatabaseQuery(load, 'ledger');
  const data = query.data;
  return (
    <Screen
      title="Recurring transactions"
      subtitle="Scheduled first. Posted only when confirmed."
      back
      action={() => router.push('/recurring/add')}>
      <QueryState {...query} />
      <Choices
        label="View"
        value={mode}
        onChange={setMode}
        options={[
          { value: 'upcoming', label: 'Upcoming & overdue' },
          { value: 'rules', label: 'Rules' },
          { value: 'history', label: 'History' },
        ]}
      />
      {data &&
        mode === 'rules' &&
        data.rules.map((r) => (
          <Card key={r.id}>
            <Label>{r.description}</Label>
            <Label small>
              {r.frequency} · {money(r.amount)} · {r.status}
            </Label>
            <Label small>
              Next ungenerated date {scheduledDate(r.start_date, r.frequency, r.next_index)}
            </Label>
            <Button
              secondary
              title="Edit future amount / account / category"
              onPress={() => router.push({ pathname: '/recurring/[id]', params: { id: r.id } })}
            />
            {r.status !== 'cancelled' && (
              <>
                <Button
                  secondary
                  title={r.status === 'paused' ? 'Resume' : 'Pause'}
                  onPress={() =>
                    confirm(
                      'Change recurrence status?',
                      'Completed financial records remain unchanged.',
                      () =>
                        mutate(() =>
                          repo().recurringStatus(r.id, r.status === 'paused' ? 'enabled' : 'paused')
                        )
                    )
                  }
                />
                <Button
                  danger
                  title="Cancel recurrence"
                  onPress={() =>
                    confirm(
                      'Cancel recurrence?',
                      'Pending occurrences will be cancelled. Completed postings remain in your history.',
                      () => mutate(() => repo().recurringStatus(r.id, 'cancelled'))
                    )
                  }
                />
              </>
            )}
          </Card>
        ))}
      {data &&
        mode !== 'rules' &&
        data.occurrences
          .filter((o) => (mode === 'history' ? o.status !== 'scheduled' : o.status === 'scheduled'))
          .map((o) => (
            <Card key={o.id}>
              <Label>
                {o.description} · {money(o.amount)}
              </Label>
              <Label small>
                {o.scheduled_date} · {o.status} · {o.rule_status}
                {o.status === 'scheduled' && o.scheduled_date < localDate()
                  ? ' · Overdue reminder'
                  : ''}
              </Label>
              {o.status === 'scheduled' && o.rule_status === 'enabled' && (
                <>
                  {o.scheduled_date <= localDate() && (
                    <Button
                      title="Confirm & post once"
                      onPress={() =>
                        confirm(
                          'Post scheduled occurrence?',
                          'This will record the configured financial event on its scheduled date.',
                          () => mutate(() => repo().occurrenceAction(o.id, 'confirm'))
                        )
                      }
                    />
                  )}
                  <Button
                    secondary
                    title="Skip occurrence"
                    onPress={() =>
                      confirm('Skip occurrence?', 'No financial transaction will be posted.', () =>
                        mutate(() => repo().occurrenceAction(o.id, 'skip'))
                      )
                    }
                  />
                </>
              )}
            </Card>
          ))}
      {data?.rules.length === 0 && (
        <Empty
          title="No recurring rules"
          detail="Create a salary, rent, subscription or other schedule. Nothing posts automatically."
        />
      )}
      <Button secondary title="Refresh / load next missed-schedule batch" onPress={query.retry} />
    </Screen>
  );
}
