import * as XLSX from 'xlsx';
import type { ExportRow } from './export';
import { expenseGroups } from './expenseReports';
export function transactionWorkbook(rows: ExportRow[]): Uint8Array {
  const workbook = XLSX.utils.book_new();
  const add = (name: string, data: (string | number | null)[][]) => {
    const sheet = XLSX.utils.aoa_to_sheet(data);
    sheet['!cols'] = data[0].map(() => ({ wch: 22 }));
    XLSX.utils.book_append_sheet(workbook, sheet, name);
    return sheet;
  };
  const sheet = add('Transactions', [
    [
      'Transaction ID',
      'Date',
      'Type',
      'Description',
      'Amount',
      'Currency',
      'Account',
      'Destination account',
      'Category',
      'Notes',
      'Created at',
    ],
    ...rows.map((r) => [
      r.id,
      r.date,
      r.type,
      r.description,
      r.amount / 100,
      r.currency,
      r.account,
      r.destination,
      r.category,
      r.notes,
      r.created_at,
    ]),
  ]);
  for (let i = 1; i <= rows.length; i++) sheet[XLSX.utils.encode_cell({ r: i, c: 4 })].z = '0.00';
  // All user text is a string cell, never a formula or executable hyperlink.
  const accounts = new Map<string, string>(),
    categories = new Set<string>();
  const months = new Map<
    string,
    { month: string; currency: string; income: bigint; expense: bigint; transfer: bigint }
  >();
  for (const r of rows) {
    accounts.set(r.account, r.currency);
    if (r.destination) accounts.set(r.destination, r.currency);
    if (r.category) categories.add(r.category);
    const key = r.date.slice(0, 7) + '|' + r.currency;
    if (!months.has(key))
      months.set(key, {
        month: r.date.slice(0, 7),
        currency: r.currency,
        income: 0n,
        expense: 0n,
        transfer: 0n,
      });
    const group = months.get(key)!;
    if (r.type === 'income' || r.type === 'expense' || r.type === 'transfer')
      group[r.type] += BigInt(r.amount);
  }
  add('Accounts', [
    ['Account', 'Currency'],
    ...Array.from(accounts, ([name, currency]) => [name, currency]),
  ]);
  add('Categories', [['Category'], ...Array.from(categories, (name) => [name])]);
  const decimal = (amount: bigint) => {
    if (amount > BigInt(Number.MAX_SAFE_INTEGER) || amount < -BigInt(Number.MAX_SAFE_INTEGER))
      throw new Error('Workbook totals exceed supported precision. Select a smaller range.');
    return Number(amount) / 100;
  };
  add('Monthly Summary', [
    ['Month', 'Currency', 'Income', 'Expenses', 'Net income', 'Transfer volume'],
    ...Array.from(months.values(), (m) => [
      m.month,
      m.currency,
      decimal(m.income),
      decimal(m.expense),
      decimal(m.income - m.expense),
      decimal(m.transfer),
    ]),
  ]);
  for (const [period, name] of [
    ['daily', 'Daily Expenses'],
    ['weekly', 'Weekly Expenses'],
    ['monthly', 'Monthly Expenses'],
  ] as const) {
    const groups = expenseGroups(rows, period);
    const summary = add(name, [
      [
        period === 'weekly' ? 'Week starting (Monday)' : 'Period',
        'Currency',
        'Expenses',
        'Expense count',
      ],
      ...groups.map((group) => [group.period, group.currency, group.amount / 100, group.count]),
    ]);
    for (let i = 1; i <= groups.length; i++)
      summary[XLSX.utils.encode_cell({ r: i, c: 2 })].z = '0.00';
  }
  return new Uint8Array(
    XLSX.write(workbook, { type: 'array', bookType: 'xlsx', compression: true })
  );
}
