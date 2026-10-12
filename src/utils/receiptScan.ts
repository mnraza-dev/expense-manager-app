import type { Category, Transaction } from '../types';
import type { ReceiptDraft } from './receipts';
import { minor, validDate } from './finance';
import { normalizeDigits } from './spokenNumbers';
import { suggestedExpenseCategory } from './voiceExpenses';

export interface ReceiptAmountCandidate {
  amount: string;
  label: string;
  priority: number;
}
export interface ReceiptScanDraft {
  merchant: string;
  amount: string;
  date: string;
  category: number | null;
  candidates: ReceiptAmountCandidate[];
  warnings: string[];
  text: string;
  receipt: ReceiptDraft;
}
export type ParsedReceipt = Omit<ReceiptScanDraft, 'receipt'>;

const totalExcluded =
  /sub\s*total|tax|cgst|sgst|igst|discount|saving|tender|cash\s+paid|change|balance\s+due\s+before|items?|quantity|\bqty\b|points|उप.?योग|कर|छूट/iu;
function totalPriority(line: string) {
  if (totalExcluded.test(line)) return 0;
  if (
    /grand\s*total|net\s*(?:total|payable)|amount\s*(?:payable|due)|total\s*(?:payable|amount|due)|कुल\s*(?:राशि|योग)|भुगतान/iu.test(
      line
    )
  )
    return 3;
  if (/\btotal\b|\bpayable\b|कुल|योग/iu.test(line)) return 2;
  return 0;
}
function amounts(line: string): string[] {
  const values: string[] = [];
  const source = line.replace(/\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/g, ' ');
  // Decimal comma and OCR O/0 substitutions are deliberately left for manual correction.
  for (const match of source.matchAll(
    /(?<![\p{L}\p{N}.,-])-?(?:\d{1,3}(?:,\d{2,3})+|\d+)(?:\.\d{1,2})?(?![\p{L}\p{N}.,])/gu
  )) {
    try {
      if (
        match[0].includes(',') &&
        !/^(?:\d{1,3}(?:,\d{3})+|\d{1,2}(?:,\d{2})*,\d{3})(?:\.\d{1,2})?$/.test(match[0])
      )
        continue;
      const value = minor(match[0].replace(/,/g, ''));
      if (value > 0) values.push((value / 100).toFixed(2));
    } catch {
      // Unsupported signs, precision or sizes must not produce an inferred amount.
    }
  }
  return [...new Set(values)];
}
const months: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};
function receiptDates(text: string) {
  const dates = new Set<string>();
  let invalid = false,
    numeric = false;
  const add = (year: number, month: number, day: number) => {
    const value = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (validDate(value)) dates.add(value);
    else invalid = true;
  };
  for (const match of text.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g))
    add(Number(match[1]), Number(match[2]), Number(match[3]));
  for (const match of text.matchAll(/\b(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})\b/g)) {
    numeric = true;
    add(Number(match[3]), Number(match[2]), Number(match[1]));
  }
  for (const match of text.matchAll(
    /\b(\d{1,2})[\s-]+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)[\s,-]+(\d{4})\b/giu
  ))
    add(Number(match[3]), months[match[2].slice(0, 3).toLowerCase()], Number(match[1]));
  return { dates: [...dates], invalid, numeric };
}
export function parseReceiptText(text: string, categories: Category[]): ParsedReceipt {
  if (text.length > 20000)
    throw new Error('This receipt has too much text. Enter the expense details manually.');
  const normalized = normalizeDigits(text).replace(/\r/g, '');
  const lines = normalized
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const warnings: string[] = [];
  const candidates: ReceiptAmountCandidate[] = [];
  for (let i = 0; i < lines.length; i++) {
    const priority = totalPriority(lines[i]);
    if (!priority) continue;
    let found = amounts(lines[i]);
    if (
      !found.length &&
      lines[i + 1] &&
      /^[₹\s\d,.-]+$|^(?:rs\.?|inr)\s*[\d,.-]+$/iu.test(lines[i + 1])
    )
      found = amounts(lines[i + 1]);
    for (const amount of found)
      candidates.push({ amount, label: lines[i].slice(0, 120), priority });
  }
  candidates.sort((a, b) => b.priority - a.priority);
  const top = [
    ...new Set(
      candidates.filter((c) => c.priority === candidates[0]?.priority).map((c) => c.amount)
    ),
  ];
  let amount = top.length === 1 ? top[0] : '';
  if (!amount)
    warnings.push(
      top.length > 1
        ? 'Several totals were found. Choose the paid total or enter it manually.'
        : 'No reliable paid total was found. Enter the amount manually.'
    );
  if (/\b(?:usd|eur|gbp|aed|pkr)\b|[$€£]/iu.test(normalized)) {
    amount = '';
    candidates.length = 0;
    warnings.push(
      'A different currency may be printed on this receipt. Enter the paid amount in INR manually; no currency conversion is inferred.'
    );
  }
  const foundDates = receiptDates(normalized);
  const date = !foundDates.invalid && foundDates.dates.length === 1 ? foundDates.dates[0] : '';
  if (!date)
    warnings.push(
      'Choose the purchase date. Missing, invalid or conflicting dates are not replaced with today.'
    );
  else if (foundDates.numeric)
    warnings.push('The scanned numeric date uses day/month/year order. Confirm the purchase date.');
  const merchant =
    lines
      .slice(0, 8)
      .find(
        (line) =>
          /[\p{L}]/u.test(line) &&
          line.length >= 3 &&
          line.length <= 160 &&
          !/invoice|receipt|welcome|thank\s*you|customer\s*copy|tax\s*bill|gstin|gst\s*(?:no|number)|phone|mobile|tel\b|www\.|@|\bdate\b|\b(?:road|street|lane|pin|address)\b|\d{5,}|^\s*(?:bill|order|table|token|cashier)\b/iu.test(
            line
          ) &&
          !totalPriority(line)
      ) ?? '';
  if (!merchant) warnings.push('Merchant was not identified. Add a description while reviewing.');
  let category = suggestedExpenseCategory(merchant, categories);
  if (category === null) {
    const target = /restaurant|cafe|dining|bakery|रेस्टोरेंट|भोजन/iu.test(merchant)
      ? /food|dining|भोजन/iu
      : /grocery|supermarket|mart\b|किराना/iu.test(merchant)
        ? /grocer|food|किराना/iu
        : /pharma|medical|clinic|hospital/iu.test(merchant)
          ? /health|medical/iu
          : /fuel|petrol|diesel/iu.test(merchant)
            ? /transport|travel/iu
            : null;
    category = target
      ? (categories.find((c) => !c.archived && c.type === 'expense' && target.test(c.name))?.id ??
        null)
      : null;
  }
  if (category === null) warnings.push('Choose an expense category while reviewing.');
  if (!lines.length)
    warnings.unshift('No readable text was found. Try a sharper image or enter details manually.');
  return { merchant, amount, date, category, candidates: candidates.slice(0, 12), warnings, text };
}

export function possibleReceiptDuplicates(
  transactions: Transaction[],
  input: { amount: string; date: string; account: number }
): Transaction[] {
  let amount: number;
  try {
    amount = minor(input.amount);
  } catch {
    return [];
  }
  if (!validDate(input.date) || amount <= 0) return [];
  return transactions
    .filter(
      (t) =>
        t.type === 'expense' &&
        !t.refund_of_id &&
        t.status !== 'void' &&
        t.amount === amount &&
        t.date === input.date &&
        t.account_id === input.account
    )
    .slice(0, 5);
}

export function scanResize(width: number, height: number) {
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    width * height > 24_000_000
  )
    throw new Error('Choose an image of at most 24 megapixels.');
  if (Math.max(width, height) <= 2400) return undefined;
  return width >= height ? { width: 2400 } : { height: 2400 };
}
