import type { ExportRow } from './export';
import { expenseCurrencyTotals, expenseGroups, type ExpensePeriod } from './expenseReports';
export const MAX_PDF_EXPENSES = 1000;
export function escapeHTML(text: string) {
  return text.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!
  );
}
export function expenseReportHTML(rows: ExportRow[], title: string, period: ExpensePeriod): string {
  const expenses = rows.filter((r) => r.type === 'expense');
  if (expenses.length > MAX_PDF_EXPENSES)
    throw new Error(
      'PDF supports up to 1,000 expenses per report. Choose a smaller period or export Excel for larger ranges.'
    );
  const amount = (v: number, currency: string) => `${escapeHTML(currency)} ${(v / 100).toFixed(2)}`;
  const totals = expenseCurrencyTotals(expenses);
  const groupPeriod = period === 'all' ? 'monthly' : period;
  const groups = expenseGroups(expenses, groupPeriod);
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHTML(title)}</title>
  <style>@page{size:A4;margin:18mm 14mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#172020;font-size:10px;line-height:1.5;margin:0}header{border-bottom:3px solid #176c57;padding-bottom:14px;margin-bottom:20px}.brand{font-size:22px;font-weight:700;color:#176c57}h1{font-size:16px;margin:6px 0}h2{font-size:13px;margin:22px 0 8px}.meta{color:#5e6b66}.total{font-size:19px;font-weight:700;margin:8px 0}table{border-collapse:collapse;width:100%;table-layout:fixed}thead{display:table-header-group}th{background:#edf4f0;text-align:left;color:#345249;font-size:9px}td,th{padding:8px 6px;border-bottom:1px solid #dce5df;vertical-align:top;overflow-wrap:anywhere}tr{break-inside:avoid}td.amount,th.amount{text-align:right;white-space:nowrap}.notes{white-space:pre-wrap;font-size:9px;color:#5e6b66;margin-top:3px}.summary{max-width:420px}footer{margin-top:20px;padding-top:10px;border-top:1px solid #dce5df;color:#5e6b66;font-size:9px}</style></head><body>
  <header><div class="brand">Settler</div><h1>${escapeHTML(title)}</h1><div class="meta">Expense report · ${expenses.length} entries · weeks start Monday</div></header>
  ${totals.map((total) => `<div class="total">${amount(total.amount, total.currency)}</div>`).join('') || '<p>No expenses in this period.</p>'}
  <h2>${groupPeriod === 'daily' ? 'Daily' : groupPeriod === 'weekly' ? 'Weekly' : 'Monthly'} totals</h2>
  <table class="summary"><thead><tr><th>Period${groupPeriod === 'weekly' ? ' (Monday)' : ''}</th><th>Entries</th><th class="amount">Expenses</th></tr></thead><tbody>${groups.map((g) => `<tr><td>${escapeHTML(g.period)}</td><td>${g.count}</td><td class="amount">${amount(g.amount, g.currency)}</td></tr>`).join('')}</tbody></table>
  <h2>Expense details</h2><table><colgroup><col style="width:15%"><col style="width:36%"><col style="width:28%"><col style="width:21%"></colgroup><thead><tr><th>Date</th><th>Description / notes</th><th>Category / account</th><th class="amount">Amount</th></tr></thead><tbody>${expenses.map((row) => `<tr><td>${escapeHTML(row.date)}</td><td dir="auto">${escapeHTML(row.description)}${row.notes ? `<div class="notes" dir="auto">${escapeHTML(row.notes)}</div>` : ''}</td><td dir="auto">${escapeHTML(row.category ?? 'Uncategorized')}<br><span class="meta">${escapeHTML(row.account)}</span></td><td class="amount">${amount(row.amount, row.currency)}</td></tr>`).join('')}</tbody></table>
  <footer>Amounts are grouped by currency. Income and transfers are excluded. Receipt files are not included. This report is an export, not a restorable financial backup.</footer>
  </body></html>`;
}
