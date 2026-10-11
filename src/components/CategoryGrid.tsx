import { MotionPressable } from './Motion';
import { Text, View } from 'react-native';
import { CategoryIcon } from './CategoryIcon';
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
            }}>
            <CategoryIcon name={o.label} />
            <Text style={{ color: c.text, textAlign: 'center', fontSize: 13 }}>{o.label}</Text>
          </MotionPressable>
        ))}
      </View>
    </View>
  );
}
