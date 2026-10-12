export interface SavingsGoal {
  id: number;
  name: string;
  target_amount: number;
  due_date: string | null;
  archived: number;
  created_at: string;
  updated_at: string;
  saved: number;
}
export interface GoalContribution {
  id: number;
  goal_id: number;
  amount: number;
  direction: 'add' | 'withdraw';
  date: string;
  notes: string;
  created_at: string;
}
export interface BillReminder {
  id: number;
  name: string;
  amount: number;
  due_date: string;
  status: 'pending' | 'done';
  created_at: string;
  updated_at: string;
}
export interface DueReminder {
  key: string;
  name: string;
  amount: number;
  due_date: string;
  source: 'bill' | 'recurring' | 'statement';
  source_id: number;
}
