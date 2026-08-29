import React from 'react';
import { Box, Button, Dialog, TextField as MuiTextField, Typography } from '@mui/material';
import { useFormFactor } from '../../hooks/useFormFactor';

/**
 * The ONE surface a long field value opens into (every multiline field's "Open" affordance
 * lands here): a focused editor dialog — the field's label as the title, a live character
 * count under it, a tall editor (monospace when the field is), Cancel/Done. Done hands the
 * draft back to the field; Cancel (and escape/backdrop) discards it. Full-screen on phones.
 *
 * Values past the inline-edit bound ({@link INLINE_EDIT_MAX_CHARS}) are editable only here —
 * the inline face stays a cheap clamped preview no matter how large the value gets.
 */
export function FieldExpandDialog({
  open,
  label,
  value,
  monospace,
  onCancel,
  onDone,
}: {
  open: boolean;
  label: string;
  value: string;
  monospace?: boolean;
  onCancel: () => void;
  onDone: (value: string) => void;
}) {
  const { isPhone } = useFormFactor();
  const [draft, setDraft] = React.useState(value);

  // Re-seed the draft each time the dialog opens (the field's value may have changed since).
  React.useEffect(() => {
    if (open) {
      setDraft(value);
    }
  }, [open, value]);

  return (
    <Dialog
      open={open}
      onClose={onCancel}
      fullWidth
      maxWidth='md'
      fullScreen={isPhone}
      // Phone: the sheet owns the viewport height so the editor can fill it and the actions
      // stay pinned in view.
      PaperProps={isPhone ? { sx: { height: '100%', overflow: 'hidden' } } : undefined}
    >
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          padding: isPhone ? '16px 16px 12px' : '20px 24px 16px',
          minHeight: 0,
          height: isPhone ? '100%' : undefined,
        }}
      >
        <Typography sx={{ fontSize: '1rem', fontWeight: 600, lineHeight: 1.4 }}>{label}</Typography>
        <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', marginBottom: 1.5 }}>
          {draft.length.toLocaleString()} characters
        </Typography>
        <MuiTextField
          autoFocus
          fullWidth
          multiline
          hiddenLabel
          minRows={isPhone ? undefined : 16}
          maxRows={isPhone ? undefined : 28}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          inputProps={{ 'aria-label': label }}
          InputProps={{
            ...(monospace ? { sx: { fontFamily: 'ui-monospace, Menlo, monospace', fontSize: '0.8125rem' } } : {}),
          }}
          // Phone: the editor takes the sheet's height; the inner textarea scrolls.
          sx={
            isPhone
              ? {
                  flexGrow: 1,
                  minHeight: 0,
                  '& .MuiInputBase-root': { height: '100%', alignItems: 'stretch', padding: '10px 12px' },
                  // MUI's autosizing textarea writes an inline height from its content; on the
                  // phone sheet the editor must instead FILL the sheet and scroll inside it
                  // (an unbounded editor pushes Cancel/Done off-screen). `!important` is what
                  // outranks that inline height.
                  '& textarea': { height: '100% !important', overflow: 'auto !important' },
                }
              : undefined
          }
        />
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, marginTop: 1.75 }}>
          {/* Sentence case, matching the form's own actions. Outlined secondary beside the
              contained primary — the one dialog action convention (see ConfirmationDialog). */}
          <Button variant='outlined' onClick={onCancel} sx={{ textTransform: 'none' }}>
            Cancel
          </Button>
          <Button variant='contained' color='primary' onClick={() => onDone(draft)} sx={{ textTransform: 'none' }}>
            Done
          </Button>
        </Box>
      </Box>
    </Dialog>
  );
}
