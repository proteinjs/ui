import React from 'react';
import { Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle } from '@mui/material';

/**
 * What a confirmation-gated action asks the user. Buttons (`FormButton.confirm`,
 * `TableButton.confirm`) declare one of these; the component that executes the click renders the
 * dialog and only runs the action after the user confirms.
 */
export type ConfirmationConfig = {
  title: string;
  message?: string;
  /** Label of the confirming action button; defaults to 'Confirm' */
  confirmButtonText?: string;
};

export type ConfirmationDialogProps = ConfirmationConfig & {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * Minimal confirmation dialog for destructive or otherwise gated actions. Framework-vanilla
 * MUI styling; consumer app themes style it via their theme scope.
 */
export function ConfirmationDialog({
  open,
  title,
  message,
  confirmButtonText,
  onConfirm,
  onCancel,
}: ConfirmationDialogProps) {
  return (
    <Dialog open={open} onClose={onCancel} aria-labelledby='confirmation-dialog-title'>
      <DialogTitle id='confirmation-dialog-title'>{title}</DialogTitle>
      {message && (
        <DialogContent>
          <DialogContentText>{message}</DialogContentText>
        </DialogContent>
      )}
      <DialogActions>
        <Button onClick={onCancel}>Cancel</Button>
        <Button onClick={onConfirm} color='primary' variant='contained'>
          {confirmButtonText || 'Confirm'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
