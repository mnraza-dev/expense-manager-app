import { useState } from 'react';
import { Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import type { DateRange } from '../types';
import type { ReportPreset } from '../utils/periods';
import { presetRange, validateRange } from '../utils/periods';
import { localDate, validDate } from '../utils/finance';
import { Button, Card, Choices, Field, Label } from './ui';
const options: { value: ReportPreset; label: string }[] = [
  { value: 'this-month', label: 'This month' },
  { value: 'previous-month', label: 'Previous month' },
  { value: '3-months', label: 'Last 3 months' },
  { value: '6-months', label: 'Last 6 months' },
  { value: 'this-year', label: 'This year' },
  { value: 'previous-year', label: 'Previous year' },
  { value: 'custom', label: 'Custom range' },
];
export function DateRangeSelector({
  value,
  onChange,
}: {
  value: DateRange;
  onChange: (range: DateRange) => void;
}) {
  const [preset, setPreset] = useState<ReportPreset>('this-month');
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const [picker, setPicker] = useState<'start' | 'end' | null>(null);
  const selected = picker && validDate(draft[picker]) ? draft[picker] : localDate();
  const [y, m, d] = selected.split('-').map(Number);
  return (
    <Card>
      <Choices
        label="Report period"
        value={preset}
        options={options}
        onChange={(p) => {
          setPreset(p);
          setError(null);
          if (p !== 'custom') {
            const range = presetRange(p);
            setDraft(range);
            onChange(range);
          } else setDraft(value);
        }}
      />
      {preset === 'custom' && (
        <>
          <Field
            label="Start date (YYYY-MM-DD)"
            value={draft.start}
            onChangeText={(start) => setDraft((v) => ({ ...v, start }))}
          />
          <Button secondary title="Choose start date" onPress={() => setPicker('start')} />
          <Field
            label="End date (YYYY-MM-DD)"
            value={draft.end}
            onChangeText={(end) => setDraft((v) => ({ ...v, end }))}
          />
          <Button secondary title="Choose end date" onPress={() => setPicker('end')} />
          {picker && (
            <DateTimePicker
              mode="date"
              display={Platform.OS === 'ios' ? 'inline' : 'default'}
              value={new Date(y, m - 1, d)}
              onChange={(_, date) => {
                if (date && picker) setDraft((v) => ({ ...v, [picker]: localDate(date) }));
                setPicker(null);
              }}
            />
          )}
          {error && <Label>{error}</Label>}
          <Button
            title="Apply date range"
            onPress={() => {
              try {
                validateRange(draft);
                setError(null);
                onChange({ ...draft });
              } catch (e) {
                setError(e instanceof Error ? e.message : 'Check your range.');
              }
            }}
          />
        </>
      )}
      <Label small>
        {value.start} — {value.end} · Inclusive dates
      </Label>
      <Label small>
        Month/year presets include the full calendar period. Last 3/6 months include the current
        month.
      </Label>
    </Card>
  );
}
