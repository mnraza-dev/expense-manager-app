import { useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  ShoppingBasket,
  BriefcaseBusiness,
  Heart,
  House,
  Car,
  Gift,
  Tag,
} from 'lucide-react-native';
import {
  Button,
  Card,
  Choices,
  Field,
  Label,
  Screen,
  confirm,
  showError,
} from '../../src/components/ui';
import { useFinance } from '../../src/store/useFinance';
import { repo } from '../../src/db/database';
import type { Category } from '../../src/types';
const icons = {
  basket: ShoppingBasket,
  briefcase: BriefcaseBusiness,
  heart: Heart,
  home: House,
  car: Car,
  gift: Gift,
  tag: Tag,
};
const schema = z.object({
  name: z.string().trim().min(1, 'Category name is required.').max(80),
  type: z.enum(['expense', 'income']),
  icon: z.string(),
  color: z.string().regex(/^#[\da-f]{6}$/i, 'Use a hex color such as #35A78C.'),
});
type Values = z.infer<typeof schema>;
export default function Categories() {
  const { categories, mutate } = useFinance();
  const [editing, setEditing] = useState<Category | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', type: 'expense', icon: 'basket', color: '#E29B52' },
  });
  function open(category: Category | null) {
    setEditing(category);
    reset(category ?? { name: '', type: 'expense', icon: 'basket', color: '#E29B52' });
  }
  const submit = async (v: Values) => {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    try {
      await mutate(() => repo().saveCategory(v, editing?.id));
      setEditing(undefined);
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
      title="Categories"
      subtitle="Organize your income and expenses"
      back
      action={() => open(null)}>
      {editing !== undefined && (
        <Card>
          <Label>{editing ? 'Edit category' : 'Create category'}</Label>
          <Controller
            name="name"
            control={control}
            render={({ field }) => (
              <Field
                label="Name"
                value={field.value}
                onChangeText={field.onChange}
                error={errors.name?.message}
              />
            )}
          />
          {!editing && (
            <Controller
              name="type"
              control={control}
              render={({ field }) => (
                <Choices
                  label="Type"
                  value={field.value}
                  onChange={field.onChange}
                  options={[
                    { value: 'expense', label: 'Expense' },
                    { value: 'income', label: 'Income' },
                  ]}
                />
              )}
            />
          )}
          <Controller
            name="icon"
            control={control}
            render={({ field }) => (
              <Choices
                label="Icon"
                value={field.value}
                onChange={field.onChange}
                options={Object.keys(icons).map((v) => ({ value: v, label: v }))}
              />
            )}
          />
          <Controller
            name="color"
            control={control}
            render={({ field }) => (
              <>
                <Choices
                  label="Color"
                  value={field.value}
                  onChange={field.onChange}
                  options={['#E29B52', '#35A78C', '#6C78CF', '#CE7651', '#C66099'].map((v) => ({
                    value: v,
                    label: v,
                  }))}
                />
                <Field
                  label="Custom hex color"
                  value={field.value}
                  onChangeText={field.onChange}
                  error={errors.color?.message}
                />
              </>
            )}
          />
          <Button title="Save category" busy={busy} onPress={() => void save()} />
          <Button secondary title="Cancel editing" onPress={() => setEditing(undefined)} />
          {editing && (
            <Button
              secondary
              title={editing.archived ? 'Restore category' : 'Archive category'}
              onPress={() =>
                confirm(
                  editing.archived ? 'Restore category?' : 'Archive category?',
                  'Existing transactions will keep this category.',
                  async () => {
                    await mutate(() => repo().archiveCategory(editing.id, !editing.archived));
                    setEditing(undefined);
                  }
                )
              }
            />
          )}
        </Card>
      )}
      {(['expense', 'income'] as const).map((type) => (
        <View key={type}>
          <Label>{type === 'expense' ? 'Expense categories' : 'Income categories'}</Label>
          {categories
            .filter((c) => c.type === type)
            .map((cat) => {
              const Icon = icons[cat.icon as keyof typeof icons] ?? Tag;
              return (
                <Pressable key={cat.id} onPress={() => open(cat)} style={{ marginVertical: 5 }}>
                  <Card>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                      <Icon color={cat.color} size={22} />
                      <View>
                        <Label>{cat.name}</Label>
                        {!!cat.archived && <Label small>Archived · preserved in history</Label>}
                      </View>
                    </View>
                  </Card>
                </Pressable>
              );
            })}
        </View>
      ))}
    </Screen>
  );
}
