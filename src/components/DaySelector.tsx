import { useState } from 'react';
import { Platform, Text, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { localDate } from '../utils/finance';
import { shiftDay } from '../utils/periods';
import { MotionPressable } from './Motion';
import { styles, useTheme } from './ui';

export function DaySelector({
  date,
  onChange,
}: {
  date: string;
  onChange: (date: string) => void;
}) {
  const c = useTheme();
  const [picker, setPicker] = useState(false);
  const [year, month, day] = date.split('-').map(Number);
  const value = new Date(year, month - 1, day);
  const today = localDate();
  return (
    <View style={{ gap: 8 }}>
      <View style={styles.row}>
        <MotionPressable
          accessibilityRole="button"
          accessibilityLabel="Previous day"
          onPress={() => onChange(shiftDay(date, -1))}
          style={styles.touch}>
          <ChevronLeft color={c.text} />
        </MotionPressable>
        <MotionPressable
          accessibilityRole="button"
          accessibilityLabel={`Choose date, ${date}`}
          onPress={() => setPicker((open) => !open)}
          style={{
            flex: 1,
            minHeight: 48,
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
          }}>
          <Text style={{ color: c.text, textAlign: 'center', fontWeight: '600' }}>
            {value.toLocaleDateString('en-IN', {
              weekday: 'short',
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })}
          </Text>
          <View style={{ flexDirection: 'row', gap: 5, alignItems: 'center' }}>
            <CalendarDays size={14} color={c.accent} />
            <Text style={{ color: c.accent, fontSize: 12 }}>Choose date</Text>
          </View>
        </MotionPressable>
        <MotionPressable
          accessibilityRole="button"
          accessibilityLabel="Next day"
          onPress={() => onChange(shiftDay(date, 1))}
          style={styles.touch}>
          <ChevronRight color={c.text} />
        </MotionPressable>
      </View>
      <MotionPressable
        accessibilityRole="button"
        accessibilityLabel="Show today's transactions"
        accessibilityState={{ disabled: date === today }}
        disabled={date === today}
        onPress={() => onChange(today)}
        style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
        <Text
          style={{ color: date === today ? c.muted : c.accent, fontSize: 13, fontWeight: '600' }}>
          {date === today ? 'Today' : 'Back to today'}
        </Text>
      </MotionPressable>
      {picker && (
        <DateTimePicker
          mode="date"
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          value={value}
          onDismiss={() => setPicker(false)}
          onValueChange={(_, selected) => {
            if (selected) onChange(localDate(selected));
            setPicker(false);
          }}
        />
      )}
    </View>
  );
}
