import type { DueReminder } from '../typesMvp4';
import { digest } from '../security/crypto';
import { validDate } from './finance';
export interface PlannedReminder {
  identifier: string;
  at: number;
}
export function reminderPlan(
  rows: DueReminder[],
  leadDays: number,
  now = new Date()
): PlannedReminder[] {
  if (![0, 1, 3].includes(leadDays)) throw new Error('Choose a supported reminder lead time.');
  const unique = new Map<string, PlannedReminder>();
  for (const r of rows) {
    if (!validDate(r.due_date)) continue;
    const [y, m, d] = r.due_date.split('-').map(Number);
    let at = new Date(y, m - 1, d - leadDays, 9).getTime();
    if (at <= now.getTime()) at = new Date(y, m - 1, d, 9).getTime();
    if (at <= now.getTime()) continue;
    const identifier = 'settler-bill-' + digest(`${r.key}:${at}`).slice(0, 32);
    unique.set(identifier, { identifier, at });
  }
  return [...unique.values()]
    .sort((a, b) => a.at - b.at || a.identifier.localeCompare(b.identifier))
    .slice(0, 60);
}
export interface ReminderPort {
  scheduled(): Promise<string[]>;
  cancel(identifier: string): Promise<void>;
  schedule(reminder: PlannedReminder): Promise<void>;
}
export async function reconcileReminders(plan: PlannedReminder[], port: ReminderPort) {
  const existing = await port.scheduled();
  const wanted = new Set(plan.map((p) => p.identifier));
  for (const id of existing)
    if (id.startsWith('settler-bill-') && !wanted.has(id)) await port.cancel(id);
  for (const row of plan) if (!existing.includes(row.identifier)) await port.schedule(row);
}
