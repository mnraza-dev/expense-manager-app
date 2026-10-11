import type { Category } from '../types';
import { localDate, minor, validDate } from './finance';
import { normalizeDigits, normalizeSpokenAmounts } from './spokenNumbers';
export interface VoiceExpenseDraft {
  id: string;
  description: string;
  amount: string;
  date: string;
  category: number | null;
}
export interface VoiceParseResult {
  expenses: VoiceExpenseDraft[];
  warnings: string[];
}
const currency = '(?:rupees?|rs\\.?|inr|रुपये|रुपया|रुपए|روپے|روپیہ|₹)';
const number = '-?(?:\\d{1,3}(?:,\\d{2,3})+|\\d+)(?:\\.\\d+)?';
const amountExpression = new RegExp(`(${number})\\s*${currency}|${currency}\\s*(${number})`, 'giu');
const todayWords = /(?<![\p{L}\p{M}])(?:today|aaj|आज|آج)(?![\p{L}\p{M}])/giu;
const beforeYesterdayWords = /(?<![\p{L}\p{M}])(?:day before yesterday)(?![\p{L}\p{M}])/giu;
const afterTomorrowWords = /(?<![\p{L}\p{M}])(?:day after tomorrow)(?![\p{L}\p{M}])/giu;
const yesterdayWords =
  /(?<![\p{L}\p{M}])(?:yesterday|बीते कल|कल बीते|گزشتہ روز|گزشتہ کل)(?![\p{L}\p{M}])/giu;
