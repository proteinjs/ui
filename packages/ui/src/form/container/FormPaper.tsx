import React from 'react';
import { PaperProps, Paper } from '@mui/material';
import { useFormFactor } from '../../hooks/useFormFactor';

export function FormPaper(props: PaperProps) {
  // Phone: the card spans the page (minus the FormPage gutters) — fit-content sizing let a
  // multi-column form dictate a width wider than the screen.
  const { isPhone } = useFormFactor();

  return (
    <Paper
      sx={(theme) => ({
        padding: theme.spacing(2, 2, 1),
        width: isPhone ? '100%' : 'fit-content',
        minWidth: 0,
      })}
      {...props}
    >
      {props.children}
    </Paper>
  );
}
