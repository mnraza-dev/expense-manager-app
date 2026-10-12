import { DataRepository } from './dataRepository';
import type { BillReminder, DueReminder, GoalContribution, SavingsGoal } from '../typesMvp4';
import type { RecurringRule, CardStatement } from '../typesAdvanced';
import { localDate, MAX_MONEY, validDate } from '../utils/finance';
import { scheduledDate } from '../utils/schedules';
export class PlanningRepository extends DataRepository {
  goals() {
    return this.read(() =>
      this.db.getAllAsync<SavingsGoal>(
        `SELECT g.*,COALESCE(SUM(CASE WHEN c.direction='add' THEN c.amount ELSE -c.amount END),0) saved FROM savings_goals g LEFT JOIN goal_contributions c ON c.goal_id=g.id GROUP BY g.id ORDER BY g.archived,g.due_date IS NULL,g.due_date,g.id`
      )
    );
  }
  goal(id: number) {
    return this.read(async () => {
      const goal = await this.db.getFirstAsync<SavingsGoal>(
        `SELECT g.*,COALESCE((SELECT SUM(CASE WHEN direction='add' THEN amount ELSE -amount END) FROM goal_contributions WHERE goal_id=g.id),0) saved FROM savings_goals g WHERE g.id=?`,
        id
      );
      return goal
        ? {
            goal,
            contributions: await this.db.getAllAsync<GoalContribution>(
              'SELECT * FROM goal_contributions WHERE goal_id=? ORDER BY date DESC,id DESC',
              id
            ),
          }
        : null;
    });
  }
  saveGoal(input: Pick<SavingsGoal, 'name' | 'target_amount' | 'due_date'>, id?: number) {
    return this.write(async () => {
      this.amount(input.target_amount);
      if (
        !input.name.trim() ||
        input.name.trim().length > 100 ||
        (input.due_date !== null && !validDate(input.due_date))
      )
        throw new Error('Enter a name of up to 100 characters and a valid target date.');
      if (id && !(await this.db.getFirstAsync('SELECT id FROM savings_goals WHERE id=?', id)))
        throw new Error('Goal no longer exists.');
      const now = new Date().toISOString();
      if (id)
        await this.db.runAsync(
          'UPDATE savings_goals SET name=?,target_amount=?,due_date=?,updated_at=? WHERE id=?',
          input.name.trim(),
          input.target_amount,
          input.due_date,
          now,
          id
        );
      else
        await this.db.runAsync(
          'INSERT INTO savings_goals(name,target_amount,due_date,created_at,updated_at) VALUES (?,?,?,?,?)',
          input.name.trim(),
          input.target_amount,
          input.due_date,
          now,
          now
        );
      return (
        id ?? (await this.db.getFirstAsync<{ id: number }>('SELECT last_insert_rowid() id'))!.id
      );
    });
  }
  archiveGoal(id: number, archived: boolean) {
    return this.write(() =>
      this.db.runAsync(
        'UPDATE savings_goals SET archived=?,updated_at=? WHERE id=?',
        Number(archived),
        new Date().toISOString(),
        id
      )
    );
  }
  contribute(input: Pick<GoalContribution, 'goal_id' | 'amount' | 'direction' | 'date' | 'notes'>) {
    return this.write(() =>
      this.db.withTransactionAsync(async () => {
        this.amount(input.amount);
        if (
          !validDate(input.date) ||
          !['add', 'withdraw'].includes(input.direction) ||
          input.notes.length > 2000
        )
          throw new Error('Enter a valid contribution date and direction.');
        const goal = await this.db.getFirstAsync<{ archived: number }>(
          'SELECT archived FROM savings_goals WHERE id=?',
          input.goal_id
        );
        if (!goal || goal.archived) throw new Error('Choose an active savings goal.');
        const row = await this.db.getFirstAsync<{ saved: number }>(
          "SELECT COALESCE(SUM(CASE WHEN direction='add' THEN amount ELSE -amount END),0) saved FROM goal_contributions WHERE goal_id=?",
          input.goal_id
        );
        const saved =
          (row?.saved ?? 0) + (input.direction === 'add' ? input.amount : -input.amount);
        if (saved < 0 || saved > MAX_MONEY)
          throw new Error(
            'The earmarked balance must stay between zero and the supported amount limit.'
          );
        await this.db.runAsync(
          'INSERT INTO goal_contributions(goal_id,amount,direction,date,notes,created_at) VALUES (?,?,?,?,?,?)',
          input.goal_id,
          input.amount,
          input.direction,
          input.date,
          input.notes,
          new Date().toISOString()
        );
      })
    );
  }
  deleteContribution(id: number) {
    return this.write(() =>
      this.db.withTransactionAsync(async () => {
        const row = await this.db.getFirstAsync<GoalContribution>(
          'SELECT * FROM goal_contributions WHERE id=?',
          id
        );
        if (!row) throw new Error('Contribution no longer exists.');
        const total = await this.db.getFirstAsync<{ saved: number }>(
          "SELECT COALESCE(SUM(CASE WHEN direction='add' THEN amount ELSE -amount END),0) saved FROM goal_contributions WHERE goal_id=? AND id<>?",
          row.goal_id,
          id
        );
        if ((total?.saved ?? 0) < 0 || (total?.saved ?? 0) > MAX_MONEY)
          throw new Error('Removing this entry would make the earmarked balance invalid.');
        await this.db.runAsync('DELETE FROM goal_contributions WHERE id=?', id);
      })
    );
  }
  bills() {
    return this.read(() =>
      this.db.getAllAsync<BillReminder>('SELECT * FROM bill_reminders ORDER BY status,due_date,id')
    );
  }
  saveBill(input: Pick<BillReminder, 'name' | 'amount' | 'due_date'>, id?: number) {
    return this.write(async () => {
      this.amount(input.amount);
      if (!input.name.trim() || input.name.trim().length > 100 || !validDate(input.due_date))
        throw new Error('Enter a bill name and valid due date.');
      if (id && !(await this.db.getFirstAsync('SELECT id FROM bill_reminders WHERE id=?', id)))
        throw new Error('Bill no longer exists.');
      const now = new Date().toISOString();
      if (id)
        await this.db.runAsync(
          'UPDATE bill_reminders SET name=?,amount=?,due_date=?,updated_at=? WHERE id=?',
          input.name.trim(),
          input.amount,
          input.due_date,
          now,
          id
        );
      else
        await this.db.runAsync(
          'INSERT INTO bill_reminders(name,amount,due_date,created_at,updated_at) VALUES (?,?,?,?,?)',
          input.name.trim(),
          input.amount,
          input.due_date,
          now,
          now
        );
    });
  }
  billStatus(id: number, status: 'pending' | 'done') {
    if (!['pending', 'done'].includes(status)) throw new Error('Invalid bill status.');
    return this.write(() =>
      this.db.runAsync(
        'UPDATE bill_reminders SET status=?,updated_at=? WHERE id=?',
        status,
        new Date().toISOString(),
        id
      )
    );
  }
  deleteBill(id: number) {
    return this.write(() => this.db.runAsync('DELETE FROM bill_reminders WHERE id=?', id));
  }
  async dueReminders(today = localDate()): Promise<DueReminder[]> {
    if (!validDate(today)) throw new Error('Invalid reminder date.');
    // Statement uses the repository queue itself; do not nest queued reads.
    const data = await this.read(async () => ({
      bills: await this.db.getAllAsync<BillReminder>(
        "SELECT * FROM bill_reminders WHERE status='pending'"
      ),
      rules: await this.db.getAllAsync<RecurringRule>(
        "SELECT r.* FROM recurring_rules r JOIN accounts a ON a.id=r.account_id WHERE r.status='enabled' AND r.type<>'income' AND a.archived=0"
      ),
      handled: await this.db.getAllAsync<{ rule_id: number; scheduled_date: string }>(
        "SELECT rule_id,scheduled_date FROM recurring_occurrences WHERE status<>'scheduled'"
      ),
      statements: await this.db.getAllAsync<CardStatement>(
        'SELECT s.* FROM card_statements s JOIN accounts a ON a.id=s.account_id WHERE a.archived=0 AND s.period_end<=?',
        today
      ),
    }));
    const result: DueReminder[] = data.bills.map((b) => ({
      key: `bill:${b.id}:${b.created_at}`,
      name: b.name,
      amount: b.amount,
      due_date: b.due_date,
      source: 'bill',
      source_id: b.id,
    }));
    const [y, m, d] = today.split('-').map(Number),
      end = localDate(new Date(y, m - 1, d + 60));
    for (const r of data.rules) {
      // Start at the current horizon rather than iterating years of historical daily rules.
      const [sy, sm, sd] = r.start_date.split('-').map(Number);
      const dayDistance = Math.floor((Date.UTC(y, m - 1, d) - Date.UTC(sy, sm - 1, sd)) / 86400000);
      const months = (y - sy) * 12 + m - sm;
      const low = Math.max(
        0,
        (r.frequency === 'daily'
          ? dayDistance
          : r.frequency === 'weekly'
            ? Math.floor(dayDistance / 7)
            : Math.floor(
                months / (r.frequency === 'monthly' ? 1 : r.frequency === 'quarterly' ? 3 : 12)
              )) - 1
      );
      for (let i = low; i < low + 61; i++) {
        const date = scheduledDate(r.start_date, r.frequency, i);
        if (date < today) continue;
        if (date > end || (r.end_date && date > r.end_date)) break;
        if (data.handled.some((o) => o.rule_id === r.id && o.scheduled_date === date)) continue;
        result.push({
          key: `recurring:${r.id}:${r.created_at}:${date}`,
          name: r.description,
          amount: r.amount,
          due_date: date,
          source: 'recurring',
          source_id: r.id,
        });
      }
    }
    for (const s of data.statements) {
      const statement = await this.statement(s.id);
      if (statement && statement.remaining > 0)
        result.push({
          key: `statement:${s.id}:${s.period_end}`,
          name: 'Credit card statement',
          amount: statement.remaining,
          due_date: s.due_date,
          source: 'statement',
          source_id: s.id,
        });
    }
    return result
      .filter((r) => r.due_date <= end)
      .sort((a, b) => a.due_date.localeCompare(b.due_date) || a.key.localeCompare(b.key));
  }
}
