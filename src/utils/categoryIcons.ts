export const categoryIconOptions = [
  { value: 'auto', label: 'Automatic' },
  { value: 'food', label: 'Food' },
  { value: 'groceries', label: 'Groceries' },
  { value: 'transport', label: 'Transport' },
  { value: 'fuel', label: 'Fuel' },
  { value: 'travel', label: 'Travel' },
  { value: 'home', label: 'Housing' },
  { value: 'utilities', label: 'Utilities' },
  { value: 'shopping', label: 'Shopping' },
  { value: 'health', label: 'Health' },
  { value: 'education', label: 'Education' },
  { value: 'entertainment', label: 'Entertainment' },
  { value: 'subscriptions', label: 'Subscriptions' },
  { value: 'bills', label: 'Bills' },
  { value: 'gift', label: 'Gifts' },
  { value: 'salary', label: 'Salary' },
  { value: 'business', label: 'Business' },
  { value: 'freelance', label: 'Freelance' },
  { value: 'savings', label: 'Savings' },
  { value: 'refund', label: 'Refunds' },
  { value: 'tag', label: 'Other' },
] as const;
export type CategoryIconName = (typeof categoryIconOptions)[number]['value'] | 'transfer';
const legacy: Record<string, CategoryIconName> = {
  basket: 'groceries',
  briefcase: 'salary',
  heart: 'health',
  car: 'transport',
};
const matches: [RegExp, CategoryIconName][] = [
  [/grocer|grocery|किराना|راشن/iu, 'groceries'],
  [/food|dining|restaurant|meal|भोजन|खाना|کھانا/iu, 'food'],
  [/fuel|petrol|diesel|पेट्रोल|پٹرول/iu, 'fuel'],
  [/transport|commut|bus|taxi|यातायात|سفر/iu, 'transport'],
  [/travel|flight|holiday|यात्रा/iu, 'travel'],
  [/utilit|electric|water|gas|बिजली|بجلی/iu, 'utilities'],
  [/rent|housing|home|mortgage|किराया|घर|کرایہ|گھر/iu, 'home'],
  [/health|medical|doctor|hospital|स्वास्थ्य|صحت/iu, 'health'],
  [/educat|school|college|tuition|शिक्षा|تعلیم/iu, 'education'],
  [/entertain|cinema|movie|music|मनोरंजन|تفریح/iu, 'entertainment'],
  [/subscription|membership|internet|phone|mobile/iu, 'subscriptions'],
  [/shop|clothes|clothing|खरीदारी|خریداری/iu, 'shopping'],
  [/salary|wages|payroll|वेतन|تنخواہ/iu, 'salary'],
  [/freelance|contract|side gig/iu, 'freelance'],
  [/business|sales|commerce/iu, 'business'],
  [/saving|investment|बचत|بچت/iu, 'savings'],
  [/refund|cashback|reimburse/iu, 'refund'],
  [/gift|donation|charity|उपहार|تحفہ/iu, 'gift'],
  [/bill|payment|insurance/iu, 'bills'],
];
export function categoryIconName(name: string, icon?: string, transfer = false): CategoryIconName {
  if (transfer) return 'transfer';
  const generic = !icon || icon === 'auto' || icon === 'basket' || icon === 'briefcase';
  if (!generic) {
    const chosen =
      legacy[icon!] ?? categoryIconOptions.find((option) => option.value === icon)?.value;
    if (chosen) return chosen;
  }
  const found = matches.find(([pattern]) => pattern.test(name.normalize('NFKC')))?.[1];
  return found ?? (icon ? legacy[icon] : undefined) ?? 'tag';
}
