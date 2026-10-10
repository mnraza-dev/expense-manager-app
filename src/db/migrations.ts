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
];
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
