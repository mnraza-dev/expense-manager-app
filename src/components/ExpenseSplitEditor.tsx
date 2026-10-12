import { Button, Card, Choices, Field, Label } from './ui';
import type { Category, ExpenseSplit } from '../types';
export interface SplitDraft {
  category_id: number;
  amount: string;
}
export const splitDrafts = (parts: ExpenseSplit[]): SplitDraft[] =>
  parts.map((p) => ({ category_id: p.category_id, amount: (p.amount / 100).toFixed(2) }));
export function ExpenseSplitEditor({
  parts,
  onChange,
  categories,
  busy,
}: {
  parts: SplitDraft[];
  onChange: (parts: SplitDraft[]) => void;
  categories: Category[];
  busy: boolean;
}) {
  return (
    <Card>
      <Label>Split category amounts</Label>
      <Label small>
        Each category appears once. Amounts must add up exactly to the transaction total.
      </Label>
      {parts.map((p, i) => (
        <Card key={i}>
          <Choices
            label={`Category ${i + 1}`}
            value={p.category_id}
            options={categories
              .filter((c) => c.id === p.category_id || !parts.some((a) => a.category_id === c.id))
              .map((c) => ({ value: c.id, label: c.name + (c.archived ? ' (archived)' : '') }))}
            onChange={(category_id) => {
              if (!busy) onChange(parts.map((a, j) => (j === i ? { ...a, category_id } : a)));
            }}
          />
          <Field
            label={`Amount ${i + 1} (₹)`}
            keyboardType="decimal-pad"
            value={p.amount}
            editable={!busy}
            onChangeText={(amount) =>
              onChange(parts.map((a, j) => (j === i ? { ...a, amount } : a)))
            }
          />
          {parts.length > 2 && (
            <Button
              secondary
              title={`Remove category ${i + 1}`}
              disabled={busy}
              onPress={() => onChange(parts.filter((_, j) => j !== i))}
            />
          )}
        </Card>
      ))}
      <Button
        secondary
        title="Add split category"
        disabled={
          busy ||
          parts.length >= 20 ||
          !categories.some((c) => !parts.some((p) => p.category_id === c.id))
        }
        onPress={() => {
          const c = categories.find((c) => !parts.some((p) => p.category_id === c.id));
          if (c) onChange([...parts, { category_id: c.id, amount: '' }]);
        }}
      />
    </Card>
  );
}
