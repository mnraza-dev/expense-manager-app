import type { DB } from './adapter';
import { receiptCountSQL } from './receiptSchema';
import type {
  Budget,
  BudgetAllocation,
  BudgetInput,
  BudgetDetail,
  BudgetProgress,
  BudgetComparison,
  Category,
  CategoryTotal,
  CategoryMonth,
  DateRange,
  PeriodTotal,
  Report,
  Transaction,
  TransactionFilters,
  TransactionPage,
  TransactionDay,
} from '../types';
import { MAX_MONEY, validDate } from '../utils/finance';
import { reportMetrics } from '../utils/reports';
import { calendarDays, fillPeriods, monthRange, validateRange } from '../utils/periods';
const orders = {
  newest: 't.date DESC,t.id DESC',
  oldest: 't.date ASC,t.id ASC',
  highest: 't.amount DESC,t.date DESC,t.id DESC',
  lowest: 't.amount ASC,t.date DESC,t.id DESC',
} as const;
export class AnalyticsRepository {
  protected queue: Promise<unknown> = Promise.resolve();
  constructor(protected db: DB) {}
  protected write<T>(task: () => Promise<T>): Promise<T> {
    const next = this.queue.then(task);
    this.queue = next.catch(() => {});
    return next;
  }
  protected read<T>(task: () => Promise<T>): Promise<T> {
    return this.write(task);
  }
  getBudget(id: number): Promise<BudgetDetail | null> {
    return this.read(async () => {
      const budget = await this.db.getFirstAsync<Budget>('SELECT * FROM budgets WHERE id=?', id);
      return budget
        ? {
            budget,
            allocations: await this.db.getAllAsync<BudgetAllocation>(
              'SELECT * FROM budget_categories WHERE budget_id=? ORDER BY id',
              id
            ),
          }
        : null;
    });
  }
  budgetHistory(): Promise<Budget[]> {
    return this.read(() =>
      this.db.getAllAsync<Budget>('SELECT * FROM budgets ORDER BY period_start DESC,id DESC')
    );
  }
  saveBudget(input: BudgetInput, id?: number): Promise<number> {
    return this.write(async () => {
      const range = monthRange(input.month);
      if (!input.name.trim() || input.name.trim().length > 100)
        throw new Error('Enter a budget name of up to 100 characters.');
      const validAmount = (v: number) => Number.isSafeInteger(v) && v > 0 && v <= MAX_MONEY;
      if (!validAmount(input.total_limit_minor))
        throw new Error('Enter a positive total limit with at most two decimals.');
      if (new Set(input.allocations.map((a) => a.category_id)).size !== input.allocations.length)
        throw new Error('Each category can have only one allocation.');
      if (input.allocations.some((a) => !validAmount(a.limit_minor)))
        throw new Error('Every allocation must be a positive amount.');
      if (input.allocations.reduce((s, a) => s + a.limit_minor, 0) > input.total_limit_minor)
        throw new Error('Category allocations must fit within the total budget.');
      let savedId = id ?? 0;
      await this.db.withTransactionAsync(async () => {
        const duplicate = await this.db.getFirstAsync<{ id: number }>(
          'SELECT id FROM budgets WHERE period_start=? AND id<>?',
          range.start,
          id ?? 0
        );
        if (duplicate)
          throw new Error('A budget already exists for this month. Edit that budget instead.');
        if (id && !(await this.db.getFirstAsync<Budget>('SELECT * FROM budgets WHERE id=?', id)))
          throw new Error('Budget no longer exists.');
        const previous = id
          ? await this.db.getAllAsync<BudgetAllocation>(
              'SELECT * FROM budget_categories WHERE budget_id=?',
              id
            )
          : [];
        for (const allocation of input.allocations) {
          const cat = await this.db.getFirstAsync<Category>(
            'SELECT * FROM categories WHERE id=?',
            allocation.category_id
          );
          if (
            !cat ||
            cat.type !== 'expense' ||
            (cat.archived && !previous.some((a) => a.category_id === cat.id))
          )
            throw new Error(
              'Allocations require active expense categories. Existing archived allocations may be retained.'
            );
        }
        const now = new Date().toISOString();
        if (id)
          await this.db.runAsync(
            'UPDATE budgets SET name=?,period_start=?,period_end=?,total_limit_minor=?,updated_at=? WHERE id=?',
            input.name.trim(),
            range.start,
            range.end,
            input.total_limit_minor,
            now,
            id
          );
        else {
          await this.db.runAsync(
            'INSERT INTO budgets(name,period_start,period_end,total_limit_minor,created_at,updated_at) VALUES (?,?,?,?,?,?)',
            input.name.trim(),
            range.start,
            range.end,
            input.total_limit_minor,
            now,
            now
          );
          savedId = (await this.db.getFirstAsync<{ id: number }>('SELECT last_insert_rowid() id'))!
            .id;
        }
        // Preserve unchanged allocation identities and their creation timestamps.
        for (const old of previous)
          if (!input.allocations.some((a) => a.category_id === old.category_id))
            await this.db.runAsync('DELETE FROM budget_categories WHERE id=?', old.id);
        for (const a of input.allocations)
          await this.db.runAsync(
            'INSERT INTO budget_categories(budget_id,category_id,limit_minor,created_at,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(budget_id,category_id) DO UPDATE SET limit_minor=excluded.limit_minor,updated_at=excluded.updated_at',
            savedId,
            a.category_id,
            a.limit_minor,
            now,
            now
          );
      });
      return savedId;
    });
  }
  deleteBudget(id: number) {
    return this.write(() => this.db.runAsync('DELETE FROM budgets WHERE id=?', id));
  }
  private categoryTotals(range: DateRange): Promise<CategoryTotal[]> {
    return this.db.getAllAsync<CategoryTotal>(
      `SELECT c.id,c.name,c.color,c.type,SUM(t.amount) amount FROM active_transactions t JOIN categories c ON c.id=t.category_id WHERE t.date BETWEEN ? AND ? AND t.type IN ('income','expense') GROUP BY c.id ORDER BY amount DESC,c.id`,
      range.start,
      range.end
    );
  }
  spendingByCategory(range: DateRange) {
    validateRange(range);
    return this.read(async () =>
      (await this.categoryTotals(range)).filter((c) => c.type === 'expense')
    );
  }
  private comparisons(range: DateRange) {
    return this.db.getAllAsync<BudgetComparison>(
      `SELECT b.id budget_id,substr(b.period_start,1,7) month,c.id category_id,c.name,c.color,bc.limit_minor allocated,COALESCE(SUM(t.amount),0) spent FROM budgets b JOIN budget_categories bc ON bc.budget_id=b.id JOIN categories c ON c.id=bc.category_id LEFT JOIN active_transactions t ON t.category_id=c.id AND t.type='expense' AND t.date BETWEEN b.period_start AND b.period_end AND t.date BETWEEN ? AND ? WHERE b.period_start<=? AND b.period_end>=? GROUP BY bc.id ORDER BY b.period_start,c.name,c.id`,
      range.start,
      range.end,
      range.end,
      range.start
    );
  }
  budgetProgress(month: string): Promise<BudgetProgress> {
    return this.read(async () => {
      const range = monthRange(month);
      const budget = await this.db.getFirstAsync<Budget>(
        'SELECT * FROM budgets WHERE period_start=?',
        range.start
      );
      const spending = (await this.categoryTotals(range)).filter((c) => c.type === 'expense');
      const categories = budget
        ? await this.db.getAllAsync<BudgetComparison & { archived: number }>(
            `SELECT b.id budget_id,substr(b.period_start,1,7) month,c.id category_id,c.name,c.color,c.archived,bc.limit_minor allocated,COALESCE(SUM(t.amount),0) spent FROM budgets b JOIN budget_categories bc ON bc.budget_id=b.id JOIN categories c ON c.id=bc.category_id LEFT JOIN active_transactions t ON t.category_id=c.id AND t.type='expense' AND t.date BETWEEN b.period_start AND b.period_end WHERE b.id=? GROUP BY bc.id ORDER BY c.name,c.id`,
            budget.id
          )
        : [];
      return {
        budget,
        spent: spending.reduce((s, c) => s + c.amount, 0),
        categories,
        unbudgeted: spending.filter((c) => !categories.some((a) => a.category_id === c.id)),
      };
    });
  }
  report(range: DateRange): Promise<Report> {
    validateRange(range);
    return this.read(async () => {
      const totals = await this.db.getFirstAsync<{
        income: number;
        expense: number;
        count: number;
      }>(
        `SELECT COALESCE(SUM(CASE WHEN type='income' THEN amount ELSE 0 END),0) income,COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END),0) expense,COUNT(*) count FROM active_transactions WHERE date BETWEEN ? AND ?`,
        range.start,
        range.end
      );
      const daily = calendarDays(range) <= 31 && range.start.slice(0, 7) === range.end.slice(0, 7);
      const periodExpr = daily ? 'date' : 'substr(date,1,7)';
      const raw = await this.db.getAllAsync<PeriodTotal>(
        `SELECT ${periodExpr} period,SUM(CASE WHEN type='income' THEN amount ELSE 0 END) income,SUM(CASE WHEN type='expense' THEN amount ELSE 0 END) expense,COUNT(*) count FROM active_transactions WHERE date BETWEEN ? AND ? GROUP BY period ORDER BY period`,
        range.start,
        range.end
      );
      const categories = await this.categoryTotals(range);
      const categoryMonths = await this.db.getAllAsync<CategoryMonth>(
        `SELECT substr(t.date,1,7) period,c.id category_id,c.name,SUM(t.amount) amount FROM active_transactions t JOIN categories c ON c.id=t.category_id WHERE t.type='expense' AND t.date BETWEEN ? AND ? GROUP BY period,c.id ORDER BY period,c.id`,
        range.start,
        range.end
      );
      const highestDays = await this.db.getAllAsync<{ date: string; amount: number }>(
        `SELECT date,SUM(amount) amount FROM active_transactions WHERE type='expense' AND date BETWEEN ? AND ? GROUP BY date ORDER BY amount DESC,date DESC LIMIT 7`,
        range.start,
        range.end
      );
      const recent = await this.db.getAllAsync<Transaction>(
        'SELECT * FROM active_transactions WHERE date BETWEEN ? AND ? ORDER BY date DESC,id DESC LIMIT 10',
        range.start,
        range.end
      );
      return {
        range,
        ...reportMetrics(totals ?? { income: 0, expense: 0, count: 0 }, range),
        categories,
        periods: fillPeriods(range, raw, daily),
        categoryMonths,
        highestDays,
        recent,
        budgetComparisons: await this.comparisons(range),
      };
    });
  }
  searchTransactions(
    filters: TransactionFilters = {},
    offset = 0,
    limit = 50
  ): Promise<TransactionPage> {
    if (
      !Number.isInteger(offset) ||
      offset < 0 ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 100
    )
      throw new Error('Invalid page size.');
    const { join, where, params } = this.transactionQuery(filters);
    return this.read(async () => {
      const count = await this.db.getFirstAsync<{ count: number }>(
        `SELECT COUNT(*) count${join}${where}`,
        ...params
      );
      const rows = await this.db.getAllAsync<Transaction>(
        `SELECT t.*,${receiptCountSQL}${join}${where} ORDER BY ${orders[filters.sort ?? 'newest']} LIMIT ? OFFSET ?`,
        ...params,
        limit,
        offset
      );
      return { rows, count: count?.count ?? 0 };
    });
  }
  transactionCalendar(month: string, filters: TransactionFilters = {}): Promise<TransactionDay[]> {
    const range = monthRange(month);
    const { join, where, params } = this.transactionQuery(filters);
    return this.read(() =>
      this.db.getAllAsync<TransactionDay>(
        `SELECT t.date,
          SUM(CASE WHEN t.type='income' THEN t.amount ELSE 0 END) income,
          SUM(CASE WHEN t.type='expense' THEN t.amount ELSE 0 END) expense,
          SUM(CASE WHEN t.type='transfer' THEN 1 ELSE 0 END) transfers,
          COUNT(*) count${join}${where}${where ? ' AND' : ' WHERE'} t.date BETWEEN ? AND ?
          GROUP BY t.date ORDER BY t.date`,
        ...params,
        range.start,
        range.end
      )
    );
  }
  private transactionQuery(filters: TransactionFilters) {
    if (
      (filters.start && !validDate(filters.start)) ||
      (filters.end && !validDate(filters.end)) ||
      (filters.start && filters.end && filters.start > filters.end)
    )
      throw new Error('Choose a valid date range.');
    for (const amount of [filters.min_amount, filters.max_amount])
      if (
        amount !== undefined &&
        (!Number.isSafeInteger(amount) || amount < 0 || amount > MAX_MONEY)
      )
        throw new Error('Enter a valid minimum and maximum amount.');
    if (
      filters.min_amount !== undefined &&
      filters.max_amount !== undefined &&
      filters.min_amount > filters.max_amount
    )
      throw new Error('Minimum amount cannot exceed maximum amount.');
    if (filters.type && !['income', 'expense', 'transfer'].includes(filters.type))
      throw new Error('Invalid transaction type.');
    if (filters.sort && !Object.hasOwn(orders, filters.sort))
      throw new Error('Invalid sort order.');
    const clauses: string[] = [];
    const params: (string | number)[] = [];
    if (filters.query?.trim()) {
      const literal = filters.query.trim().replace(/[\\%_]/g, '\\$&');
      clauses.push(
        "(t.description LIKE ? ESCAPE '\\' OR t.notes LIKE ? ESCAPE '\\' OR c.name LIKE ? ESCAPE '\\' OR a.name LIKE ? ESCAPE '\\' OR d.name LIKE ? ESCAPE '\\')"
      );
      for (let i = 0; i < 5; i++) params.push(`%${literal}%`);
    }
    if (filters.type) {
      clauses.push('t.type=?');
      params.push(filters.type);
    }
    if (filters.account_id) {
      clauses.push('(t.account_id=? OR t.destination_account_id=?)');
      params.push(filters.account_id, filters.account_id);
    }
    if (filters.category_id) {
      clauses.push('t.category_id=?');
      params.push(filters.category_id);
    }
    if (filters.start) {
      clauses.push('t.date>=?');
      params.push(filters.start);
    }
    if (filters.end) {
      clauses.push('t.date<=?');
      params.push(filters.end);
    }
    if (filters.min_amount !== undefined) {
      clauses.push('t.amount>=?');
      params.push(filters.min_amount);
    }
    if (filters.max_amount !== undefined) {
      clauses.push('t.amount<=?');
      params.push(filters.max_amount);
    }
    const join =
      ' FROM active_transactions t JOIN accounts a ON a.id=t.account_id LEFT JOIN accounts d ON d.id=t.destination_account_id LEFT JOIN categories c ON c.id=t.category_id';
    const where = clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '';
    return { join, where, params };
  }
}
