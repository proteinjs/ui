import React from 'react';
import {
  Box,
  Button,
  Dialog,
  IconButton,
  Slide,
  Stack,
  TextField as MuiTextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { TransitionProps } from '@mui/material/transitions';
import { Close, ContentCopy, Edit } from '@mui/icons-material';
import { useFormFactor } from '../../hooks/useFormFactor';
import { useSheetHistory } from '../../hooks/useSheetHistory';
import { StatusToast, StatusToastMessage } from '../../components/StatusToast';

const MONOSPACE = 'ui-monospace, Menlo, monospace';

/**
 * The ONE surface a long field value opens into (every multiline field's "Open" lands here), and
 * opening it is a READ: the value in a pane of selectable text — no input, so no keyboard rides in
 * with it (the focus trap takes focus off whatever held it behind) — under a top bar the
 * keyboard can never cover: the field's label and length, Copy (the whole value to the clipboard,
 * confirmed by the house toast), Edit when the field is editable, and Close.
 *
 * Editing is a choice: Edit turns the pane into the editor, and only then does the keyboard come
 * up (typing is the act now); the bar trades Copy and Edit for Done, which hands the draft back to
 * the field, while Close discards it. Values past the inline-edit bound
 * ({@link INLINE_EDIT_MAX_CHARS}) are editable only here — the inline face stays a cheap clamped
 * preview no matter how large the value gets.
 *
 * Escape closes it; on the phone the viewer is the screen — a full-height sheet — and a history
 * entry while open (`useSheetHistory`), so the back gesture and the app's own back close it
 * instead of leaving the page beneath.
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
  /** Close without committing (Close, Escape, the backdrop, back). */
  onClose: () => void;
  onDone: (value: string) => void;
}) {
  const { isPhone, isCoarsePointer } = useFormFactor();
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(value);
  const [toast, setToast] = React.useState<StatusToastMessage>();

  // Every open is a read of the stored value. The dialog's focus trap moves focus into the viewer
  // on open, off whatever held it behind (the inline editor being typed in), and the read posture
  // holds no input to take it — so the keyboard never rides in with the viewer.
  React.useLayoutEffect(() => {
    if (open) {
      setEditing(false);
    }
  }, [open]);

  useSheetHistory({ open, onClose, enabled: isPhone });

  const startEditing = () => {
    setDraft(value);
    setEditing(true);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setToast({ message: 'Copied' });
    } catch {
      // No clipboard here (a permission, an insecure page): say so — the text itself stays selectable.
      setToast({ message: `Couldn't copy — select the text instead`, isError: true });
    }
  };

  const shown = editing ? draft : value;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth='md'
      fullScreen={isPhone}
      {...(isPhone ? { TransitionComponent: SheetSlideUp } : {})}
      PaperProps={
        {
          'data-field-viewer': '',
          sx: {
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            // The phone sheet: the whole screen below a sliver of the app (the top inset clears the
            // display cutout), top-only radius — the house sheet grammar. Desktop keeps the
            // theme's dialog paper.
            ...(isPhone
              ? {
                  mt: 'auto',
                  height: 'calc(100% - env(safe-area-inset-top, 0px) - 12px)',
                  borderRadius: '16px 16px 0 0',
                }
              : {}),
          },
        } as React.ComponentProps<typeof Dialog>['PaperProps']
      }
    >
      <Stack
        data-field-viewer-bar
        direction='row'
        alignItems='center'
        spacing={1.25}
        sx={{ px: isPhone ? 2 : 2.5, pt: 2, pb: 1.5, flexShrink: 0 }}
      >
        <Stack direction='row' alignItems='baseline' spacing={1} sx={{ flexGrow: 1, minWidth: 0 }}>
          <Typography variant='subtitle1' sx={{ fontWeight: 600 }} noWrap>
            {label}
          </Typography>
          <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', whiteSpace: 'nowrap' }}>
            {shown.length.toLocaleString()} characters
          </Typography>
        </Stack>
        {editing ? (
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
            <ViewerControl label='Copy' isCoarsePointer={isCoarsePointer} onClick={copy}>
              <ContentCopy sx={{ fontSize: 18 }} />
            </ViewerControl>
            {editable && (
              <ViewerControl label='Edit' isCoarsePointer={isCoarsePointer} onClick={startEditing}>
                <Edit sx={{ fontSize: 18 }} />
              </ViewerControl>
            )}
          </>
        )}
        <ViewerControl label='Close' isCoarsePointer={isCoarsePointer} onClick={onClose}>
          <Close sx={{ fontSize: 20 }} />
        </ViewerControl>
      </Stack>
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
            overscrollBehaviorY: 'contain',
            borderTop: 1,
            borderColor: 'divider',
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
      <StatusToast status={toast} onDismiss={() => setToast(undefined)} />
    </Dialog>
  );
}

/** The phone sheet rises from the bottom edge. */
const SheetSlideUp = React.forwardRef(function SheetSlideUp(
  props: TransitionProps & { children: React.ReactElement },
  ref: React.Ref<unknown>
) {
  return <Slide direction='up' ref={ref} {...props} />;
});

/**
 * One top-bar control: an icon button named for its act (the accessible name and, on fine pointers,
 * the tooltip). On coarse pointers the 28px glyph box carries a 44px hit area.
 */
function ViewerControl({
  label,
  isCoarsePointer,
  onClick,
  children,
}: {
  label: string;
  isCoarsePointer: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip title={isCoarsePointer ? '' : label}>
      <IconButton
        aria-label={label}
        onClick={onClick}
        sx={{
          p: 0,
          width: 28,
          height: 28,
          flexShrink: 0,
          borderRadius: 999,
          color: 'text.secondary',
          '&:hover': { borderRadius: 999, bgcolor: 'action.hover' },
          ...(isCoarsePointer
            ? {
                position: 'relative',
                overflow: 'visible',
                '&::after': { content: '""', position: 'absolute', inset: -8 },
              }
            : {}),
        }}
      >
        {children}
      </IconButton>
    </Tooltip>
  );
}
