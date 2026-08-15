import React from 'react';
import { TextField as MuiTextField } from '@mui/material';
import { Field, FieldComponent, FieldComponentProps, fieldDisplayValue, fieldLabel, Fields } from '../Field';

export type DateFieldProps<F extends Fields> = Field<string, F> & {
  /** Render a native datetime-local input (date + time) instead of a date input */
  includeTime?: boolean;
};

/**
 * A date field rendered as a native date input (`datetime-local` when `includeTime` is set) —
 * no date-picker dependency required. The field value is the input's own string format:
 * 'YYYY-MM-DD', or 'YYYY-MM-DDTHH:mm' with `includeTime`; empty string when unset.
 */
export function dateField<F extends Fields>(props: DateFieldProps<F>): FieldComponent<string, F> {
  const { includeTime } = props;

  return {
    field: props,
    component: DateField,
  };

  function DateField(props: FieldComponentProps<string, F>) {
    const { field, onChange } = props;
    const [error, setError] = React.useState(false);
    const [statusMessage, setStatusMessage] = React.useState<string>();

    return (
      <MuiTextField
        sx={{
          display: 'flex',
          flexWrap: 'nowrap',
        }}
        key={field.name}
        label={fieldLabel(field)}
        type={includeTime ? 'datetime-local' : 'date'}
        value={fieldDisplayValue(field)}
        error={error}
        helperText={statusMessage ? statusMessage : field.description}
        required={field.accessibility?.required}
        // Native date inputs always show their placeholder chrome; keep the label floated so it
        // never overlaps.
        InputLabelProps={{ shrink: true }}
        InputProps={{ readOnly: field.accessibility?.readonly }}
        onChange={(event) => {
          let errorReceived = false;
          let messageReceived: string;
          onChange(field, event.target.value, (message: string, isError: boolean) => {
            setError(isError);
            setStatusMessage(message);
            errorReceived = isError;
            messageReceived = message;
          }).then(() => {
            // setFieldStatus may not be called in Field.onChange, but we still want to run after Form.onChange
            if (!errorReceived) {
              setError(false);
            }

            if (!messageReceived) {
              setStatusMessage(undefined);
            }
          });
        }}
      />
    );
  }
}
