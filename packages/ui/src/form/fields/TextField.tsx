import React from 'react';
import { InputAdornment, TextField as MuiTextField, IconButton } from '@mui/material';
import { Visibility, VisibilityOff } from '@mui/icons-material';
import { Field, FieldComponent, FieldComponentProps, fieldDisplayValue, fieldLabel, Fields } from '../Field';

export type TextFieldProps<T, F extends Fields> = Field<T, F> & {
  isPassword?: boolean;
};

export function textField<F extends Fields>(props: TextFieldProps<string, F>): FieldComponent<string, F> {
  const { isPassword } = props;

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
        value={fieldDisplayValue(field)}
        error={error}
        helperText={statusMessage ? statusMessage : field.description}
        required={field.accessibility?.required}
        disabled={field.accessibility?.readonly}
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
            if (!errorReceived) setError(false);

            if (!messageReceived) setStatusMessage(undefined);
          });
        }}
        InputProps={{
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
