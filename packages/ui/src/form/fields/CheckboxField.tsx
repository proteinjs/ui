import React from 'react';
import { Checkbox, FormControl, FormControlLabel, FormHelperText } from '@mui/material';
import { Field, FieldComponent, FieldComponentProps, fieldLabel, Fields } from '../Field';

/**
 * A boolean field rendered as a checkbox. The field value is a real boolean (unset renders
 * unchecked), so forms never round-trip booleans through 'True'/'False' strings.
 */
export function checkboxField<F extends Fields>(props: Field<boolean, F>): FieldComponent<boolean, F> {
  return {
    field: props,
    component: CheckboxField,
  };

  function CheckboxField(props: FieldComponentProps<boolean, F>) {
    const { field, onChange } = props;
    const [error, setError] = React.useState(false);
    const [statusMessage, setStatusMessage] = React.useState<string>();
    const helperText = statusMessage ? statusMessage : field.description;

    return (
      <FormControl error={error} required={field.accessibility?.required}>
        <FormControlLabel
          control={
            <Checkbox
              checked={!!field.value}
              disabled={field.accessibility?.readonly}
              onChange={(event) => {
                let errorReceived = false;
                let messageReceived: string;
                onChange(field, event.target.checked, (message: string, isError: boolean) => {
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
          }
          label={fieldLabel(field)}
        />
        {helperText && <FormHelperText>{helperText}</FormHelperText>}
      </FormControl>
    );
  }
}
