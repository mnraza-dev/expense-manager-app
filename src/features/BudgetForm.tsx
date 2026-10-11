import { notify } from '../store/useFeedback';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { Controller, useFieldArray, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button, Card, Choices, Field, Label, Screen, showError } from '../components/ui';
import { QueryState } from '../components/QueryState';
import { useDatabaseQuery } from '../hooks/useDatabaseQuery';
import { repo } from '../db/database';
import { useFinance } from '../store/useFinance';
import { localDate, minor } from '../utils/finance';
import { monthRange } from '../utils/periods';
const amount = z.string().refine((v) => {
  try {
    return minor(v) > 0;
  } catch {
    return false;
  }
}, 'Enter a positive amount with at most two decimals.');
const schema = z
  .object({
    name: z.string().trim().min(1, 'Enter a budget name.').max(100),
    month: z.string().refine((v) => {
      try {
        monthRange(v);
        return true;
      } catch {
        return false;
      }
    }, 'Use a valid YYYY-MM month.'),
    total: amount,
    allocations: z.array(
      z.object({ category_id: z.number().positive('Choose a category.'), amount })
    ),
  })
  .superRefine((v, ctx) => {
    if (new Set(v.allocations.map((a) => a.category_id)).size !== v.allocations.length)
      ctx.addIssue({
        code: 'custom',
        path: ['allocations'],
        message: 'Each category can be allocated once.',
      });
    try {
      if (v.allocations.reduce((s, a) => s + minor(a.amount), 0) > minor(v.total))
        ctx.addIssue({
          code: 'custom',
          path: ['allocations'],
          message: 'Allocations must fit within the total limit.',
        });
    } catch {
      /* Individual amount fields carry precision errors. */
    }
  });
type Values = z.infer<typeof schema>;
export function BudgetForm({ id, initialMonth }: { id?: number; initialMonth?: string }) {
  const router = useRouter();
  const categories = useFinance((s) => s.categories);
  const mutate = useFinance((s) => s.mutateBudget);
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const hydrated = useRef(false);
  const load = useCallback(() => (id ? repo().getBudget(id) : Promise.resolve(null)), [id]);
  const query = useDatabaseQuery(load, 'budget');
  const {
    control,
    reset,
    handleSubmit,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: 'Monthly spending plan',
      month: initialMonth ?? localDate().slice(0, 7),
      total: '',
      allocations: [],
    },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'allocations' });
  const allocations = useWatch({ control, name: 'allocations' });
  useEffect(() => {
    if (query.data && !hydrated.current) {
      hydrated.current = true;
      reset({
        name: query.data.budget.name,
        month: query.data.budget.period_start.slice(0, 7),
        total: (query.data.budget.total_limit_minor / 100).toFixed(2),
        allocations: query.data.allocations.map((a) => ({
          category_id: a.category_id,
          amount: (a.limit_minor / 100).toFixed(2),
        })),
      });
    }
  }, [query.data, reset]);
  const selectable = categories.filter(
    (c) =>
      c.type === 'expense' &&
      (!c.archived || query.data?.allocations.some((a) => a.category_id === c.id))
  );
  const submit = async (v: Values) => {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    try {
      await mutate(() =>
        repo().saveBudget(
          {
            name: v.name,
            month: v.month,
            total_limit_minor: minor(v.total),
            allocations: v.allocations.map((a) => ({
              category_id: a.category_id,
              limit_minor: minor(a.amount),
            })),
          },
          id
        )
      );
      notify('Budget saved');
      router.back();
    } catch (e) {
      showError(e);
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };
  const save = () => handleSubmit(submit)();
  return (
    <Screen
      title={id ? 'Edit budget' : 'New monthly budget'}
      subtitle="Give your spending a little direction"
      back>
      {id && (query.loading || query.error) ? (
        <QueryState {...query} />
      ) : id && query.data === null ? (
        <Label>This budget no longer exists.</Label>
      ) : (
        <>
          <Controller
            control={control}
            name="name"
            render={({ field }) => (
              <Field
                label="Budget name"
                value={field.value}
                onChangeText={field.onChange}
                error={errors.name?.message}
              />
            )}
          />
          <Controller
            control={control}
            name="month"
            render={({ field }) => (
              <Field
                label="Budget month (YYYY-MM)"
                value={field.value}
                onChangeText={field.onChange}
                error={errors.month?.message}
              />
            )}
          />
          <Controller
            control={control}
            name="total"
            render={({ field }) => (
              <Field
                label="Total monthly expense limit (₹)"
                keyboardType="decimal-pad"
                placeholder="Enter your limit"
                value={field.value}
                onChangeText={field.onChange}
                error={errors.total?.message}
              />
            )}
          />
          <Card>
            <Label>One total, optional allocations</Label>
            <Label small>
              Category limits are portions of the monthly limit, not extra budgets. Their sum must
              fit within the total. All expenses, including unallocated categories, count toward the
              total.
            </Label>
          </Card>
          <Label>Category allocations (optional)</Label>
          {fields.map((item, index) => (
            <Card key={item.id}>
              <Controller
                control={control}
                name={`allocations.${index}.category_id`}
                render={({ field }) => (
                  <Choices
                    label="Expense category"
                    value={field.value}
                    onChange={field.onChange}
                    options={selectable
                      .filter(
                        (c) =>
                          c.id === field.value || !allocations.some((a) => a.category_id === c.id)
                      )
                      .map((c) => ({
                        value: c.id,
                        label: c.name + (c.archived ? ' (archived)' : ''),
                      }))}
                  />
                )}
              />
              <Controller
                control={control}
                name={`allocations.${index}.amount`}
                render={({ field }) => (
                  <Field
                    label="Category limit (₹)"
                    keyboardType="decimal-pad"
                    value={field.value}
                    onChangeText={field.onChange}
                    error={errors.allocations?.[index]?.amount?.message}
                  />
                )}
              />
              <Button secondary title="Remove allocation" onPress={() => remove(index)} />
            </Card>
          ))}
          {errors.allocations?.message && <Label>{errors.allocations.message}</Label>}
          {errors.allocations?.root?.message && <Label>{errors.allocations.root.message}</Label>}
          {selectable.some((c) => !allocations.some((a) => a.category_id === c.id)) && (
            <Button
              secondary
              title="+ Add category allocation"
              onPress={() =>
                append({
                  category_id: selectable.find(
                    (c) => !allocations.some((a) => a.category_id === c.id)
                  )!.id,
                  amount: '',
                })
              }
            />
          )}
          <Button title="Save budget" busy={busy} onPress={() => void save()} />
          <Button secondary title="Cancel" onPress={() => router.back()} />
        </>
      )}
    </Screen>
  );
}
