import { useCallback, useState } from 'react';
import { Linking } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Button,
  Card,
  Choices,
  Empty,
  Label,
  Screen,
  confirm,
  showError,
} from '../../src/components/ui';
import { AdvancedForm } from '../../src/components/AdvancedForm';
import { QueryState } from '../../src/components/QueryState';
import { useDatabaseQuery } from '../../src/hooks/useDatabaseQuery';
import { repo } from '../../src/db/database';
import { useFinance } from '../../src/store/useFinance';
import { localDate, minor, money } from '../../src/utils/finance';
import { configureReminders, refreshReminders, useReminders } from '../../src/services/reminders';
import type { BillReminder } from '../../src/typesMvp4';
export default function Bills() {
  const router = useRouter(),
    mutate = useFinance((s) => s.mutate),
    notification = useReminders();
  const [form, setForm] = useState<BillReminder | 'new' | null>(null),
    [busy, setBusy] = useState(false);
  const query = useDatabaseQuery(
    useCallback(
      async () => ({ bills: await repo().bills(), due: await repo().dueReminders() }),
      []
    ),
    'ledger'
  );
  const configure = async (enabled: boolean, lead = notification.leadDays) => {
    if (busy) return;
    setBusy(true);
    try {
      await configureReminders(enabled, lead);
    } catch (e) {
      showError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Screen
      title="Bills & reminders"
      subtitle="Upcoming payments, all in one place"
      back
      action={() => setForm('new')}>
      <Card>
        <Label>Device notifications</Label>
        <Label small>
          Reminders arrive at 9 AM in device local time. Notification text hides bill names and
          amounts. Nothing is paid or posted automatically.
        </Label>
        <Button
          secondary
          title={notification.enabled ? 'Turn off notifications' : 'Enable payment notifications'}
          busy={busy}
          disabled={!notification.ready}
          onPress={() => void configure(!notification.enabled)}
        />
        <Choices
          label="Remind me"
          value={notification.leadDays}
          options={[
            { value: 0, label: 'On due date' },
            { value: 1, label: '1 day before' },
            { value: 3, label: '3 days before' },
          ]}
          onChange={(lead) => {
            if (!busy) void configure(notification.enabled, lead);
          }}
        />
        {notification.error && (
          <>
            <Label small>{notification.error}</Label>
            <Button
              secondary
              title="Open device settings"
              onPress={() => void Linking.openSettings().catch(showError)}
            />
            <Button
              secondary
              title="Retry reminder scheduling"
              onPress={() => void refreshReminders()}
            />
          </>
        )}
        {notification.enabled && (
          <Label small>
            {notification.scheduled} upcoming notifications scheduled. Up to 60 are kept; open
            Settler periodically to refresh them.
          </Label>
        )}
      </Card>
      {form && (
        <Card>
          <Label>{form === 'new' ? 'New bill reminder' : 'Edit bill reminder'}</Label>
          <AdvancedForm
            key={form === 'new' ? 'new' : form.id}
            fields={[
              { name: 'name', label: 'Bill name' },
              { name: 'amount', label: 'Expected amount (₹)', kind: 'amount' },
              { name: 'date', label: 'Due date', kind: 'date' },
            ]}
            defaults={{
              name: form === 'new' ? '' : form.name,
              amount: form === 'new' ? '' : (form.amount / 100).toFixed(2),
              date: form === 'new' ? localDate() : form.due_date,
            }}
            cancel={() => setForm(null)}
            onSubmit={async (v) => {
              await mutate(() =>
                repo().saveBill(
                  { name: v.name, amount: minor(v.amount), due_date: v.date },
                  form === 'new' ? undefined : form.id
                )
              );
              setForm(null);
            }}
          />
        </Card>
      )}
      <QueryState {...query} />
      <Label>Upcoming payments · next 60 days</Label>
      <Label small>
        Includes pending bills, enabled expense/loan recurrences and unpaid generated card
        statements. Overdue manual bills and statements remain visible.
      </Label>
      {query.data?.due.length === 0 && (
        <Empty
          title="No upcoming payments"
          detail="Add a bill, set up a recurring payment or generate a card statement."
        />
      )}
      {query.data?.due.map((r) => (
        <Card key={r.key}>
          <Label>
            {r.name} · {money(r.amount)}
          </Label>
          <Label small>
            {r.due_date}
            {r.due_date < localDate() ? ' · Overdue' : ''} · {r.source}
          </Label>
          {r.source === 'bill' ? (
            <Button
              secondary
              title="Mark handled"
              onPress={() =>
                confirm(
                  'Mark bill handled?',
                  'This dismisses its reminder. Record any payment separately in Transactions.',
                  () => mutate(() => repo().billStatus(r.source_id, 'done'))
                )
              }
            />
          ) : (
            <Button
              secondary
              title={r.source === 'recurring' ? 'Review recurring payment' : 'View card statement'}
              onPress={() =>
                r.source === 'recurring'
                  ? router.push('/recurring')
                  : router.push({ pathname: '/statement/[id]', params: { id: r.source_id } })
              }
            />
          )}
        </Card>
      ))}
      <Label>All manual bills</Label>
      {query.data?.bills.map((b) => (
        <Card key={b.id}>
          <Label>
            {b.name} · {money(b.amount)}
          </Label>
          <Label small>
            {b.due_date} · {b.status === 'done' ? 'Handled' : 'Pending'}
          </Label>
          <Button secondary title="Edit bill" onPress={() => setForm(b)} />
          {b.status === 'done' && (
            <Button
              secondary
              title="Reopen reminder"
              onPress={() => void mutate(() => repo().billStatus(b.id, 'pending')).catch(showError)}
            />
          )}
          <Button
            danger
            title="Delete reminder"
            onPress={() =>
              confirm('Delete reminder?', 'This removes only the reminder.', () =>
                mutate(() => repo().deleteBill(b.id))
              )
            }
          />
        </Card>
      ))}
      <Button secondary title="Recurring payments" onPress={() => router.push('/recurring')} />
      <Button secondary title="Cards & statements" onPress={() => router.push('/card')} />
    </Screen>
  );
}
