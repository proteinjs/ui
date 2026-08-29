import React from 'react';
import { Box, InputAdornment, TextField as MuiTextField, IconButton, Button } from '@mui/material';
import { Visibility, VisibilityOff, OpenInFull } from '@mui/icons-material';
import { Field, FieldComponent, FieldComponentProps, fieldDisplayValue, fieldLabel, Fields } from '../Field';
import { FieldShell, fieldInputSx } from './FieldShell';
import { ReadonlyValueRow } from './ReadonlyValueRow';
import { FieldExpandDialog } from './FieldExpandDialog';

/**
 * The inline-edit bound: a multiline value longer than this renders as a clamped preview
 * (see {@link PREVIEW_CHARS}) with the expand affordance instead of an inline editor — an
 * inline textarea seat is for values a few paragraphs long, not serialized payloads.
 */
export const INLINE_EDIT_MAX_CHARS = 2000;
/** How much of an over-bound value the inline preview renders (the preview is a doorway, not a viewport). */
export const PREVIEW_CHARS = 600;
/** Lines the preview shows before it clips. */
export const PREVIEW_LINES = 4;

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
    const [expandOpen, setExpandOpen] = React.useState(false);

    const label = fieldLabel(field);
    const value = fieldDisplayValue(field);
    const inputId = `field-${String(field.name).replace(/[^a-zA-Z0-9_-]/g, '-')}`;

    const commitValue = (newValue: string) => {
      let errorReceived = false;
      let messageReceived: string;
      onChange(field, newValue, (message: string, isError: boolean) => {
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
    };

    // Readonly values present as a text ROW (quiet label, selectable value, hover copy) —
    // data an admin came to read wears no input chrome.
    if (field.accessibility?.readonly && !multiline) {
      return <ReadonlyValueRow label={label} value={value} description={field.description} monospace={monospace} />;
    }

    // Every multiline field carries the ONE expand affordance; over the inline bound the
    // field is editable only through it.
    const overInlineBound = multiline && value.length > INLINE_EDIT_MAX_CHARS;
    const expandDialog = multiline && (
      <FieldExpandDialog
        open={expandOpen}
        label={label}
        value={value}
        monospace={monospace}
        onCancel={() => setExpandOpen(false)}
        onDone={(newValue) => {
          setExpandOpen(false);
          commitValue(newValue);
        }}
      />
    );
    const openAffordance = multiline && (
      <Button
        variant='text'
        size='small'
        onClick={() => setExpandOpen(true)}
        startIcon={<OpenInFull sx={{ fontSize: '13px !important' }} />}
        sx={{
          minWidth: 0,
          padding: '1px 6px',
          fontSize: '0.71875rem',
          fontWeight: 500,
          // Sentence case: MUI upper-cases button labels, which turns a quiet inline
          // affordance into a shout next to a 12px label.
          textTransform: 'none',
          letterSpacing: 0,
          color: 'text.secondary',
          '& .MuiButton-startIcon': { marginRight: '4px', marginLeft: 0 },
        }}
      >
        Open
      </Button>
    );

    if (overInlineBound) {
      return (
        <FieldShell
          label={label}
          required={field.accessibility?.required}
          labelAction={openAffordance}
          helperText={
            statusMessage ? statusMessage : `${value.length.toLocaleString()} characters — showing the first lines`
          }
          helperError={error}
        >
          <Box
            data-field-preview
            role='button'
            tabIndex={0}
            aria-label={`Open ${label}`}
            onClick={() => setExpandOpen(true)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                setExpandOpen(true);
              }
            }}
            sx={{
              padding: '10px 12px',
              borderRadius: 1,
              backgroundColor: 'action.hover',
              cursor: 'pointer',
              color: 'text.secondary',
              fontSize: '0.8125rem',
              lineHeight: 1.5,
              fontFamily: monospace ? 'ui-monospace, Menlo, monospace' : undefined,
              '&:hover': { backgroundColor: 'action.selected' },
            }}
          >
            {/* The clip lives on an INNER box so it lands at the text's own edge: clipping on
                the padded box lets the next line bleed into the bottom padding. */}
            <Box
              sx={{
                maxHeight: `calc(${PREVIEW_LINES} * 1.5em)`,
                overflow: 'hidden',
                overflowWrap: 'anywhere',
                whiteSpace: 'pre-wrap',
              }}
            >
              {value.slice(0, PREVIEW_CHARS)}
            </Box>
          </Box>
          {expandDialog}
        </FieldShell>
      );
    }

    return (
      <FieldShell
        label={label}
        htmlFor={inputId}
        required={field.accessibility?.required}
        labelAction={openAffordance}
        helperText={statusMessage ? statusMessage : field.description}
        helperError={error}
      >
        <MuiTextField
          fullWidth
          hiddenLabel
          size='small'
          sx={fieldInputSx}
          key={field.name}
          id={inputId}
          type={isPassword && !passwordVisible ? 'password' : 'text'}
          multiline={multiline}
          minRows={multiline ? minRows ?? 3 : undefined}
          maxRows={multiline ? maxRows ?? 8 : undefined}
          value={value}
          error={error}
          required={field.accessibility?.required}
          onChange={(event) => commitValue(event.target.value)}
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
        {expandDialog}
      </FieldShell>
    );
  }
}
