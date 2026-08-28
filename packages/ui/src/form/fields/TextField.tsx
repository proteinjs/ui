import React from 'react';
import { InputAdornment, TextField as MuiTextField, IconButton } from '@mui/material';
import { Visibility, VisibilityOff } from '@mui/icons-material';
import { Field, FieldComponent, FieldComponentProps, fieldDisplayValue, fieldLabel, Fields } from '../Field';

export type TextFieldProps<T, F extends Fields> = Field<T, F> & {
  isPassword?: boolean;
  /** Render a multiline input (long-text columns; single-line inputs truncate them). */
  multiline?: boolean;
  /** Rows the multiline input starts at (default 3). Only meaningful with `multiline`. */
  minRows?: number;
  /** Rows the multiline input grows to before scrolling (default 8). Only meaningful with `multiline`. */
  maxRows?: number;
  /** Monospace value text — structured values (JSON) read as code, not prose. */
  monospace?: boolean;
};

export function textField<F extends Fields>(props: TextFieldProps<string, F>): FieldComponent<string, F> {
  const { isPassword, multiline, minRows, maxRows, monospace } = props;

  return {
    field: props,
    component: TextField,
  };

  function TextField(props: FieldComponentProps<string, F>) {
    const { field, onChange, ...other } = props;
    const [error, setError] = React.useState(false);
    const [statusMessage, setStatusMessage] = React.useState<string>();
    const [passwordVisible, setPasswordVisible] = React.useState(false);

    return (
      <MuiTextField
        sx={{
          display: 'flex',
          flexWrap: 'nowrap',
        }}
        key={field.name}
        label={fieldLabel(field)}
        type={isPassword && !passwordVisible ? 'password' : 'text'}
        multiline={multiline}
        minRows={multiline ? minRows ?? 3 : undefined}
        maxRows={multiline ? maxRows ?? 8 : undefined}
        value={fieldDisplayValue(field)}
        error={error}
        helperText={statusMessage ? statusMessage : field.description}
        required={field.accessibility?.required}
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
        InputProps={{
          // readOnly (not disabled): a disabled input blocks text selection, so values like ids
          // and timestamps couldn't be copied out of readonly fields.
          readOnly: field.accessibility?.readonly,
          ...(monospace ? { sx: { fontFamily: 'ui-monospace, Menlo, monospace', fontSize: '0.8125rem' } } : {}),
          endAdornment: isPassword && (
            <InputAdornment position='end'>
              <IconButton
                aria-label='Toggle password visibility'
                onClick={(event) => setPasswordVisible(!passwordVisible)}
              >
                {passwordVisible ? <VisibilityOff /> : <Visibility />}
              </IconButton>
            </InputAdornment>
          ),
        }}
        {...other}
      />
    );
  }
}
