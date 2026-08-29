import React from 'react';
import { Box, Typography } from '@mui/material';

/**
 * The shared anatomy of a round-2 form field (reference grammar: Linear/Notion/Stripe forms):
 * a quiet EXTERNAL label above the control — 12px/500 secondary, never a floating label woven
 * into the input's border — an optional affordance at the label row's right edge (the expand
 * "Open" control on multiline fields), the control itself, and a caption-sized helper line.
 * One owner for that anatomy so text, date, and readonly fields can't drift apart.
 */
export function FieldShell({
  label,
  htmlFor,
  required,
  labelAction,
  helperText,
  helperError,
  children,
}: {
  label: string;
  /** Wires the label to its control (a11y + label-driven test selectors). Omit for row values that aren't controls. */
  htmlFor?: string;
  required?: boolean;
  /** Rendered at the right edge of the label row (e.g. the expand affordance). */
  labelAction?: React.ReactNode;
  helperText?: React.ReactNode;
  helperError?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', marginBottom: '4px', minHeight: 16 }}>
        <Typography
          component='label'
          htmlFor={htmlFor}
          sx={{
            fontSize: '0.75rem',
            lineHeight: '1rem',
            fontWeight: 500,
            letterSpacing: '0.01em',
            color: 'text.secondary',
            display: 'block',
          }}
        >
          {label}
          {required ? ' *' : ''}
        </Typography>
        <Box sx={{ flexGrow: 1 }} />
        {labelAction}
      </Box>
      {children}
      {helperText && (
        <Typography
          sx={{ fontSize: '0.75rem', lineHeight: '1.125rem', marginTop: '4px' }}
          color={helperError ? 'error' : 'text.secondary'}
        >
          {helperText}
        </Typography>
      )}
    </Box>
  );
}

/** The one input look every round-2 field control shares: small density, hairline border at rest. */
export const fieldInputSx = {
  '& .MuiOutlinedInput-notchedOutline': {
    borderColor: 'divider',
  },
} as const;
