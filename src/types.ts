export type TransactionType = 'expense' | 'income' | 'transfer';
export type AccountType = 'cash' | 'bank' | 'savings' | 'wallet' | 'other';
export interface Account {
  kind?: 'asset' | 'liability';
  subtype?: string;
  ledger_balance?: number;
  history_start?: string;
  id: number;
  name: string;
  type: AccountType;
  opening_balance: number;
  currency: string;
  description: string;
  archived: number;
  created_at: string;
  updated_at: string;
}
export interface Category {
  id: number;
  name: string;
  type: 'expense' | 'income';
  icon: string;
  color: string;
  archived: number;
  created_at: string;
  updated_at: string;
}
export interface Transaction {
  status?: 'posted' | 'void';
  component?: 'standard' | 'interest' | 'fee' | 'principal';
  loan_id?: number | null;
  id: number;
  type: TransactionType;
  amount: number;
  account_id: number;
  destination_account_id: number | null;
  category_id: number | null;
  description: string;
  date: string;
  notes: string;
  created_at: string;
  updated_at: string;
}
export interface Snapshot {
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  settings: Record<string, string>;
}

export interface DateRange {
  start: string;
  end: string;
}
export interface Budget {
  id: number;
  name: string;
  period_type: 'monthly';
  period_start: string;
  period_end: string;
  total_limit_minor: number;
  currency_code: string;
  created_at: string;
  updated_at: string;
}
export interface BudgetAllocation {
  id: number;
  budget_id: number;
  category_id: number;
  limit_minor: number;
  created_at: string;
  updated_at: string;
}
export interface BudgetInput {
  name: string;
  month: string;
  total_limit_minor: number;
  allocations: { category_id: number; limit_minor: number }[];
}
export interface CategoryTotal {
  id: number;
  name: string;
  color: string;
  type: 'income' | 'expense';
  amount: number;
}
export interface PeriodTotal {
  period: string;
  income: number;
  expense: number;
  count: number;
}
export interface CategoryMonth {
  period: string;
  category_id: number;
  name: string;
  amount: number;
}
export interface BudgetComparison {
  budget_id: number;
  month: string;
  category_id: number;
  name: string;
  color: string;
  allocated: number;
  spent: number;
}
export interface Report {
  range: DateRange;
  income: number;
  expense: number;
  net: number;
  count: number;
  days: number;
  dailyAverage: number;
  categories: CategoryTotal[];
  periods: PeriodTotal[];
  categoryMonths: CategoryMonth[];
  highestDays: { date: string; amount: number }[];
  recent: Transaction[];
  budgetComparisons: BudgetComparison[];
}
export interface BudgetDetail {
  budget: Budget;
  allocations: BudgetAllocation[];
}
export interface BudgetProgress {
  budget: Budget | null;
  spent: number;
  categories: (BudgetComparison & { archived: number })[];
  unbudgeted: CategoryTotal[];
}
export type TransactionSort = 'newest' | 'oldest' | 'highest' | 'lowest';
export interface TransactionFilters {
  query?: string;
  type?: TransactionType;
  account_id?: number;
  category_id?: number;
  start?: string;
  end?: string;
  min_amount?: number;
  max_amount?: number;
  sort?: TransactionSort;
}
export interface TransactionPage {
  rows: Transaction[];
  count: number;
}
