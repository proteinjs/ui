import React, { ReactNode } from 'react';
import { Grid, GridProps, PaperProps } from '@mui/material';
import { FormPaper } from './FormPaper';
import { useFormFactor } from '../../hooks/useFormFactor';

interface FormPageProps {
  gridContainerProps?: GridProps;
  gridItemProps?: GridProps;
  paperProps?: PaperProps;
  children?: ReactNode;
}
export function FormPage(props: FormPageProps) {
  // Phone: the centered fit-content column becomes a full-width column with page gutters —
  // FormPaper spans it (its own phone fork), so forms and form-hosted tables fill the screen.
  const { isPhone } = useFormFactor();

  return (
    <Grid
      container
      sx={(theme) => ({
        marginTop: theme.spacing(4),
        ...(isPhone ? { paddingLeft: theme.spacing(2), paddingRight: theme.spacing(2) } : {}),
      })}
      direction='row'
      justifyContent='center'
      alignItems='center'
      {...props.gridContainerProps}
    >
      <Grid item sx={isPhone ? { width: '100%', minWidth: 0 } : undefined} {...props.gridItemProps}>
        <FormPaper {...props.paperProps}>{props.children}</FormPaper>
      </Grid>
    </Grid>
  );
}
