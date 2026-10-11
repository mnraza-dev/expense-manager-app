import { AnalyticsRepository } from './analyticsRepository';
import type { Account, Transaction } from '../types';
import type { Journal, LedgerLine, LedgerLineInput, LedgerKind, NetWorth } from '../typesAdvanced';
import { localDate, MAX_MONEY, validDate } from '../utils/finance';
export class LedgerRepository extends AnalyticsRepository {
  protected async accountLedger(id: number) {
    let row = await this.db.getFirstAsync<{ id: number; kind: LedgerKind; currency: string }>(
      'SELECT id,kind,currency FROM ledger_accounts WHERE account_id=?',
      id
    );
    if (!row) {
      const a = await this.db.getFirstAsync<Account>('SELECT * FROM accounts WHERE id=?', id);
      if (!a) throw new Error('Account does not exist.');
      await this.db.runAsync(
        "INSERT INTO ledger_accounts(name,kind,currency,account_id) VALUES (?,'asset',?,?)",
        a.name,
        a.currency,
        id
      );
      row = await this.db.getFirstAsync<{ id: number; kind: LedgerKind; currency: string }>(
        'SELECT id,kind,currency FROM ledger_accounts WHERE account_id=?',
        id
      );
    }
    return row!;
  }
  protected async categoryLedger(id: number) {
    let row = await this.db.getFirstAsync<{ id: number; kind: LedgerKind; currency: string }>(
      'SELECT id,kind,currency FROM ledger_accounts WHERE category_id=?',
      id
    );
    if (!row) {
      const cat = await this.db.getFirstAsync<{ name: string; type: LedgerKind }>(
        'SELECT name,type FROM categories WHERE id=?',
        id
      );
      if (!cat) throw new Error('Category does not exist.');
      await this.db.runAsync(
        "INSERT INTO ledger_accounts(name,kind,currency,category_id) VALUES (?,?,'INR',?)",
        cat.name,
        cat.type,
        id
      );
      row = await this.db.getFirstAsync<{ id: number; kind: LedgerKind; currency: string }>(
        'SELECT id,kind,currency FROM ledger_accounts WHERE category_id=?',
        id
      );
    }
    return row!;
  }
  protected async postJournalCore(input: {
    date: string;
    description: string;
    key: string;
    kind: string;
    lines: LedgerLineInput[];
    transaction_id?: number;
    reversal_of?: number;
    payload?: unknown;
  }) {
    if (!validDate(input.date) || !input.description.trim() || !input.key)
      throw new Error('A journal needs a valid date, description and posting key.');
    if (input.lines.length < 2) throw new Error('A journal needs at least two balanced lines.');
    let debit = 0n,
      credit = 0n;
    for (const line of input.lines) {
      if (
        !Number.isSafeInteger(line.debit) ||
        !Number.isSafeInteger(line.credit) ||
        line.debit < 0 ||
        line.credit < 0 ||
        line.debit > MAX_MONEY ||
        line.credit > MAX_MONEY ||
        !((line.debit > 0 && line.credit === 0) || (line.credit > 0 && line.debit === 0))
      )
        throw new Error('Each ledger line must have one positive minor-unit debit or credit.');
      const account = await this.db.getFirstAsync<{ currency: string }>(
        'SELECT currency FROM ledger_accounts WHERE id=?',
        line.ledger_account_id
      );
      if (!account || line.currency !== 'INR' || account.currency !== line.currency)
        throw new Error('Currency mismatch. Conversion rates are not supported.');
      debit += BigInt(line.debit);
      credit += BigInt(line.credit);
    }
    if (debit !== credit || debit === 0n || debit > BigInt(Number.MAX_SAFE_INTEGER))
      throw new Error('Journal debits and credits must balance within supported precision.');
    if (
      await this.db.getFirstAsync('SELECT id FROM ledger_journals WHERE posting_key=?', input.key)
    )
      throw new Error('This journal was already posted.');
    const volume = await this.db.getFirstAsync<{ total: number }>(
      'SELECT COALESCE(SUM(debit+credit),0) total FROM ledger_lines'
    );
    if (BigInt(volume?.total ?? 0) + debit + credit > BigInt(Number.MAX_SAFE_INTEGER))
      throw new Error('Ledger totals exceed supported exact integer precision.');
    const now = new Date().toISOString();
    await this.db.runAsync(
      'INSERT INTO ledger_journals(date,description,posting_key,transaction_id,reversal_of,kind,payload,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)',
      input.date,
      input.description,
      input.key,
      input.transaction_id ?? null,
      input.reversal_of ?? null,
      input.kind,
      JSON.stringify(input.payload ?? {}),
      now,
      now
    );
    const id = (await this.db.getFirstAsync<{ id: number }>('SELECT last_insert_rowid() id'))!.id;
    for (const line of input.lines)
      await this.db.runAsync(
        'INSERT INTO ledger_lines(journal_id,ledger_account_id,debit,credit,currency,description) VALUES (?,?,?,?,?,?)',
        id,
        line.ledger_account_id,
        line.debit,
        line.credit,
        line.currency,
        line.description ?? ''
      );
    await this.db.runAsync("UPDATE ledger_journals SET status='posted' WHERE id=?", id);
    return id;
  }
  postJournal(input: Parameters<LedgerRepository['postJournalCore']>[0]) {
    return this.write(async () => {
      let id = 0;
      await this.db.withTransactionAsync(async () => {
        id = await this.postJournalCore(input);
      });
      return id;
    });
  }
  protected async reverseJournalCore(id: number, reason: string) {
    const old = await this.db.getFirstAsync<Journal>(
      "SELECT * FROM ledger_journals WHERE id=? AND status='posted'",
      id
    );
    if (!old) throw new Error('Posted journal not found.');
    if (old.reversal_of) throw new Error('Reverse the replacement event rather than its reversal.');
    if (await this.db.getFirstAsync('SELECT id FROM ledger_journals WHERE reversal_of=?', id))
      throw new Error('Journal is already reversed.');
    const lines = await this.db.getAllAsync<LedgerLine>(
      'SELECT * FROM ledger_lines WHERE journal_id=?',
      id
    );
    return this.postJournalCore({
      date: old.date,
      description: `Reversal: ${reason}`,
      key: `reverse:${id}`,
      kind: 'reversal',
      reversal_of: id,
      transaction_id: old.transaction_id ?? undefined,
      payload: { original_journal: id, reason },
      lines: lines.map((l) => ({ ...l, debit: l.credit, credit: l.debit })),
    });
  }
  protected async reverseTransactionCore(id: number, reason: string) {
    const current = await this.db.getFirstAsync<{ journal_id: number }>(
      'SELECT journal_id FROM transaction_journals WHERE transaction_id=? ORDER BY version DESC LIMIT 1',
      id
    );
    if (!current) throw new Error('Transaction has no posted journal.');
    await this.reverseJournalCore(current.journal_id, reason);
  }
  protected async postTransactionCore(id: number) {
    const t = await this.db.getFirstAsync<Transaction>('SELECT * FROM transactions WHERE id=?', id);
    if (!t || t.status === 'void') throw new Error('Transaction cannot be posted.');
    const a = await this.accountLedger(t.account_id);
    let debit: number, credit: number;
    if (t.type === 'transfer') {
      const d = await this.accountLedger(t.destination_account_id!);
      if (a.currency !== d.currency)
        throw new Error('Cross-currency transfers require an explicit conversion rate.');
      debit = d.id;
      credit = a.id;
    } else {
      const c = await this.categoryLedger(t.category_id!);
      debit = t.type === 'expense' ? c.id : a.id;
      credit = t.type === 'expense' ? a.id : c.id;
    }
    const previous = await this.db.getFirstAsync<{ version: number }>(
      'SELECT MAX(version) version FROM transaction_journals WHERE transaction_id=?',
      id
    );
    if (previous?.version) {
      const row = await this.db.getFirstAsync<{ id: number }>(
        'SELECT j.id FROM transaction_journals tj JOIN ledger_journals j ON j.id=tj.journal_id WHERE tj.transaction_id=? AND tj.version=? AND NOT EXISTS(SELECT 1 FROM ledger_journals r WHERE r.reversal_of=j.id)',
        id,
        previous.version
      );
      if (row) throw new Error('Transaction already has an active posting.');
    }
    const version = (previous?.version ?? 0) + 1;
    const journal = await this.postJournalCore({
      date: t.date,
      description: t.description,
      key: `transaction:${id}:v${version}`,
      kind: t.component === 'standard' || !t.component ? t.type : t.component,
      transaction_id: id,
      payload: t,
      lines: [
        { ledger_account_id: debit, debit: t.amount, credit: 0, currency: a.currency },
        { ledger_account_id: credit, debit: 0, credit: t.amount, currency: a.currency },
      ],
    });
    await this.db.runAsync('INSERT INTO transaction_journals VALUES (?,?,?)', id, journal, version);
    return id;
  }
  protected async openingCore(accountId: number, amount: number, date: string) {
    const a = await this.accountLedger(accountId);
    const current = await this.db.getFirstAsync<Journal>(
      "SELECT j.* FROM ledger_journals j WHERE j.kind='opening' AND j.posting_key LIKE ? AND NOT EXISTS(SELECT 1 FROM ledger_journals r WHERE r.reversal_of=j.id) ORDER BY j.id DESC LIMIT 1",
      `opening:${accountId}:%`
    );
    if (current) await this.reverseJournalCore(current.id, 'Opening balance correction');
    if (!amount) return;
    const equity = (await this.db.getFirstAsync<{ id: number }>(
      "SELECT id FROM ledger_accounts WHERE system_key='opening_equity'"
    ))!.id;
    const count = await this.db.getFirstAsync<{ n: number }>(
      "SELECT COUNT(*) n FROM ledger_journals WHERE kind='opening' AND posting_key LIKE ?",
      `opening:${accountId}:%`
    );
    const positiveDebit = (a.kind === 'asset') === amount > 0;
    await this.postJournalCore({
      date,
      description: 'Opening balance',
      key: `opening:${accountId}:${(count?.n ?? 0) + 1}`,
      kind: 'opening',
      payload: { account_id: accountId, opening_balance: amount },
      lines: [
        {
          ledger_account_id: a.id,
          debit: positiveDebit ? Math.abs(amount) : 0,
          credit: positiveDebit ? 0 : Math.abs(amount),
          currency: a.currency,
        },
        {
          ledger_account_id: equity,
          debit: positiveDebit ? 0 : Math.abs(amount),
          credit: positiveDebit ? Math.abs(amount) : 0,
          currency: a.currency,
        },
      ],
    });
  }
  protected async insertTransactionCore(t: Omit<Transaction, 'id' | 'created_at' | 'updated_at'>) {
    if (
      !validDate(t.date) ||
      !Number.isSafeInteger(t.amount) ||
      t.amount <= 0 ||
      t.amount > MAX_MONEY ||
      !t.description.trim()
    )
      throw new Error('Enter a valid transaction amount, date and description.');
    const source = await this.accountLedger(t.account_id);
    if (
      t.destination_account_id &&
      (await this.accountLedger(t.destination_account_id)).currency !== source.currency
    )
      throw new Error('Currency mismatch.');
    const now = new Date().toISOString();
    await this.db.runAsync(
      'INSERT INTO transactions(type,amount,account_id,destination_account_id,category_id,description,date,notes,component,loan_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
      t.type,
      t.amount,
      t.account_id,
      t.destination_account_id,
      t.category_id,
      t.description,
      t.date,
      t.notes,
      t.component ?? 'standard',
      t.loan_id ?? null,
      now,
      now
    );
    const id = (await this.db.getFirstAsync<{ id: number }>('SELECT last_insert_rowid() id'))!.id;
    await this.postTransactionCore(id);
    return id;
  }
  protected async convertLedger() {
    if (await this.db.getFirstAsync("SELECT key FROM app_settings WHERE key='ledger_converted'"))
      return;
    await this.db.runAsync(
      "INSERT OR IGNORE INTO ledger_accounts(name,kind,currency,system_key) VALUES ('Opening equity','equity','INR','opening_equity')"
    );
    const accounts = await this.db.getAllAsync<Account>('SELECT * FROM accounts');
    const tx = await this.db.getAllAsync<Transaction>('SELECT * FROM transactions ORDER BY id');
    for (const account of accounts) {
      const dates = tx
        .filter((t) => t.account_id === account.id || t.destination_account_id === account.id)
        .map((t) => t.date);
      const created = account.created_at.slice(0, 10);
      if (validDate(created)) dates.push(created);
      const date = dates.sort()[0] ?? localDate();
      await this.accountLedger(account.id);
      await this.db.runAsync(
        "INSERT INTO account_roles(account_id,kind,history_start,historical_assumption) VALUES (?,'asset',?,1)",
        account.id,
        date
      );
      await this.openingCore(account.id, account.opening_balance, date);
    }
    for (const t of tx) await this.postTransactionCore(t.id);
    for (const a of accounts) {
      const expected = tx.reduce(
        (sum, t) =>
          sum +
          (t.account_id === a.id ? (t.type === 'income' ? t.amount : -t.amount) : 0) +
          (t.type === 'transfer' && t.destination_account_id === a.id ? t.amount : 0),
        a.opening_balance
      );
      const actual = await this.accountBalanceCore(a.id);
      if (expected !== actual)
        throw new Error('Historical ledger reconciliation failed. No conversion was committed.');
    }
    await this.db.runAsync("INSERT INTO app_settings VALUES ('ledger_converted','1')");
  }
  protected async accountBalanceCore(id: number, date = '9999-12-31') {
    const row = await this.db.getFirstAsync<{ balance: number }>(
      `SELECT COALESCE(SUM(CASE WHEN la.kind='liability' THEN ll.credit-ll.debit ELSE ll.debit-ll.credit END),0) balance FROM ledger_accounts la LEFT JOIN ledger_lines ll ON ll.ledger_account_id=la.id LEFT JOIN ledger_journals j ON j.id=ll.journal_id WHERE la.account_id=? AND j.status='posted' AND j.date<=?`,
      id,
      date
    );
    return row?.balance ?? 0;
  }
  protected async accountSnapshotCore() {
    return this.db.getAllAsync<Account>(
      `SELECT a.*,r.kind,r.subtype,r.history_start,COALESCE(SUM(CASE WHEN j.status='posted' THEN CASE WHEN r.kind='liability' THEN ll.credit-ll.debit ELSE ll.debit-ll.credit END ELSE 0 END),0) ledger_balance FROM accounts a JOIN account_roles r ON r.account_id=a.id JOIN ledger_accounts la ON la.account_id=a.id LEFT JOIN ledger_lines ll ON ll.ledger_account_id=la.id LEFT JOIN ledger_journals j ON j.id=ll.journal_id GROUP BY a.id ORDER BY a.archived,a.name`
    );
  }
  ledgerActivity() {
    return this.read(async () => {
      const journals = await this.db.getAllAsync<Journal>(
        'SELECT * FROM ledger_journals ORDER BY created_at DESC,id DESC LIMIT 200'
      );
      const lines = await this.db.getAllAsync<LedgerLine>(
        `SELECT ll.*,la.name,la.kind FROM ledger_lines ll JOIN ledger_accounts la ON la.id=ll.ledger_account_id WHERE ll.journal_id IN (SELECT id FROM ledger_journals ORDER BY created_at DESC,id DESC LIMIT 200) ORDER BY ll.id`
      );
      return journals.map((j) => ({ ...j, lines: lines.filter((l) => l.journal_id === j.id) }));
    });
  }
  netWorth(date: string): Promise<NetWorth> {
    if (!validDate(date)) throw new Error('Choose a valid as-of date.');
    return this.read(async () => {
      const accounts = await this.db.getAllAsync<NetWorth['accounts'][number]>(
        `SELECT a.id,a.name,r.kind,a.currency,r.history_start,r.historical_assumption,COALESCE(SUM(CASE WHEN j.status='posted' AND j.date<=? THEN CASE WHEN r.kind='liability' THEN ll.credit-ll.debit ELSE ll.debit-ll.credit END ELSE 0 END),0) balance FROM accounts a JOIN account_roles r ON r.account_id=a.id JOIN ledger_accounts la ON la.account_id=a.id LEFT JOIN ledger_lines ll ON ll.ledger_account_id=la.id LEFT JOIN ledger_journals j ON j.id=ll.journal_id GROUP BY a.id ORDER BY a.name`,
        date
      );
      const currencies = [...new Set(accounts.map((a) => a.currency))];
      const groups = currencies.map((currency) => {
        const same = accounts.filter((a) => a.currency === currency);
        const assets = same.filter((a) => a.kind === 'asset').reduce((s, a) => s + a.balance, 0);
        const liabilities = same
          .filter((a) => a.kind === 'liability')
          .reduce((s, a) => s + a.balance, 0);
        return { currency, assets, liabilities, net: assets - liabilities };
      });
      return {
        date,
        accounts,
        groups,
        incomplete: accounts.some(
          (a) => Boolean(a.historical_assumption) && date < a.history_start
        ),
      };
    });
  }
}
