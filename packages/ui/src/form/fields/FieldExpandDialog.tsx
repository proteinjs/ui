import React from 'react';
import { Box, Button, TextField as MuiTextField, Typography } from '@mui/material';
import { ContentCopy, Edit } from '@mui/icons-material';
import { useFormFactor } from '../../hooks/useFormFactor';
import { ModalShellControl, useModalShell } from '../../components/ModalShell';
import { useStatusNotice } from '../../components/StatusNotice';

const MONOSPACE = 'ui-monospace, Menlo, monospace';

/**
 * The ONE surface a long field value opens into (every multiline field's "Open" lands here), and
 * opening it is a READ: the value in a pane of selectable text — no input, so no keyboard rides in
 * with it (the shell's focus trap takes focus off whatever held it behind) — under a top bar the
 * keyboard can never cover: the field's label and length, Copy (the whole value to the clipboard,
 * confirmed by a status notice), Edit when the field is editable, and the shell's Close.
 *
 * Editing is a choice: Edit turns the pane into the editor, and only then does the keyboard come
 * up (typing is the act now); the bar trades Copy and Edit for Done, which hands the draft back to
 * the field, while Close discards it. Values past the inline-edit bound
 * ({@link INLINE_EDIT_MAX_CHARS}) are editable only here — the inline face stays a cheap clamped
 * preview no matter how large the value gets.
 *
 * The viewer presents in the modal shell (`useModalShell`): the application's own — its dialog
 * paper, its phone sheet with the swipe-down gesture and the back-to-close entry — or the
 * framework's default. It says "Copied" through the status-notice door (`useStatusNotice`): the
 * application's toast when it supplied one, else the framework's own.
 */
export function FieldExpandDialog({
  open,
  label,
  value,
  monospace,
  editable,
  onClose,
  onDone,
}: {
  open: boolean;
  label: string;
  value: string;
  monospace?: boolean;
  /** Whether the viewer offers Edit (a read-only field's value is read and copied, never edited). */
  editable: boolean;
  /** Close without committing (Close, Escape, the backdrop, back, a swipe down). */
  onClose: () => void;
  onDone: (value: string) => void;
}) {
  const { isPhone } = useFormFactor();
  const Shell = useModalShell();
  const notice = useStatusNotice();
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(value);

  // Every open is a read of the stored value. The shell's focus trap moves focus into the viewer
  // on open, off whatever held it behind (the inline editor being typed in), and the read posture
  // holds no input to take it — so the keyboard never rides in with the viewer.
  React.useLayoutEffect(() => {
    if (open) {
      setEditing(false);
    }
  }, [open]);

  const startEditing = () => {
    setDraft(value);
    setEditing(true);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      notice.present({ message: 'Copied' });
    } catch {
      // No clipboard here (a permission, an insecure page): say so — the text itself stays selectable.
      notice.present({ message: `Couldn't copy — select the text instead`, isError: true });
    }
  };

  if (!open) {
    return null;
  }

  const shown = editing ? draft : value;

  return (
    <Shell
      onClose={onClose}
      title={label}
      maxWidth='md'
      meta={
        <Typography
          data-field-viewer-length
          sx={{ fontSize: '0.75rem', color: 'text.secondary', whiteSpace: 'nowrap' }}
        >
          {shown.length.toLocaleString()} characters
        </Typography>
      }
      actions={
        editing ? (
          <Button
            variant='contained'
            size='small'
            onClick={() => onDone(draft)}
            sx={{ textTransform: 'none', flexShrink: 0 }}
          >
            Done
          </Button>
        ) : (
          <>
            <ModalShellControl label='Copy' onClick={copy}>
              <ContentCopy sx={{ fontSize: 18 }} />
            </ModalShellControl>
            {editable && (
              <ModalShellControl label='Edit' onClick={startEditing}>
                <Edit sx={{ fontSize: 18 }} />
              </ModalShellControl>
            )}
          </>
        )
      }
      // The pane (or the editor) is the viewer's own scroller: the shell's content area is a
      // column with no padding of its own, so the pane's scroll top is the sheet's drag claim.
      contentSx={{ p: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
    >
      {editing ? (
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
            ...(monospace ? { sx: { fontFamily: MONOSPACE, fontSize: '0.8125rem' } } : {}),
          }}
          sx={{
            px: isPhone ? 2 : 2.5,
            pt: 2,
            pb: 2,
            ...(isPhone
              ? {
                  // The editor fills the sheet and its textarea scrolls inside it. MUI's autosizing
                  // textarea writes an inline height from its content; `!important` outranks it.
                  flexGrow: 1,
                  minHeight: 0,
                  '& .MuiInputBase-root': { height: '100%', alignItems: 'stretch', padding: '10px 12px' },
                  '& textarea': { height: '100% !important', overflow: 'auto !important' },
                }
              : {}),
          }}
        />
      ) : (
        <Box
          data-field-viewer-pane
          role='document'
          aria-label={label}
          tabIndex={0}
          sx={{
            flex: '1 1 auto',
            minHeight: 0,
            overflowY: 'auto',
            // No local bounce / scroll chaining: a downward pan at scroll top belongs to the
            // sheet's drag claim on the phone, never to rubber-banding.
            overscrollBehaviorY: isPhone ? 'none' : 'contain',
            px: isPhone ? 2 : 2.5,
            py: 2,
            whiteSpace: 'pre-wrap',
            overflowWrap: 'anywhere',
            userSelect: 'text',
            WebkitUserSelect: 'text',
            color: 'text.primary',
            fontSize: monospace ? '0.8125rem' : '0.875rem',
            lineHeight: 1.6,
            ...(monospace ? { fontFamily: MONOSPACE } : {}),
            '&:focus-visible': { outline: 'none' },
          }}
        >
          {value}
        </Box>
      )}
      {notice.host}
    </Shell>
  );
}
