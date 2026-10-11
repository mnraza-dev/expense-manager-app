const words = new Map<string, number>();
const add = (value: number, aliases: string) =>
  aliases.split('|').forEach((word) => words.set(word, value));
const english = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
];
english.forEach((word, value) => add(value, word));
['twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'].forEach((word, i) =>
  add((i + 2) * 10, word)
);
const common = [
  'शून्य|صفر|sifar',
  'एक|ایک|ek',
  'दो|دو|do',
  'तीन|تین|teen',
  'चार|چار|chaar|char',
  'पांच|पाँच|پانچ|paanch|panch',
  'छह|چھ|cheh',
  'सात|سات|saat',
  'आठ|آٹھ|aath',
  'नौ|نو|nau',
  'दस|دس|das',
  'ग्यारह|گیارہ|gyarah',
  'बारह|بارہ|barah',
  'तेरह|تیرہ|terah',
  'चौदह|چودہ|chaudah',
  'पंद्रह|पन्द्रह|پندرہ|pandrah|pand ra',
  'सोलह|سولہ|solah',
  'सत्रह|سترہ|satrah',
  'अठारह|اٹھارہ|atharah',
  'उन्नीस|انیس|unnis',
];
common.forEach((aliases, value) => add(value, aliases));
add(20, 'बीस|بیس|bees');
add(25, 'पच्चीस|پچیس|pachis|pachees');
add(30, 'तीस|تیس|tees');
add(35, 'पैंतीस|پینتیس|paintis');
add(40, 'चालीस|چالیس|chalis|chaalis');
add(45, 'पैंतालीस|پینتالیس|paintalis');
add(50, 'पचास|پچاس|pachas');
add(55, 'पचपन|پچپن|pachpan');
add(60, 'साठ|ساٹھ|saath');
add(65, 'पैंसठ|پینسٹھ|painsath');
add(70, 'सत्तर|ستر|sattar');
add(75, 'पचहत्तर|پچھتر|pachhattar');
add(80, 'अस्सी|اسی|assi');
add(85, 'पचासी|پچاسی|pachasi');
add(90, 'नब्बे|نوے|nabbe');
add(95, 'पचानवे|پچانوے|pachanve');
const scales = new Map<string, number>();
for (const [value, aliases] of [
  [100, 'hundred|सौ|سو|sau'],
  [1000, 'thousand|हजार|हज़ार|ہزار|hazar'],
  [100000, 'lakh|लाख|لاکھ'],
  [10000000, 'crore|करोड़|کروڑ'],
] as const)
  aliases.split('|').forEach((word) => scales.set(word, value));
const connectors = new Set(['and']);
export function normalizeDigits(text: string) {
  return text.normalize('NFKC').replace(/[०-९٠-٩۰-۹]/g, (digit) => {
    const code = digit.charCodeAt(0);
    return String(code - (code >= 0x966 ? 0x966 : code >= 0x6f0 ? 0x6f0 : 0x660));
  });
}
// Recognize number words only in runs ending at an amount cue, so "one tea" remains a description.
export function normalizeSpokenAmounts(text: string) {
  const normalized = normalizeDigits(text)
    .replace(/[−–]/g, '-')
    .replace(/([a-z]+)-([a-z]+)/gi, '$1 $2');
  const tokens = [...normalized.matchAll(/[\p{L}\p{M}]+|\d+/gu)];
  const replacements: { start: number; end: number; value: string }[] = [];
  for (let i = 0; i < tokens.length; i++) {
    if (!words.has(tokens[i][0].toLowerCase())) continue;
    let j = i,
      total = 0,
      group = 0,
      found = false;
    for (; j < tokens.length; j++) {
      const word = tokens[j][0].toLowerCase();
      if (
        j > i &&
        !/^[\s-]*$/.test(
          normalized.slice(tokens[j - 1].index! + tokens[j - 1][0].length, tokens[j].index)
        )
      )
        break;
      if (words.has(word)) {
        group += words.get(word)!;
        found = true;
      } else if (j > i && /^\d+$/.test(word)) group += Number(word);
      else if (scales.has(word)) {
        const scale = scales.get(word)!;
        if (scale === 100) group = Math.max(1, group) * scale;
        else {
          total += Math.max(1, group) * scale;
          group = 0;
        }
      } else if (
        connectors.has(word) &&
        j + 1 < tokens.length &&
        words.has(tokens[j + 1][0].toLowerCase())
      )
        continue;
      else break;
    }
    if (!found) continue;
    const tail = normalized.slice(tokens[j - 1].index! + tokens[j - 1][0].length);
    if (!/^\s*(?:rupees?\b|rs\b|रुप(?:ये|या|ए)|روپ(?:ے|یہ)|₹)/iu.test(tail)) {
      i = j - 1;
      continue;
    }
    replacements.push({
      start: tokens[i].index!,
      end: tokens[j - 1].index! + tokens[j - 1][0].length,
      value: String(total + group),
    });
    i = j - 1;
  }
  // Apply all replacements against the original offsets, starting from the end.
  let result = normalized;
  for (const replacement of replacements.reverse())
    result = result.slice(0, replacement.start) + replacement.value + result.slice(replacement.end);
  return result;
}
