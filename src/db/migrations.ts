import { mvp4Migration } from './mvp4Schema';
import { syncMigration } from '../cloud/localSchema';
export const migrations = [
  `CREATE TABLE accounts (
 id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL CHECK(length(trim(name))>0),
 type TEXT NOT NULL CHECK(type IN ('cash','bank','savings','wallet','other')),
 opening_balance INTEGER NOT NULL CHECK(typeof(opening_balance)='integer' AND abs(opening_balance)<=1000000000000),
 currency TEXT NOT NULL DEFAULT 'INR' CHECK(currency='INR'), description TEXT NOT NULL DEFAULT '',
 archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0,1)), created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE categories (
 id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL CHECK(length(trim(name))>0),
 type TEXT NOT NULL CHECK(type IN ('income','expense')), icon TEXT NOT NULL, color TEXT NOT NULL,
 archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0,1)), created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 UNIQUE(name,type));
CREATE TABLE transactions (
 id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL CHECK(type IN ('expense','income','transfer')),
 amount INTEGER NOT NULL CHECK(typeof(amount)='integer' AND amount>0 AND amount<=1000000000000),
 account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
 destination_account_id INTEGER REFERENCES accounts(id) ON DELETE RESTRICT,
 category_id INTEGER REFERENCES categories(id) ON DELETE RESTRICT,
 description TEXT NOT NULL CHECK(length(trim(description))>0), date TEXT NOT NULL CHECK(length(date)=10), notes TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 CHECK((type='transfer' AND destination_account_id IS NOT NULL AND destination_account_id<>account_id AND category_id IS NULL) OR (type<>'transfer' AND destination_account_id IS NULL AND category_id IS NOT NULL)));
CREATE INDEX transactions_date ON transactions(date DESC);
CREATE INDEX transactions_account ON transactions(account_id);
CREATE INDEX transactions_destination ON transactions(destination_account_id);
CREATE INDEX transactions_category ON transactions(category_id);
CREATE INDEX transactions_type ON transactions(type);
CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TRIGGER category_type_insert BEFORE INSERT ON transactions WHEN NEW.type<>'transfer' AND (SELECT type FROM categories WHERE id=NEW.category_id)<>NEW.type BEGIN SELECT RAISE(ABORT,'Category type mismatch'); END;
CREATE TRIGGER category_type_update BEFORE UPDATE ON transactions WHEN NEW.type<>'transfer' AND (SELECT type FROM categories WHERE id=NEW.category_id)<>NEW.type BEGIN SELECT RAISE(ABORT,'Category type mismatch'); END;
CREATE TRIGGER category_type_preserve BEFORE UPDATE OF type ON categories WHEN EXISTS(SELECT 1 FROM transactions WHERE category_id=OLD.id AND type<>NEW.type) BEGIN SELECT RAISE(ABORT,'Category type has historical transactions'); END;`,
  `CREATE TABLE budgets (
 id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL CHECK(length(trim(name))>0),
 period_type TEXT NOT NULL DEFAULT 'monthly' CHECK(period_type='monthly'),
 period_start TEXT NOT NULL UNIQUE CHECK(length(period_start)=10 AND substr(period_start,9,2)='01' AND date(period_start) IS NOT NULL AND date(period_start)=period_start),
 period_end TEXT NOT NULL CHECK(period_end=date(period_start,'+1 month','-1 day')),
 total_limit_minor INTEGER NOT NULL CHECK(typeof(total_limit_minor)='integer' AND total_limit_minor>0 AND total_limit_minor<=1000000000000),
 currency_code TEXT NOT NULL DEFAULT 'INR' CHECK(currency_code='INR'), created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE budget_categories (
 id INTEGER PRIMARY KEY AUTOINCREMENT, budget_id INTEGER NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
 category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
 limit_minor INTEGER NOT NULL CHECK(typeof(limit_minor)='integer' AND limit_minor>0 AND limit_minor<=1000000000000),
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(budget_id,category_id));
CREATE INDEX budget_categories_category ON budget_categories(category_id);
CREATE INDEX transactions_type_date_category ON transactions(type,date,category_id);
CREATE INDEX transactions_amount_date ON transactions(amount,date,id);
CREATE TRIGGER budget_expense_insert BEFORE INSERT ON budget_categories WHEN (SELECT type FROM categories WHERE id=NEW.category_id)<>'expense' BEGIN SELECT RAISE(ABORT,'Budgets require expense categories'); END;
CREATE TRIGGER budget_expense_update BEFORE UPDATE OF category_id ON budget_categories WHEN (SELECT type FROM categories WHERE id=NEW.category_id)<>'expense' BEGIN SELECT RAISE(ABORT,'Budgets require expense categories'); END;
CREATE TRIGGER budget_category_type_preserve BEFORE UPDATE OF type ON categories WHEN NEW.type<>'expense' AND EXISTS(SELECT 1 FROM budget_categories WHERE category_id=OLD.id) BEGIN SELECT RAISE(ABORT,'Category is used by a budget'); END;
INSERT OR IGNORE INTO app_settings VALUES ('budget_warning_percent','80');`,
  `CREATE TABLE ledger_accounts(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('asset','liability','income','expense','equity')),currency TEXT NOT NULL CHECK(currency='INR'),account_id INTEGER UNIQUE REFERENCES accounts(id) ON DELETE SET NULL,category_id INTEGER UNIQUE REFERENCES categories(id) ON DELETE SET NULL,system_key TEXT UNIQUE);
CREATE TABLE account_roles(account_id INTEGER PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,kind TEXT NOT NULL CHECK(kind IN ('asset','liability')),subtype TEXT NOT NULL DEFAULT 'standard' CHECK(subtype IN ('standard','credit_card','loan_payable','loan_receivable')),history_start TEXT NOT NULL,historical_assumption INTEGER NOT NULL DEFAULT 0);
CREATE TABLE ledger_journals(id INTEGER PRIMARY KEY AUTOINCREMENT,date TEXT NOT NULL,description TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','posted')),posting_key TEXT NOT NULL UNIQUE,transaction_id INTEGER REFERENCES transactions(id) ON DELETE RESTRICT,reversal_of INTEGER UNIQUE REFERENCES ledger_journals(id) ON DELETE RESTRICT,kind TEXT NOT NULL,payload TEXT NOT NULL DEFAULT '{}',created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE ledger_lines(id INTEGER PRIMARY KEY AUTOINCREMENT,journal_id INTEGER NOT NULL REFERENCES ledger_journals(id) ON DELETE RESTRICT,ledger_account_id INTEGER NOT NULL REFERENCES ledger_accounts(id) ON DELETE RESTRICT,debit INTEGER NOT NULL CHECK(typeof(debit)='integer' AND debit>=0 AND debit<=1000000000000),credit INTEGER NOT NULL CHECK(typeof(credit)='integer' AND credit>=0 AND credit<=1000000000000),currency TEXT NOT NULL CHECK(currency='INR'),description TEXT NOT NULL DEFAULT '',CHECK((debit>0 AND credit=0) OR (credit>0 AND debit=0)));
CREATE INDEX ledger_lines_account_journal ON ledger_lines(ledger_account_id,journal_id);
CREATE INDEX ledger_journals_date ON ledger_journals(date,status);
CREATE TABLE transaction_journals(transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE RESTRICT,journal_id INTEGER NOT NULL UNIQUE REFERENCES ledger_journals(id) ON DELETE RESTRICT,version INTEGER NOT NULL,PRIMARY KEY(transaction_id,version));
CREATE TRIGGER journal_balanced BEFORE UPDATE OF status ON ledger_journals WHEN NEW.status='posted' BEGIN SELECT CASE WHEN (SELECT COUNT(*) FROM ledger_lines WHERE journal_id=NEW.id)<2 OR (SELECT SUM(debit)-SUM(credit) FROM ledger_lines WHERE journal_id=NEW.id)<>0 THEN RAISE(ABORT,'Unbalanced journal') END; END;
CREATE TRIGGER journal_no_direct_post BEFORE INSERT ON ledger_journals WHEN NEW.status<>'draft' BEGIN SELECT RAISE(ABORT,'Journal must start as draft'); END;
CREATE TRIGGER journal_immutable BEFORE UPDATE ON ledger_journals WHEN OLD.status='posted' BEGIN SELECT RAISE(ABORT,'Posted journal is immutable'); END;
CREATE TRIGGER journal_no_delete BEFORE DELETE ON ledger_journals WHEN OLD.status='posted' BEGIN SELECT RAISE(ABORT,'Posted journal is immutable'); END;
CREATE TRIGGER line_currency BEFORE INSERT ON ledger_lines WHEN NEW.currency<>(SELECT currency FROM ledger_accounts WHERE id=NEW.ledger_account_id) BEGIN SELECT RAISE(ABORT,'Ledger currency mismatch'); END;
CREATE TRIGGER line_no_insert BEFORE INSERT ON ledger_lines WHEN (SELECT status FROM ledger_journals WHERE id=NEW.journal_id)='posted' BEGIN SELECT RAISE(ABORT,'Posted lines are immutable'); END;
CREATE TRIGGER line_no_update BEFORE UPDATE ON ledger_lines WHEN (SELECT status FROM ledger_journals WHERE id=OLD.journal_id)='posted' OR (SELECT status FROM ledger_journals WHERE id=NEW.journal_id)='posted' BEGIN SELECT RAISE(ABORT,'Posted lines are immutable'); END;
CREATE TRIGGER line_no_delete BEFORE DELETE ON ledger_lines WHEN (SELECT status FROM ledger_journals WHERE id=OLD.journal_id)='posted' BEGIN SELECT RAISE(ABORT,'Posted lines are immutable'); END;
ALTER TABLE transactions ADD COLUMN status TEXT NOT NULL DEFAULT 'posted' CHECK(status IN ('posted','void'));
ALTER TABLE transactions ADD COLUMN component TEXT NOT NULL DEFAULT 'standard' CHECK(component IN ('standard','interest','fee','principal'));
ALTER TABLE transactions ADD COLUMN loan_id INTEGER REFERENCES loans(id);
CREATE VIEW active_transactions AS SELECT * FROM transactions WHERE status='posted';
CREATE TRIGGER transaction_keep_history BEFORE DELETE ON transactions WHEN EXISTS(SELECT 1 FROM transaction_journals WHERE transaction_id=OLD.id) BEGIN SELECT RAISE(ABORT,'Void posted transactions instead'); END;
CREATE TABLE credit_cards(account_id INTEGER PRIMARY KEY REFERENCES accounts(id) ON DELETE RESTRICT,nickname TEXT NOT NULL DEFAULT '',credit_limit INTEGER NOT NULL CHECK(credit_limit>0),closing_day INTEGER NOT NULL CHECK(closing_day BETWEEN 1 AND 31),due_day INTEGER NOT NULL CHECK(due_day BETWEEN 1 AND 31),payment_account_id INTEGER REFERENCES accounts(id) ON DELETE RESTRICT,minimum_payment INTEGER CHECK(minimum_payment>=0),created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE card_statements(id INTEGER PRIMARY KEY AUTOINCREMENT,account_id INTEGER NOT NULL REFERENCES credit_cards(account_id) ON DELETE RESTRICT,period_start TEXT NOT NULL,period_end TEXT NOT NULL,due_date TEXT NOT NULL,minimum_payment INTEGER CHECK(minimum_payment>=0),created_at TEXT NOT NULL,UNIQUE(account_id,period_end));
CREATE TABLE loans(id INTEGER PRIMARY KEY AUTOINCREMENT,account_id INTEGER NOT NULL UNIQUE REFERENCES accounts(id) ON DELETE RESTRICT,name TEXT NOT NULL,direction TEXT NOT NULL CHECK(direction IN ('borrowed','lent')),label TEXT NOT NULL CHECK(label IN ('personal','other')),principal INTEGER NOT NULL CHECK(principal>0 AND principal<=1000000000000),start_date TEXT NOT NULL,annual_rate_bps INTEGER CHECK(annual_rate_bps BETWEEN 0 AND 10000),interest_method TEXT NOT NULL CHECK(interest_method IN ('none','flat','reducing')),frequency TEXT NOT NULL CHECK(frequency IN ('monthly','quarterly','yearly')),term_months INTEGER CHECK(term_months BETWEEN 1 AND 600),payment_account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,counterparty TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','closed')),category_id INTEGER NOT NULL REFERENCES categories(id),origination_fees INTEGER NOT NULL DEFAULT 0 CHECK(origination_fees>=0),created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE loan_schedules(id INTEGER PRIMARY KEY AUTOINCREMENT,loan_id INTEGER NOT NULL REFERENCES loans(id) ON DELETE RESTRICT,due_date TEXT NOT NULL,principal INTEGER NOT NULL CHECK(principal>=0),interest INTEGER NOT NULL CHECK(interest>=0),version INTEGER NOT NULL,paid_principal_baseline INTEGER NOT NULL DEFAULT 0,paid_interest_baseline INTEGER NOT NULL DEFAULT 0,payment_id_baseline INTEGER NOT NULL DEFAULT 0,status TEXT NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled','superseded')),UNIQUE(loan_id,version,due_date));
CREATE TABLE loan_payments(id INTEGER PRIMARY KEY AUTOINCREMENT,loan_id INTEGER NOT NULL REFERENCES loans(id) ON DELETE RESTRICT,date TEXT NOT NULL,principal INTEGER NOT NULL CHECK(principal>=0),interest INTEGER NOT NULL CHECK(interest>=0),fees INTEGER NOT NULL CHECK(fees>=0),principal_transaction_id INTEGER REFERENCES transactions(id) ON DELETE RESTRICT,interest_transaction_id INTEGER REFERENCES transactions(id) ON DELETE RESTRICT,fee_transaction_id INTEGER REFERENCES transactions(id) ON DELETE RESTRICT,status TEXT NOT NULL DEFAULT 'posted' CHECK(status IN ('posted','void')),created_at TEXT NOT NULL);
CREATE TABLE recurring_rules(id INTEGER PRIMARY KEY AUTOINCREMENT,type TEXT NOT NULL CHECK(type IN ('income','expense','loan_payment')),amount INTEGER NOT NULL CHECK(amount>0),account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,category_id INTEGER REFERENCES categories(id) ON DELETE RESTRICT,loan_id INTEGER REFERENCES loans(id) ON DELETE RESTRICT,description TEXT NOT NULL,start_date TEXT NOT NULL,end_date TEXT,frequency TEXT NOT NULL CHECK(frequency IN ('daily','weekly','monthly','quarterly','yearly')),next_index INTEGER NOT NULL DEFAULT 0,status TEXT NOT NULL DEFAULT 'enabled' CHECK(status IN ('enabled','paused','cancelled')),created_at TEXT NOT NULL,updated_at TEXT NOT NULL,CHECK((type='loan_payment' AND loan_id IS NOT NULL AND category_id IS NULL) OR (type<>'loan_payment' AND loan_id IS NULL AND category_id IS NOT NULL)));
CREATE TABLE recurring_occurrences(id INTEGER PRIMARY KEY AUTOINCREMENT,rule_id INTEGER NOT NULL REFERENCES recurring_rules(id) ON DELETE RESTRICT,scheduled_date TEXT NOT NULL,occurrence_index INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled','completed','skipped','cancelled')),transaction_id INTEGER UNIQUE REFERENCES transactions(id) ON DELETE RESTRICT,loan_payment_id INTEGER UNIQUE REFERENCES loan_payments(id) ON DELETE RESTRICT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(rule_id,scheduled_date),UNIQUE(rule_id,occurrence_index));
CREATE INDEX recurring_status_date ON recurring_occurrences(status,scheduled_date);
CREATE INDEX loan_schedule_loan ON loan_schedules(loan_id,status,due_date);
CREATE INDEX loan_payment_loan ON loan_payments(loan_id,status,date);
CREATE TRIGGER ledger_account_currency_kind BEFORE UPDATE OF kind,currency ON ledger_accounts WHEN EXISTS(SELECT 1 FROM ledger_lines WHERE ledger_account_id=OLD.id) BEGIN SELECT RAISE(ABORT,'Posted account classification is immutable'); END;
CREATE TRIGGER loan_category_insert BEFORE INSERT ON loans WHEN (SELECT type FROM categories WHERE id=NEW.category_id)<>(CASE WHEN NEW.direction='borrowed' THEN 'expense' ELSE 'income' END) BEGIN SELECT RAISE(ABORT,'Loan interest category mismatch'); END;
CREATE TRIGGER loan_category_preserve BEFORE UPDATE OF type ON categories WHEN EXISTS(SELECT 1 FROM loans WHERE category_id=OLD.id AND NEW.type<>(CASE WHEN direction='borrowed' THEN 'expense' ELSE 'income' END)) BEGIN SELECT RAISE(ABORT,'Category is used by a loan'); END;

`,
];
migrations.push(syncMigration, mvp4Migration);
export const defaults = {
  expense: [
    'Food & Dining',
    'Groceries',
    'Transportation',
    'Shopping',
    'Housing',
    'Bills & Utilities',
    'Healthcare',
    'Entertainment',
    'Education',
    'Travel',
    'Personal Care',
    'Other',
  ],
  income: ['Salary', 'Freelance', 'Business Income', 'Investments', 'Gifts', 'Other Income'],
};
