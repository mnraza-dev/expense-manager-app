import { useState } from 'react';
import { Button, Label, Screen } from '../../src/components/ui';
import { Breakdown } from '../../src/features/Breakdown';
import { useFinance } from '../../src/store/useFinance';
import { localDate, money, summary } from '../../src/utils/finance';
export default function Reports() {
  const [date, setDate] = useState(() => new Date());
  const transactions = useFinance((s) => s.transactions);
  const totals = summary(transactions, localDate(date).slice(0, 7));
  return (
    <Screen title="Reports" subtitle="Understand your spending">
      <Label>{date.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</Label>
      <Button
        secondary
        title="← Previous month"
        onPress={() => setDate(new Date(date.getFullYear(), date.getMonth() - 1, 1))}
      />
      <Button
        secondary
        title="Next month →"
        onPress={() => setDate(new Date(date.getFullYear(), date.getMonth() + 1, 1))}
      />
      <Label>Income {money(totals.income)}</Label>
      <Label>Expenses {money(totals.expense)}</Label>
      <Label>Net cash flow {money(totals.net)}</Label>
      <Breakdown rows={totals.rows} />
    </Screen>
  );
}