const tomorrowWords = /(?<![\p{L}\p{M}])(?:tomorrow)(?![\p{L}\p{M}])/giu;
const ambiguousDays = /(?<![\p{L}\p{M}])(?:kal|कल|کل|parso|परसों|پرسوں)(?![\p{L}\p{M}])/iu;
function shifted(today: string, days: number) {
  const [y, m, d] = today.split('-').map(Number);
  return localDate(new Date(y, m - 1, d + days, 12));
}
function dateIn(
  text: string,
  today: string
): { date: string; ambiguous: boolean; cleaned: string } {
  let cleaned = normalizeDigits(text);
  const dates: string[] = [];
  cleaned = cleaned.replace(/\b\d{4}-\d{2}-\d{2}\b/g, (date) => {
    dates.push(validDate(date) ? date : '');
    return ' ';
  });
  for (const [pattern, offset] of [
    [beforeYesterdayWords, -2],
    [afterTomorrowWords, 2],
    [todayWords, 0],
    [yesterdayWords, -1],
    [tomorrowWords, 1],
  ] as const)
    cleaned = cleaned.replace(pattern, () => {
      dates.push(shifted(today, offset));
      return ' ';
    });
  const relative =
    /(?<![\p{L}\p{M}])(?:(\d+)\s+days?\s+ago|(\d+)\s+दिन\s+पहले|(\d+)\s+دن\s+پہلے)(?![\p{L}\p{M}])/giu;
  cleaned = cleaned.replace(relative, (_, a, b, c) => {
    const days = Number(a ?? b ?? c);
    dates.push(days <= 3650 ? shifted(today, -days) : '');
    return ' ';
  });
  const ambiguous =
    ambiguousDays.test(cleaned) ||
    dates.includes('') ||
    new Set(dates).size > 1 ||
    /\b(?:last\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|week)|on\s+\d{1,2}[/-]\d{1,2}|[a-z]+\s+days?\s+ago)\b/iu.test(
      cleaned
    );
  cleaned = cleaned.replace(new RegExp(ambiguousDays.source, 'giu'), ' ');
  return { date: ambiguous ? '' : (dates[0] ?? today), ambiguous, cleaned };
}
function descriptionIn(text: string) {
  return text
    .replace(
      /(?<![\p{L}\p{M}])(?:i|have|had|has|ate|eaten|taken|take|drank|drink|bought|buy|paid|spent|for|on|at|of|the|a|an|and|then|also|please|add|expense|expenses|rupees?|rs|inr|main|maine|ne|khaya|khayi|khai|pi|liya|liye|li|ki|ka|ke|mein|par|aur|phir|मैंने|मैं|ने|खाया|खाई|खायी|पी|लिया|ली|लिए|की|का|के|पर|में|और|खर्च|किए|रुपये|रुपया|روپے|روپیہ|میں|نے|کھایا|کھائی|پی|لیا|لی|کی|کا|کے|پر|اور|خرچ|کیا)(?![\p{L}\p{M}])/giu,
      ' '
    )
    .replace(/[₹,;:।۔!?]/g, ' ')
    .replace(/^[\s.\-]+|[\s.\-]+$/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, 160)
    .trim();
}
export function suggestedExpenseCategory(
  description: string,
  categories: Category[]
): number | null {
  const active = categories.filter((c) => !c.archived && c.type === 'expense');
  const matched = active.find((c) =>
    description.toLocaleLowerCase().includes(c.name.toLocaleLowerCase())
  );
  if (matched) return matched.id;
  const food =
    /biryani|tea|coffee|lunch|dinner|breakfast|food|chai|chay|बिरयानी|बिरियानी|चाय|खाना|بریانی|چائے|کھانا/i.test(
      description
    );
  const travel =
    /taxi|bus|train|uber|auto|petrol|diesel|टैक्सी|बस|ट्रेन|पेट्रोल|ٹیکسی|بس|پٹرول/i.test(
      description
    );
  const target = food
    ? /food|dining|भोजन|खाना|کھانا/i
    : travel
      ? /transport|travel|यात्रा|سفر/i
      : null;
  return target ? (active.find((c) => target.test(c.name))?.id ?? null) : null;
}
export function parseVoiceExpenses(
  transcript: string,
  categories: Category[],
  today = localDate()
): VoiceParseResult {
  if (!validDate(today)) throw new Error('Invalid local reference date.');
  if (transcript.length > 4000) throw new Error('Keep each dictation under 4,000 characters.');
  const warnings: string[] = [];
  const text = normalizeSpokenAmounts(transcript);
  // A trailing date applies to the whole sentence ("... biryani ... and tea ... today").
  const globalDate = dateIn(text, today);
  const clauses = text
    .split(/\s+(?:and|then|aur|phir|और|फिर|اور|پھر)\s+|[;\n।۔]+/iu)
    .filter((s) => s.trim());
  const expenses: VoiceExpenseDraft[] = [];
  for (const clause of clauses) {
    if (
      /(?<![\p{L}\p{M}])(?:minus|negative|माइनस|ऋणात्मक|منفی|مائنس)(?![\p{L}\p{M}])/iu.test(
        clause
      ) ||
      /\d\s*(?:to|से|سے|[-–])\s*\d/iu.test(clause.replace(/\b\d{4}-\d{2}-\d{2}\b/g, ''))
    ) {
      warnings.push('Use one exact positive amount for each expense.');
      continue;
    }
    const amounts = [...clause.matchAll(amountExpression)];
    if (!amounts.length) {
      if (descriptionIn(dateIn(clause, today).cleaned))
        warnings.push(`No rupee amount found in: ${clause.trim()}`);
      continue;
    }
    if (amounts.length > 1) {
      warnings.push(
        'Separate expenses with “and”, “aur” or a new line so each item has one amount.'
      );
      continue;
    }
    const match = amounts[0];
    const rawAmount = (match[1] ?? match[2]).replace(/,/g, '');
    let amount = '';
    try {
      if (minor(rawAmount) <= 0) throw new Error();
      amount = (minor(rawAmount) / 100).toFixed(2);
    } catch {
      warnings.push(`Check this amount: ${match[0]}`);
      continue;
    }
    const ownDate = dateIn(clause, today);
    const hasOwnDate = ownDate.cleaned !== normalizeDigits(clause);
    const chosen = hasOwnDate ? ownDate : globalDate;
    if (chosen.ambiguous)
      warnings.push('A date is unclear. Set the date for each affected expense before saving.');
    const withoutAmount =
      clause.slice(0, match.index) + ' ' + clause.slice(match.index! + match[0].length);
    const description = descriptionIn(dateIn(withoutAmount, today).cleaned);
    if (!description) warnings.push('Add a description for the expense with no item name.');
    expenses.push({
      id: String(expenses.length + 1),
      description,
      amount,
      date: chosen.date,
      category: suggestedExpenseCategory(description, categories),
    });
  }
  if (expenses.length > 20) throw new Error('Dictate at most 20 expenses at a time.');
  if (!expenses.length && !warnings.length)
    warnings.push(
      'Say an item and its rupee amount, for example “biryani 140 rupees and tea 15 rupees today”.'
    );
  return { expenses, warnings: [...new Set(warnings)] };
}
