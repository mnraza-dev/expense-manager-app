import { syncTriggers } from '../cloud/localSchema';
export const mvp4Migration =
  `
ALTER TABLE transactions ADD COLUMN refund_of_id INTEGER REFERENCES transactions(id) ON DELETE RESTRICT;
CREATE INDEX transaction_refunds ON transactions(refund_of_id,status);
CREATE TABLE expense_splits(id INTEGER PRIMARY KEY AUTOINCREMENT,transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE RESTRICT,category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,amount INTEGER NOT NULL CHECK(typeof(amount)='integer' AND amount>0 AND amount<=1000000000000),UNIQUE(transaction_id,category_id));
CREATE TRIGGER split_category_insert BEFORE INSERT ON expense_splits WHEN (SELECT type FROM categories WHERE id=NEW.category_id)<>'expense' OR (SELECT type FROM transactions WHERE id=NEW.transaction_id)<>'expense' BEGIN SELECT RAISE(ABORT,'Splits require expense transactions and categories'); END;
CREATE TRIGGER split_category_update BEFORE UPDATE ON expense_splits WHEN (SELECT type FROM categories WHERE id=NEW.category_id)<>'expense' OR (SELECT type FROM transactions WHERE id=NEW.transaction_id)<>'expense' BEGIN SELECT RAISE(ABORT,'Splits require expense transactions and categories'); END;
CREATE TRIGGER split_category_preserve BEFORE UPDATE OF type ON categories WHEN NEW.type<>'expense' AND EXISTS(SELECT 1 FROM expense_splits WHERE category_id=OLD.id) BEGIN SELECT RAISE(ABORT,'Category has split expenses'); END;
CREATE TABLE savings_goals(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 100),target_amount INTEGER NOT NULL CHECK(typeof(target_amount)='integer' AND target_amount>0 AND target_amount<=1000000000000),due_date TEXT CHECK(due_date IS NULL OR length(due_date)=10),archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0,1)),created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE goal_contributions(id INTEGER PRIMARY KEY AUTOINCREMENT,goal_id INTEGER NOT NULL REFERENCES savings_goals(id) ON DELETE CASCADE,amount INTEGER NOT NULL CHECK(typeof(amount)='integer' AND amount>0 AND amount<=1000000000000),direction TEXT NOT NULL CHECK(direction IN ('add','withdraw')),date TEXT NOT NULL CHECK(length(date)=10),notes TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL);
CREATE INDEX contributions_goal ON goal_contributions(goal_id,date);
CREATE TABLE bill_reminders(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 100),amount INTEGER NOT NULL CHECK(typeof(amount)='integer' AND amount>0 AND amount<=1000000000000),due_date TEXT NOT NULL CHECK(length(due_date)=10),status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','done')),created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
DROP VIEW active_transactions;
CREATE VIEW active_transactions AS SELECT t.*,CASE WHEN refund_of_id IS NULL THEN amount ELSE -amount END effective_amount,(SELECT count(*) FROM expense_splits WHERE transaction_id=t.id) split_count FROM transactions t WHERE status='posted';
CREATE VIEW category_activity AS
SELECT t.id transaction_id,t.date,t.type,t.category_id,t.effective_amount amount FROM active_transactions t WHERE t.type IN ('expense','income') AND t.split_count=0
UNION ALL SELECT t.id,t.date,t.type,s.category_id,CASE WHEN t.refund_of_id IS NULL THEN s.amount ELSE -s.amount END FROM active_transactions t JOIN expense_splits s ON s.transaction_id=t.id;
CREATE VIEW expected_transaction_lines AS
SELECT t.id transaction_id,a.id ledger_account_id,CASE WHEN t.type='income' OR t.refund_of_id IS NOT NULL THEN t.amount ELSE 0 END debit,CASE WHEN t.type<>'income' AND t.refund_of_id IS NULL THEN t.amount ELSE 0 END credit,a.currency FROM active_transactions t LEFT JOIN ledger_accounts a ON a.account_id=t.account_id
UNION ALL SELECT t.id,a.id,CASE WHEN c.type='expense' AND c.amount>0 THEN c.amount ELSE 0 END,CASE WHEN c.type='income' OR c.amount<0 THEN abs(c.amount) ELSE 0 END,a.currency FROM category_activity c JOIN active_transactions t ON t.id=c.transaction_id LEFT JOIN ledger_accounts a ON a.category_id=c.category_id
UNION ALL SELECT t.id,a.id,t.amount,0,a.currency FROM active_transactions t LEFT JOIN ledger_accounts a ON a.account_id=t.destination_account_id WHERE t.type='transfer';
` + syncTriggers(['expense_splits', 'savings_goals', 'goal_contributions', 'bill_reminders']);
