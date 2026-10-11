export type LedgerKind = 'asset' | 'liability' | 'income' | 'expense' | 'equity';
export interface LedgerLineInput {
  ledger_account_id: number;
  debit: number;
  credit: number;
  currency: string;
  description?: string;
}
export interface Journal {
  id: number;
  date: string;
  description: string;
  status: 'draft' | 'posted';
  posting_key: string;
  transaction_id: number | null;
  reversal_of: number | null;
  kind: string;
  payload: string;
  created_at: string;
}
export interface LedgerLine extends LedgerLineInput {
  id: number;
  journal_id: number;
  name: string;
  kind: LedgerKind;
}
export interface Card {
  account_id: number;
  nickname: string;
  credit_limit: number;
  closing_day: number;
  due_day: number;
  payment_account_id: number | null;
  minimum_payment: number | null;
}
export interface CardStatement {
  id: number;
  account_id: number;
  period_start: string;
  period_end: string;
  due_date: string;
  minimum_payment: number | null;
  opening: number;
  purchases: number;
  payments: number;
  credits: number;
  interest: number;
  fees: number;
  closing: number;
  paid_after: number;
  remaining: number;
  status: string;
}
export type Frequency = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';
export interface RecurringRule {
  id: number;
  type: 'expense' | 'income' | 'loan_payment';
  amount: number;
  account_id: number;
  category_id: number | null;
  loan_id: number | null;
  description: string;
  start_date: string;
  end_date: string | null;
  frequency: Frequency;
  next_index: number;
  status: 'enabled' | 'paused' | 'cancelled';
  created_at: string;
  updated_at: string;
}
export interface Occurrence {
  id: number;
  rule_id: number;
  scheduled_date: string;
  occurrence_index: number;
  status: 'scheduled' | 'completed' | 'skipped' | 'cancelled';
  transaction_id: number | null;
  loan_payment_id: number | null;
  description: string;
  amount: number;
  rule_status: string;
}
export type InterestMethod = 'none' | 'flat' | 'reducing';
export interface Loan {
  id: number;
  account_id: number;
  name: string;
  direction: 'borrowed' | 'lent';
  label: 'personal' | 'other';
  principal: number;
  start_date: string;
  annual_rate_bps: number | null;
  interest_method: InterestMethod;
  frequency: 'monthly' | 'quarterly' | 'yearly';
  term_months: number | null;
  payment_account_id: number;
  counterparty: string;
  status: 'active' | 'closed';
  category_id: number;
  origination_fees: number;
  created_at: string;
  updated_at: string;
}
export interface LoanSchedule {
  paid_principal_baseline: number;
  paid_interest_baseline: number;
  payment_id_baseline: number;
  id: number;
  loan_id: number;
  due_date: string;
  principal: number;
  interest: number;
  version: number;
  status: 'scheduled' | 'superseded';
}
export interface LoanPayment {
  id: number;
  loan_id: number;
  date: string;
  principal: number;
  interest: number;
  fees: number;
  principal_transaction_id: number | null;
  interest_transaction_id: number | null;
  fee_transaction_id: number | null;
  status: 'posted' | 'void';
  created_at: string;
}
export interface LoanDetail {
  loan: Loan;
  outstanding: number;
  interest_paid: number;
  fees_paid: number;
  payments: LoanPayment[];
  schedule: LoanSchedule[];
  overdue: number;
  next_date: string | null;
  needs_recalculation: boolean;
}
export interface NetWorth {
  date: string;
  groups: { currency: string; assets: number; liabilities: number; net: number }[];
  accounts: {
    id: number;
    name: string;
    kind: LedgerKind;
    currency: string;
    balance: number;
    history_start: string;
    historical_assumption: number;
  }[];
  incomplete: boolean;
}
