import { LedgerRepository } from './ledgerRepository';
import type { Account, Transaction } from '../types';
import type {
  Card,
  CardStatement,
  Loan,
  LoanDetail,
  LoanPayment,
  LoanSchedule,
  RecurringRule,
  Occurrence,
} from '../typesAdvanced';
import { localDate, MAX_MONEY, validDate } from '../utils/finance';
import { loanForecast, scheduledDate, statementPeriod } from '../utils/schedules';
export class AdvancedRepository extends LedgerRepository {
  protected amount(value: number, zero = false) {
    if (!Number.isSafeInteger(value) || value < (zero ? 0 : 1) || value > MAX_MONEY)
      throw new Error('Enter a valid minor-unit amount within the supported limit.');
  }
  protected async requireAsset(id: number) {
    const a = await this.db.getFirstAsync<Account & { kind: string; subtype: string }>(
      'SELECT a.*,r.kind,r.subtype FROM accounts a JOIN account_roles r ON r.account_id=a.id WHERE a.id=?',
      id
    );
    if (!a || a.archived || a.kind !== 'asset' || a.subtype !== 'standard')
      throw new Error('Select an active cash, bank, savings or wallet payment account.');
    return a;
  }
  protected async newManagedAccountCore(
    name: string,
    kind: 'asset' | 'liability',
    subtype: string,
    date: string,
    opening = 0
  ) {
    if (!name.trim() || !validDate(date)) throw new Error('Enter a name and valid date.');
    const now = new Date().toISOString();
    await this.db.runAsync(
      "INSERT INTO accounts(name,type,opening_balance,created_at,updated_at) VALUES (?,'other',?,?,?)",
      name.trim(),
      opening,
      now,
      now
    );
    const id = (await this.db.getFirstAsync<{ id: number }>('SELECT last_insert_rowid() id'))!.id;
    await this.db.runAsync(
      'INSERT INTO account_roles(account_id,kind,subtype,history_start) VALUES (?,?,?,?)',
      id,
      kind,
      subtype,
      date
    );
    await this.db.runAsync(
      "INSERT INTO ledger_accounts(name,kind,currency,account_id) VALUES (?,?,'INR',?)",
      name.trim(),
      kind,
      id
    );
    await this.openingCore(id, opening, date);
    return id;
  }
  saveCard(
    input: Omit<Card, 'account_id'> & { name: string; opening_balance: number },
    id?: number
  ) {
    return this.write(async () => {
      this.amount(input.credit_limit);
      if (
        !Number.isSafeInteger(input.opening_balance) ||
        Math.abs(input.opening_balance) > MAX_MONEY
      )
        throw new Error('Invalid card opening balance.');
      statementPeriod(localDate().slice(0, 7), input.closing_day, input.due_day);
      if (input.minimum_payment !== null) this.amount(input.minimum_payment, true);
      if (!input.name.trim()) throw new Error('Enter a card name.');
      let accountId = id ?? 0;
      await this.db.withTransactionAsync(async () => {
        if (input.payment_account_id) await this.requireAsset(input.payment_account_id);
        const now = new Date().toISOString();
        if (id) {
          const card = await this.db.getFirstAsync<Card>(
            'SELECT * FROM credit_cards WHERE account_id=?',
            id
          );
          if (!card) throw new Error('Card not found.');
          const account = await this.db.getFirstAsync<Account>(
            'SELECT * FROM accounts WHERE id=?',
            id
          );
          await this.db.runAsync(
            'UPDATE accounts SET name=?,opening_balance=?,updated_at=? WHERE id=?',
            input.name.trim(),
            input.opening_balance,
            now,
            id
          );
          if (account!.opening_balance !== input.opening_balance) {
            const role = await this.db.getFirstAsync<{ history_start: string }>(
              'SELECT history_start FROM account_roles WHERE account_id=?',
              id
            );
            await this.openingCore(id, input.opening_balance, role!.history_start);
          }
          await this.db.runAsync(
            'UPDATE credit_cards SET nickname=?,credit_limit=?,closing_day=?,due_day=?,payment_account_id=?,minimum_payment=?,updated_at=? WHERE account_id=?',
            input.nickname,
            input.credit_limit,
            input.closing_day,
            input.due_day,
            input.payment_account_id,
            input.minimum_payment,
            now,
            id
          );
        } else {
          accountId = await this.newManagedAccountCore(
            input.name,
            'liability',
            'credit_card',
            localDate(),
            input.opening_balance
          );
          await this.db.runAsync(
            'INSERT INTO credit_cards(account_id,nickname,credit_limit,closing_day,due_day,payment_account_id,minimum_payment,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)',
            accountId,
            input.nickname,
            input.credit_limit,
            input.closing_day,
            input.due_day,
            input.payment_account_id,
            input.minimum_payment,
            now,
            now
          );
        }
      });
      return accountId;
    });
  }
  cards() {
    return this.read(async () => {
      const cards = await this.db.getAllAsync<Card & { name: string; archived: number }>(
        `SELECT c.*,a.name,a.archived FROM credit_cards c JOIN accounts a ON a.id=c.account_id ORDER BY a.archived,a.name`
      );
      return Promise.all(
        cards.map(async (card) => ({
          ...card,
          outstanding: await this.accountBalanceCore(card.account_id),
        }))
      );
    });
  }
  cardDetails(id: number) {
    return this.read(async () => {
      const card = await this.db.getFirstAsync<
        Card & { name: string; opening_balance: number; archived: number }
      >(
        'SELECT c.*,a.name,a.opening_balance,a.archived FROM credit_cards c JOIN accounts a ON a.id=c.account_id WHERE c.account_id=?',
        id
      );
      if (!card) return null;
      return {
        card,
        outstanding: await this.accountBalanceCore(id),
        transactions: await this.db.getAllAsync<Transaction>(
          'SELECT * FROM active_transactions WHERE account_id=? OR destination_account_id=? ORDER BY date DESC,id DESC LIMIT 100',
          id,
          id
        ),
        statements: await this.db.getAllAsync<{
          id: number;
          period_start: string;
          period_end: string;
          due_date: string;
        }>('SELECT * FROM card_statements WHERE account_id=? ORDER BY period_end DESC', id),
      };
    });
  }
  createStatement(id: number, month: string, minimum: number | null) {
    return this.write(async () => {
      const card = await this.db.getFirstAsync<Card>(
        'SELECT * FROM credit_cards WHERE account_id=?',
        id
      );
      if (!card) throw new Error('Card not found.');
      if (minimum !== null) this.amount(minimum, true);
      const p = statementPeriod(month, card.closing_day, card.due_day);
      await this.db.runAsync(
        'INSERT OR IGNORE INTO card_statements(account_id,period_start,period_end,due_date,minimum_payment,created_at) VALUES (?,?,?,?,?,?)',
        id,
        p.start,
        p.end,
        p.due,
        minimum,
        new Date().toISOString()
      );
      return (await this.db.getFirstAsync<{ id: number }>(
        'SELECT id FROM card_statements WHERE account_id=? AND period_end=?',
        id,
        p.end
      ))!.id;
    });
  }
  statement(id: number): Promise<CardStatement | null> {
    return this.read(async () => {
      const row = await this.db.getFirstAsync<CardStatement>(
        'SELECT * FROM card_statements WHERE id=?',
        id
      );
      if (!row) return null;
      const [y, m, d] = row.period_start.split('-').map(Number);
      const before = localDate(new Date(y, m - 1, d - 1));
      const opening = await this.accountBalanceCore(row.account_id, before),
        closing = await this.accountBalanceCore(row.account_id, row.period_end);
      const charges = await this.db.getFirstAsync<{
        purchases: number;
        interest: number;
        fees: number;
        payments: number;
      }>(
        `SELECT COALESCE(SUM(CASE WHEN type='expense' AND component='standard' THEN amount ELSE 0 END),0) purchases,COALESCE(SUM(CASE WHEN type='expense' AND component='interest' THEN amount ELSE 0 END),0) interest,COALESCE(SUM(CASE WHEN type='expense' AND component='fee' THEN amount ELSE 0 END),0) fees,COALESCE(SUM(CASE WHEN type='transfer' AND destination_account_id=? THEN amount ELSE 0 END),0) payments FROM active_transactions WHERE (account_id=? OR destination_account_id=?) AND date BETWEEN ? AND ?`,
        row.account_id,
        row.account_id,
        row.account_id,
        row.period_start,
        row.period_end
      );
      const paid = await this.db.getFirstAsync<{ amount: number }>(
        `SELECT COALESCE(SUM(amount),0) amount FROM active_transactions WHERE type='transfer' AND destination_account_id=? AND date>? AND date<=?`,
        row.account_id,
        row.period_end,
        localDate()
      );
      const payments = charges?.payments ?? 0,
        purchases = charges?.purchases ?? 0,
        interest = charges?.interest ?? 0,
        fees = charges?.fees ?? 0;
      const credits = opening + purchases + interest + fees - payments - closing;
      const paid_after = paid?.amount ?? 0;
      const remaining = Math.max(0, closing - paid_after);
      return {
        ...row,
        opening,
        closing,
        purchases,
        interest,
        fees,
        payments,
        credits,
        paid_after,
        remaining,
        status:
          row.period_end > localDate()
            ? 'Open cycle'
            : remaining === 0
              ? 'Paid'
              : row.due_date < localDate()
                ? 'Overdue'
                : paid_after > 0
                  ? 'Partially paid'
                  : 'Payment due',
      };
    });
  }
  protected async ensureCategoryCore(name: string, type: 'income' | 'expense') {
    const now = new Date().toISOString();
    await this.db.runAsync(
      'INSERT OR IGNORE INTO categories(name,type,icon,color,created_at,updated_at) VALUES (?,?,?,?,?,?)',
      name,
      type,
      'briefcase',
      '#6C78CF',
      now,
      now
    );
    return (await this.db.getFirstAsync<{ id: number }>(
      'SELECT id FROM categories WHERE name=? AND type=?',
      name,
      type
    ))!.id;
  }
  createLoan(input: Omit<Loan, 'id' | 'account_id' | 'status' | 'created_at' | 'updated_at'>) {
    return this.write(async () => {
      this.amount(input.principal);
      this.amount(input.origination_fees, true);
      if (
        !validDate(input.start_date) ||
        !input.name.trim() ||
        !['borrowed', 'lent'].includes(input.direction) ||
        !['none', 'flat', 'reducing'].includes(input.interest_method) ||
        !['monthly', 'quarterly', 'yearly'].includes(input.frequency) ||
        !['personal', 'other'].includes(input.label)
      )
        throw new Error('Enter valid loan details.');
      if (
        input.interest_method !== 'none' &&
        (input.annual_rate_bps === null ||
          !Number.isInteger(input.annual_rate_bps) ||
          input.annual_rate_bps < 0 ||
          input.annual_rate_bps > 10000)
      )
        throw new Error('Supply the nominal annual interest rate (0–100%).');
      const months = input.frequency === 'monthly' ? 1 : input.frequency === 'quarterly' ? 3 : 12;
      if (
        input.term_months !== null &&
        (!Number.isInteger(input.term_months) ||
          input.term_months < months ||
          input.term_months > 600 ||
          input.term_months % months !== 0)
      )
        throw new Error('The term must contain whole repayment periods, up to 600 months.');
      let id = 0;
      await this.db.withTransactionAsync(async () => {
        await this.requireAsset(input.payment_account_id);
        const category = await this.db.getFirstAsync<{ type: string; archived: number }>(
          'SELECT type,archived FROM categories WHERE id=?',
          input.category_id
        );
        if (
          !category ||
          category.archived ||
          category.type !== (input.direction === 'borrowed' ? 'expense' : 'income')
        )
          throw new Error('Choose a compatible active interest category.');
        const account = await this.newManagedAccountCore(
          input.name,
          input.direction === 'borrowed' ? 'liability' : 'asset',
          input.direction === 'borrowed' ? 'loan_payable' : 'loan_receivable',
          input.start_date
        );
        const now = new Date().toISOString();
        await this.db.runAsync(
          'INSERT INTO loans(account_id,name,direction,label,principal,start_date,annual_rate_bps,interest_method,frequency,term_months,payment_account_id,counterparty,category_id,origination_fees,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
          account,
          input.name.trim(),
          input.direction,
          input.label,
          input.principal,
          input.start_date,
          input.annual_rate_bps,
          input.interest_method,
          input.frequency,
          input.term_months,
          input.payment_account_id,
          input.counterparty,
          input.category_id,
          input.origination_fees,
          now,
          now
        );
        id = (await this.db.getFirstAsync<{ id: number }>('SELECT last_insert_rowid() id'))!.id;
        await this.insertTransactionCore({
          type: 'transfer',
          amount: input.principal,
          account_id: input.direction === 'borrowed' ? account : input.payment_account_id,
          destination_account_id:
            input.direction === 'borrowed' ? input.payment_account_id : account,
          category_id: null,
          date: input.start_date,
          description: `Loan disbursement: ${input.name}`,
          notes: '',
          component: 'principal',
          loan_id: id,
        });
        if (input.origination_fees)
          await this.insertTransactionCore({
            type: 'expense',
            amount: input.origination_fees,
            account_id: input.payment_account_id,
            destination_account_id: null,
            category_id: await this.ensureCategoryCore('Loan Fees', 'expense'),
            date: input.start_date,
            description: `Loan origination fee: ${input.name}`,
            notes: '',
            component: 'fee',
            loan_id: id,
          });
        if (input.term_months) {
          const rows = loanForecast({
            principal: input.principal,
            originalPrincipal: input.principal,
            rateBps: input.annual_rate_bps ?? 0,
            method: input.interest_method,
            frequency: input.frequency,
            periods: input.term_months / months,
            start: input.start_date,
          });
          for (const row of rows)
            await this.db.runAsync(
              'INSERT INTO loan_schedules(loan_id,due_date,principal,interest,version) VALUES (?,?,?,?,1)',
              id,
              row.due_date,
              row.principal,
              row.interest
            );
        }
      });
      return id;
    });
  }
  loans() {
    return this.read(() => this.db.getAllAsync<Loan>('SELECT * FROM loans ORDER BY status,name'));
  }
  protected async loanDetailCore(id: number): Promise<LoanDetail | null> {
    const loan = await this.db.getFirstAsync<Loan>('SELECT * FROM loans WHERE id=?', id);
    if (!loan) return null;
    const payments = await this.db.getAllAsync<LoanPayment>(
      'SELECT * FROM loan_payments WHERE loan_id=? ORDER BY date,id',
      id
    );
    const actual = payments.filter((p) => p.status === 'posted');
    const outstanding = await this.accountBalanceCore(loan.account_id);
    const all = await this.db.getAllAsync<LoanSchedule>(
      "SELECT * FROM loan_schedules WHERE loan_id=? AND status='scheduled' ORDER BY due_date",
      id
    );
    const principalBaseline = all[0]?.paid_principal_baseline ?? 0;
    const interestBaseline = all[0]?.paid_interest_baseline ?? 0;
    let remainingPaid = Math.max(
      0,
      actual.reduce((sum, p) => sum + p.principal, 0) - principalBaseline
    );
    let remainingInterest = Math.max(
      0,
      actual.reduce((sum, p) => sum + p.interest, 0) - interestBaseline
    );
    const schedule = all
      .map((s) => {
        const paid = Math.min(s.principal, remainingPaid),
          interestPaid = Math.min(s.interest, remainingInterest);
        remainingPaid -= paid;
        remainingInterest -= interestPaid;
        return { ...s, principal: s.principal - paid, interest: s.interest - interestPaid };
      })
      .filter((s) => s.principal > 0 || s.interest > 0);
    const originalSchedulesTotal = all.reduce((s, p) => s + p.principal, 0);
    const schedulePrincipal = schedule.reduce((s, p) => s + p.principal, 0);
    return {
      loan,
      outstanding,
      interest_paid: actual.reduce((s, p) => s + p.interest, 0),
      fees_paid: actual.reduce((s, p) => s + p.fees, loan.origination_fees),
      payments,
      schedule,
      overdue: schedule
        .filter((s) => s.due_date < localDate())
        .reduce((s, p) => s + p.principal + p.interest, 0),
      next_date: schedule[0]?.due_date ?? null,
      needs_recalculation:
        originalSchedulesTotal > 0 &&
        (schedulePrincipal !== outstanding ||
          ((actual.reduce((sum, p) => sum + p.principal, 0) > principalBaseline ||
            actual.reduce((sum, p) => sum + p.interest, 0) > interestBaseline) &&
            actual
              .filter((p) => p.id > (all[0]?.payment_id_baseline ?? 0))
              .some(
                (p) =>
                  !all.some(
                    (s) =>
                      s.due_date === p.date &&
                      s.principal === p.principal &&
                      s.interest === p.interest
                  )
              ))),
    };
  }
  loanDetail(id: number) {
    return this.read(() => this.loanDetailCore(id));
  }
  protected async loanPaymentCore(
    id: number,
    input: { date: string; principal: number; interest: number; fees: number; account_id: number }
  ) {
    const detail = await this.loanDetailCore(id);
    if (!detail) throw new Error('Loan not found.');
    this.amount(input.principal, true);
    if (input.principal + input.interest + input.fees <= 0)
      throw new Error('Enter principal, interest or fees greater than zero.');
    this.amount(input.interest, true);
    this.amount(input.fees, true);
    if (input.principal > detail.outstanding)
      throw new Error('Principal payment exceeds the outstanding principal.');
    if (!validDate(input.date) || input.date < detail.loan.start_date)
      throw new Error('Payment date must be on or after loan start.');
    await this.requireAsset(input.account_id);
    const loan = detail.loan;
    const principalTx = input.principal
      ? await this.insertTransactionCore({
          type: 'transfer',
          amount: input.principal,
          account_id: loan.direction === 'borrowed' ? input.account_id : loan.account_id,
          destination_account_id:
            loan.direction === 'borrowed' ? loan.account_id : input.account_id,
          category_id: null,
          date: input.date,
          description: `Loan principal: ${loan.name}`,
          notes: '',
          component: 'principal',
          loan_id: id,
        })
      : null;
    const component = async (amount: number, kind: 'interest' | 'fee') =>
      amount
        ? this.insertTransactionCore({
            type: loan.direction === 'borrowed' ? 'expense' : 'income',
            amount,
            account_id: input.account_id,
            destination_account_id: null,
            category_id: loan.category_id,
            date: input.date,
            description: `Loan ${kind}: ${loan.name}`,
            notes: '',
            component: kind,
            loan_id: id,
          })
        : null;
    const interestTx = await component(input.interest, 'interest'),
      feeTx = await component(input.fees, 'fee');
    await this.db.runAsync(
      'INSERT INTO loan_payments(loan_id,date,principal,interest,fees,principal_transaction_id,interest_transaction_id,fee_transaction_id,created_at) VALUES (?,?,?,?,?,?,?,?,?)',
      id,
      input.date,
      input.principal,
      input.interest,
      input.fees,
      principalTx,
      interestTx,
      feeTx,
      new Date().toISOString()
    );
    const payment = (await this.db.getFirstAsync<{ id: number }>('SELECT last_insert_rowid() id'))!
      .id;
    if (input.principal === detail.outstanding)
      await this.db.runAsync("UPDATE loans SET status='closed' WHERE id=?", id);
    return payment;
  }
  recordLoanPayment(id: number, input: Parameters<AdvancedRepository['loanPaymentCore']>[1]) {
    return this.write(async () => {
      let payment = 0;
      await this.db.withTransactionAsync(async () => {
        payment = await this.loanPaymentCore(id, input);
      });
      return payment;
    });
  }
  reverseLoanPayment(id: number) {
    return this.write(() =>
      this.db.withTransactionAsync(async () => {
        const p = await this.db.getFirstAsync<LoanPayment>(
          "SELECT * FROM loan_payments WHERE id=? AND status='posted'",
          id
        );
        if (!p) throw new Error('Payment is already reversed or missing.');
        for (const tx of [
          p.principal_transaction_id,
          p.interest_transaction_id,
          p.fee_transaction_id,
        ])
          if (tx) {
            await this.reverseTransactionCore(tx, 'Loan payment correction');
            await this.db.runAsync(
              "UPDATE transactions SET status='void',updated_at=? WHERE id=?",
              new Date().toISOString(),
              tx
            );
          }
        await this.db.runAsync("UPDATE loan_payments SET status='void' WHERE id=?", id);
        await this.db.runAsync("UPDATE loans SET status='active' WHERE id=?", p.loan_id);
      })
    );
  }
  recalculateLoan(id: number, start: string, periods: number) {
    return this.write(() =>
      this.db.withTransactionAsync(async () => {
        const detail = await this.loanDetailCore(id);
        if (!detail || !validDate(start) || start < detail.loan.start_date)
          throw new Error('Choose a valid recalculation date.');
        const rows = loanForecast({
          principal: detail.outstanding,
          originalPrincipal: detail.loan.principal,
          rateBps: detail.loan.annual_rate_bps ?? 0,
          method: detail.loan.interest_method,
          frequency: detail.loan.frequency,
          periods,
          start,
        });
        const version =
          (await this.db.getFirstAsync<{ n: number }>(
            'SELECT COALESCE(MAX(version),0) n FROM loan_schedules WHERE loan_id=?',
            id
          ))!.n + 1;
        await this.db.runAsync(
          "UPDATE loan_schedules SET status='superseded' WHERE loan_id=? AND status='scheduled'",
          id
        );
        for (const row of rows)
          await this.db.runAsync(
            'INSERT INTO loan_schedules(loan_id,due_date,principal,interest,version,paid_principal_baseline,paid_interest_baseline,payment_id_baseline) VALUES (?,?,?,?,?,?,?,?)',
            id,
            row.due_date,
            row.principal,
            row.interest,
            version,
            detail.payments
              .filter((p) => p.status === 'posted')
              .reduce((sum, p) => sum + p.principal, 0),
            detail.interest_paid,
            Math.max(0, ...detail.payments.map((p) => p.id))
          );
        await this.db.runAsync(
          'UPDATE loans SET updated_at=? WHERE id=?',
          new Date().toISOString(),
          id
        );
      })
    );
  }
  saveRecurring(
    input: Omit<RecurringRule, 'id' | 'next_index' | 'status' | 'created_at' | 'updated_at'>,
    id?: number
  ) {
    return this.write(async () => {
      this.amount(input.amount);
      if (
        !validDate(input.start_date) ||
        (input.end_date && (!validDate(input.end_date) || input.end_date < input.start_date)) ||
        !input.description.trim() ||
        !['daily', 'weekly', 'monthly', 'quarterly', 'yearly'].includes(input.frequency)
      )
        throw new Error('Enter valid recurrence details.');
      await this.requireAsset(input.account_id);
      if (input.type === 'loan_payment') {
        const loan = await this.db.getFirstAsync<Loan>(
          'SELECT * FROM loans WHERE id=?',
          input.loan_id
        );
        if (!loan || loan.status !== 'active' || input.category_id !== null)
          throw new Error('Select an active loan.');
      } else {
        const c = await this.db.getFirstAsync<{ type: string; archived: number }>(
          'SELECT type,archived FROM categories WHERE id=?',
          input.category_id
        );
        if (!c || c.archived || c.type !== input.type || input.loan_id !== null)
          throw new Error('Select a compatible active category.');
      }
      const old = id
        ? await this.db.getFirstAsync<RecurringRule>('SELECT * FROM recurring_rules WHERE id=?', id)
        : null;
      if (id && !old) throw new Error('Rule not found.');
      if (old && (old.frequency !== input.frequency || old.start_date !== input.start_date))
        throw new Error(
          'Keep the original frequency/start date. Cancel and create a new rule to change the calendar anchor.'
        );
      const args = [
        input.type,
        input.amount,
        input.account_id,
        input.category_id,
        input.loan_id,
        input.description,
        input.start_date,
        input.end_date,
        input.frequency,
        new Date().toISOString(),
      ];
      if (id)
        await this.db.runAsync(
          'UPDATE recurring_rules SET type=?,amount=?,account_id=?,category_id=?,loan_id=?,description=?,start_date=?,end_date=?,frequency=?,updated_at=? WHERE id=?',
          ...args,
          id
        );
      else
        await this.db.runAsync(
          'INSERT INTO recurring_rules(type,amount,account_id,category_id,loan_id,description,start_date,end_date,frequency,updated_at,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
          ...args,
          args[9]
        );
    });
  }
  recurringStatus(id: number, status: RecurringRule['status']) {
    return this.write(() =>
      this.db.withTransactionAsync(async () => {
        if (!['enabled', 'paused', 'cancelled'].includes(status))
          throw new Error('Invalid rule status.');
        await this.db.runAsync(
          'UPDATE recurring_rules SET status=?,updated_at=? WHERE id=?',
          status,
          new Date().toISOString(),
          id
        );
        if (status === 'cancelled')
          await this.db.runAsync(
            "UPDATE recurring_occurrences SET status='cancelled',updated_at=? WHERE rule_id=? AND status='scheduled'",
            new Date().toISOString(),
            id
          );
      })
    );
  }
  recurring() {
    return this.write(async () => {
      await this.db.withTransactionAsync(async () => {
        const enabled = await this.db.getAllAsync<RecurringRule>(
          "SELECT * FROM recurring_rules WHERE status='enabled'"
        );
        for (const rule of enabled) {
          if (
            await this.db.getFirstAsync(
              "SELECT id FROM recurring_occurrences WHERE rule_id=? AND status='scheduled' AND scheduled_date>?",
              rule.id,
              localDate()
            )
          )
            continue;
          let index = rule.next_index;
          for (let count = 0; count < 120; count++) {
            const date = scheduledDate(rule.start_date, rule.frequency, index);
            if (rule.end_date && date > rule.end_date) break;
            const now = new Date().toISOString();
            await this.db.runAsync(
              'INSERT OR IGNORE INTO recurring_occurrences(rule_id,scheduled_date,occurrence_index,created_at,updated_at) VALUES (?,?,?,?,?)',
              rule.id,
              date,
              index,
              now,
              now
            );
            index++;
            if (date > localDate()) break;
          }
          await this.db.runAsync(
            'UPDATE recurring_rules SET next_index=? WHERE id=?',
            index,
            rule.id
          );
        }
      });
      return {
        rules: await this.db.getAllAsync<RecurringRule>(
          'SELECT * FROM recurring_rules ORDER BY status,start_date'
        ),
        occurrences: await this.db.getAllAsync<Occurrence>(
          `SELECT o.*,r.description,r.amount,r.status rule_status FROM recurring_occurrences o JOIN recurring_rules r ON r.id=o.rule_id ORDER BY CASE WHEN o.status='scheduled' THEN 0 ELSE 1 END, CASE WHEN o.status='scheduled' THEN o.scheduled_date END ASC, o.scheduled_date DESC,o.id DESC LIMIT 500`
        ),
      };
    });
  }
  occurrenceAction(id: number, action: 'skip' | 'confirm') {
    return this.write(() =>
      this.db.withTransactionAsync(async () => {
        const o = await this.db.getFirstAsync<Occurrence>(
          "SELECT * FROM recurring_occurrences WHERE id=? AND status='scheduled'",
          id
        );
        if (!o) throw new Error('Occurrence was already handled.');
        const rule = await this.db.getFirstAsync<RecurringRule>(
          'SELECT * FROM recurring_rules WHERE id=?',
          o.rule_id
        );
        if (!rule || rule.status !== 'enabled')
          throw new Error('Resume the rule before confirming or skipping.');
        if (action === 'skip') {
          await this.db.runAsync(
            "UPDATE recurring_occurrences SET status='skipped',updated_at=? WHERE id=?",
            new Date().toISOString(),
            id
          );
          return;
        }
        if (rule.end_date && o.scheduled_date > rule.end_date)
          throw new Error(
            'This occurrence is beyond the rule end date. Skip it or extend the rule.'
          );
        if (o.scheduled_date > localDate())
          throw new Error('Future occurrences remain scheduled until their date.');
        let transaction: number | null = null,
          payment: number | null = null;
        await this.requireAsset(rule.account_id);
        if (rule.type === 'loan_payment')
          payment = await this.loanPaymentCore(rule.loan_id!, {
            date: o.scheduled_date,
            principal: rule.amount,
            interest: 0,
            fees: 0,
            account_id: rule.account_id,
          });
        else
          transaction = await this.insertTransactionCore({
            type: rule.type,
            amount: rule.amount,
            account_id: rule.account_id,
            destination_account_id: null,
            category_id: rule.category_id,
            date: o.scheduled_date,
            description: rule.description,
            notes: `Recurring rule ${rule.id}`,
            component: 'standard',
          });
        await this.db.runAsync(
          "UPDATE recurring_occurrences SET status='completed',transaction_id=?,loan_payment_id=?,updated_at=? WHERE id=?",
          transaction,
          payment,
          new Date().toISOString(),
          id
        );
      })
    );
  }
}
