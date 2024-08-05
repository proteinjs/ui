import React, { ReactNode } from 'react';
import { Grid, GridProps, PaperProps } from '@mui/material';
import { FormPaper } from './FormPaper';

interface FormPageProps {
  gridContainerProps?: GridProps;
  gridItemProps?: GridProps;
  paperProps?: PaperProps;
  children?: ReactNode;
}
export function FormPage(props: FormPageProps) {
  return (
    <Grid
      container
      sx={(theme) => ({
        marginTop: theme.spacing(4),
      })}
      direction='row'
      justifyContent='center'
      alignItems='center'
      {...props.gridContainerProps}
    >
      <Grid item {...props.gridItemProps}>
        <FormPaper {...props.paperProps}>{props.children}</FormPaper>
      </Grid>
    </Grid>
  );
}
