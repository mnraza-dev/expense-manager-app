import { useRef, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button, Choices, Field, Label, showError } from './ui';
import { minor, validDate } from '../utils/finance';
export interface FormField {
  name: string;
  label: string;
  kind?: 'amount' | 'date' | 'integer' | 'text';
  optional?: boolean;
  zero?: boolean;
  choices?:
    | { value: string; label: string }[]
    | ((values: Record<string, string>) => { value: string; label: string }[]);
  hint?: string;
}
export function AdvancedForm({
  fields,
  defaults,
  onSubmit,
  title = 'Save',
  cancel,
}: {
  fields: FormField[];
  defaults: Record<string, string>;
  onSubmit: (values: Record<string, string>) => Promise<unknown>;
  title?: string;
  cancel?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const schema = z.record(z.string(), z.string()).superRefine((values, ctx) => {
    for (const field of fields) {
      const value = values[field.name] ?? '';
      let message: string | undefined;
      if (!value.trim()) {
        if (!field.optional) message = 'This field is required.';
      } else if (field.kind === 'amount') {
        try {
          const n = minor(value);
          if (n < (field.zero ? 0 : 1)) message = 'Enter a positive amount.';
        } catch (e) {
          message = e instanceof Error ? e.message : 'Invalid amount.';
        }
      } else if (field.kind === 'date' && !validDate(value))
        message = 'Use a valid YYYY-MM-DD date.';
      else if (
        field.kind === 'integer' &&
        (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)))
      )
        message = 'Enter a whole number.';
      if (message) ctx.addIssue({ code: 'custom', path: [field.name], message });
    }
  });
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<Record<string, string>>({ resolver: zodResolver(schema), defaultValues: defaults });
  const values = useWatch({ control }) as Record<string, string>;
  const submit = async (v: Record<string, string>) => {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    try {
      await onSubmit(v);
    } catch (e) {
      showError(e);
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };
  const save = () => handleSubmit(submit)();
  return (
    <>
      {fields.map((field) => (
        <Controller
          key={field.name}
          control={control}
          name={field.name}
          render={({ field: input }) => {
            const options =
              typeof field.choices === 'function' ? field.choices(values) : field.choices;
            return (
              <>
                {options ? (
                  <>
                    <Choices
                      label={field.label}
                      value={input.value}
                      options={options}
                      onChange={input.onChange}
                    />
                    {errors[field.name]?.message && (
                      <Label small>{String(errors[field.name]?.message)}</Label>
                    )}
                  </>
                ) : (
                  <Field
                    label={field.label}
                    inputRef={input.ref}
                    onBlur={input.onBlur}
                    value={input.value ?? ''}
                    onChangeText={input.onChange}
                    error={errors[field.name]?.message as string | undefined}
                    keyboardType={
                      field.kind === 'amount'
                        ? 'decimal-pad'
                        : field.kind === 'integer'
                          ? 'number-pad'
                          : 'default'
                    }
                  />
                )}{' '}
                {field.hint && <Label small>{field.hint}</Label>}
              </>
            );
          }}
        />
      ))}
      <Button title={title} busy={busy} onPress={() => void save()} />
      {cancel && <Button secondary title="Cancel" onPress={cancel} />}
    </>
  );
}
