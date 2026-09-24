import React from 'react';
import { Alert, Snackbar } from '@mui/material';

/** What the house toast says: a message, and whether it reports an error. */
export type StatusToastMessage = { message?: string; isError?: boolean };

/**
 * The house toast — a floating bottom-center Snackbar wrapping a severity Alert — on both form
 * factors. ONE owner: the form's button results and the long-value viewer's Copy confirmation
 * both present through it. A success leaves after 4 s, an error after 6 s; a clickaway never
 * dismisses it (an error toast should outlive an incidental tap).
 */
export function StatusToast({ status, onDismiss }: { status?: StatusToastMessage; onDismiss: () => void }) {
  return (
    <Snackbar
      open={!!status?.message}
      autoHideDuration={status?.isError ? 6000 : 4000}
      onClose={(event, reason) => {
        if (reason === 'clickaway') {
          return;
        }
        onDismiss();
      }}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
    >
      <Alert severity={status?.isError ? 'error' : 'success'} onClose={onDismiss}>
        {status?.message}
      </Alert>
    </Snackbar>
  );
}
