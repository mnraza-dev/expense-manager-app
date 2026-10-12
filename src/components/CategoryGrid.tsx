import { MotionPressable } from './Motion';
import { Text, View } from 'react-native';
import { CategoryIcon } from './CategoryIcon';
import { useFinance } from '../store/useFinance';
import { useMemo } from 'react';
import { Label, useTheme } from './ui';
export function CategoryGrid({
  options,
  value,
  onChange,
}: {
  options: { value: number; label: string }[];
  value: number | undefined;
  onChange: (id: number) => void;
}) {
  const c = useTheme();
  const categories = useFinance((state) => state.categories);
  const icons = useMemo(() => new Map(categories.map((row) => [row.id, row.icon])), [categories]);
  return (
    <View>
      <Label small>Category</Label>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {options.map((o) => (
          <MotionPressable
            key={o.value}
            accessibilityRole="button"
            accessibilityState={{ selected: o.value === value }}
            onPress={() => onChange(o.value)}
            style={{
              width: '30%',
              flexGrow: 1,
              minHeight: 64,
              padding: 8,
              gap: 6,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: o.value === value ? c.accent : c.border,
              alignItems: 'center',
              backgroundColor: o.value === value ? c.soft : c.card,
            }}>
            <View
              style={{
                width: 34,
                height: 34,
                borderRadius: 10,
                backgroundColor: c.soft,
                alignItems: 'center',
                justifyContent: 'center',
              }}>
              <CategoryIcon
                name={o.label}
                icon={icons.get(o.value)}
                color={o.value === value ? c.accent : c.muted}
              />
            </View>
            <Text style={{ color: c.text, textAlign: 'center', fontSize: 13 }}>{o.label}</Text>
          </MotionPressable>
        ))}
      </View>
    </View>
  );
}
