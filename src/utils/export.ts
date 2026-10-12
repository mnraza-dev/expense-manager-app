import { validDate } from './finance';
export type ExportFilters = {
  start?: string;
  end?: string;
  account?: number;
  category?: number;
  type?: string;
};
export type ExportRow = {
  refund_of_id?: number | null;
  id: number;
  date: string;
  type: string;
  description: string;
  amount: number;
  currency: string;
  account: string;
  destination: string | null;
  category: string | null;
  notes: string;
  created_at: string;
};
export function validateExportFilters(f: ExportFilters) {
  if (
    (f.start && !validDate(f.start)) ||
    (f.end && !validDate(f.end)) ||
    (f.start && f.end && f.start > f.end)
  )
    throw new Error('Choose a valid inclusive date range.');
  if (f.type && !['income', 'expense', 'transfer'].includes(f.type))
    throw new Error('Invalid transaction type.');
  for (const id of [f.account, f.category])
    if (id !== undefined && (!Number.isSafeInteger(id) || id <= 0))
      throw new Error('Invalid export selection.');
}
export function csvCell(value: string | number | null) {
  let text = value == null ? '' : String(value);
  if (typeof value === 'string' && /^[\s\u0000-\u001f]*[=+\-@]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}
export function transactionCSV(rows: ExportRow[]) {
  const headers = [
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
    'Refund of transaction',
  ];
  const lines = rows.map((r) =>
    [
      r.id,
      r.date,
      r.type,
      r.description,
      (r.amount / 100).toFixed(2),
      r.currency,
      r.account,
      r.destination,
      r.category,
      r.notes,
      r.created_at,
      r.refund_of_id ?? null,
    ]
      .map(csvCell)
      .join(',')
  );
  return '\uFEFF' + [headers.map(csvCell).join(','), ...lines].join('\r\n') + '\r\n';
}
