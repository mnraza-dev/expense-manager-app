// Derived local indexes; financial schema, backup columns and cloud records are unchanged.
export const performanceIndexes = `
CREATE INDEX IF NOT EXISTS ledger_lines_journal ON ledger_lines(journal_id);
CREATE INDEX IF NOT EXISTS transactions_entry_history ON transactions(updated_at DESC,id DESC) WHERE status='posted' AND refund_of_id IS NULL AND loan_id IS NULL;
CREATE INDEX IF NOT EXISTS transactions_receipt_match ON transactions(amount,date,account_id,id DESC) WHERE status='posted' AND type='expense' AND refund_of_id IS NULL;
`;
