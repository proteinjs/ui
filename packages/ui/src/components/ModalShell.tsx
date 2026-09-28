import React from 'react';
import {
  Breakpoint,
  Dialog,
  DialogContent,
  IconButton,
  Slide,
  Stack,
  SxProps,
  Theme,
  Tooltip,
  Typography,
} from '@mui/material';
import { TransitionProps } from '@mui/material/transitions';
import { Close } from '@mui/icons-material';
import { useFormFactor } from '../hooks/useFormFactor';
import { useSheetHistory } from '../hooks/useSheetHistory';

/**
 * What a framework surface hands the shell that presents it: a title with an optional quiet
 * annotation after it, its own controls for the header (built with {@link ModalShellControl}),
 * and its content. The shell owns everything else — the frame, the close control, the divider,
 * and on the phone the sheet's gestures and its place in history.
 */
export interface ModalShellProps {
  /**
   * The close act — the shell's close control, Escape, the backdrop, and on the phone the back
   * gesture and a swipe down. The host answers by unmounting the shell (or flipping the state
   * that mounts it): a shell is mounted only while open.
   */
  onClose: () => void;
  title: string;
  /** Quiet annotation rendered baseline-aligned after the title (e.g. a length caption). */
  meta?: React.ReactNode;
  /** Header controls rendered between the title and the shell's close. */
  actions?: React.ReactNode;
  /** Merged onto the content area's styles — a host whose content scrolls itself zeroes the padding here. */
  contentSx?: SxProps<Theme>;
  maxWidth?: Breakpoint;
  children: React.ReactNode;
}

export type ModalShellComponent = React.ComponentType<ModalShellProps>;

/**
 * The modal-shell seam: the ONE chrome every framework modal surface presents in. A consumer
 * application that owns a modal shell of its own — its dialog paper, its phone sheet with the
 * swipe-down gesture, its header grammar — supplies it once through {@link ModalShellProvider},
 * and every framework surface (the long-value viewer, to begin with) presents in it instead of
 * re-implementing a sheet the application already has. With no provider, the framework's own
 * shell ({@link DefaultModalShell}) stands.
 */
const ModalShellContext = React.createContext<ModalShellComponent>(DefaultModalShell);

export function ModalShellProvider({ shell, children }: { shell: ModalShellComponent; children: React.ReactNode }) {
  return <ModalShellContext.Provider value={shell}>{children}</ModalShellContext.Provider>;
}

/** The shell a framework modal surface presents in — the application's when it supplied one. */
export function useModalShell(): ModalShellComponent {
  return React.useContext(ModalShellContext);
}

/**
 * The framework's own shell: a dialog on the theme's paper; on the phone a full-height sheet
 * rising from the bottom edge (top-only radius, a sliver of the app above it) that is a history
 * entry while open, so the back gesture closes it and stays on the page beneath. A phone close
 * plays the sheet's exit before the host hears `onClose` (the host may unmount at once); desktop
 * closes directly.
 */
export function DefaultModalShell({
  onClose,
  title,
  meta,
  actions,
  contentSx,
  maxWidth = 'sm',
  children,
}: ModalShellProps) {
  const { isPhone } = useFormFactor();
  const [closing, setClosing] = React.useState(false);
  const requestClose = () => {
    if (isPhone) {
      setClosing(true);
    } else {
      onClose();
    }
  };
  useSheetHistory({ open: !closing, onClose: requestClose, enabled: isPhone });

  return (
    <Dialog
      open={!closing}
      onClose={requestClose}
      fullWidth
      maxWidth={maxWidth}
      {...(isPhone ? { fullScreen: true, TransitionComponent: SheetSlideUp } : {})}
      TransitionProps={
        isPhone
          ? ({
              onExited: () => {
                setClosing(false);
                onClose();
              },
            } as TransitionProps)
          : undefined
      }
      PaperProps={
        {
          'data-modal-shell': '',
          sx: {
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
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
        data-modal-shell-bar
        direction='row'
        alignItems='center'
        spacing={1.25}
        sx={{ px: isPhone ? 2 : 2.5, pt: 2, pb: 1.5, flexShrink: 0 }}
      >
        <Stack direction='row' alignItems='baseline' spacing={1} sx={{ flexGrow: 1, minWidth: 0 }}>
          <Typography variant='subtitle1' sx={{ fontWeight: 600 }} noWrap>
            {title}
          </Typography>
          {meta}
        </Stack>
        {actions}
        <ModalShellControl label='Close' onClick={requestClose}>
          <Close sx={{ fontSize: 20 }} />
        </ModalShellControl>
      </Stack>
      <DialogContent
        sx={[
          {
            p: 2.5,
            pt: 2,
            borderTop: 1,
            borderColor: 'divider',
            ...(isPhone ? { px: 2, overscrollBehaviorY: 'none' } : {}),
          },
          ...(Array.isArray(contentSx) ? contentSx : contentSx ? [contentSx] : []),
        ]}
      >
        {children}
      </DialogContent>
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
 * One header control: an icon button named for its act (the accessible name and, on fine
 * pointers, the tooltip). On coarse pointers the 28px glyph box carries a 44px hit area.
 *
 * A momentary control returns to rest after its act. Hover feedback exists only where hover
 * does (`@media (hover: hover)`): a touch screen keeps the tapped element in :hover until the
 * next touch, so an unconditioned hover wash would stay on a control whose act leaves the
 * surface open — Copy — as a pressed look that never clears. Press feedback on touch is the
 * button's own ripple.
 */
export function ModalShellControl({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const { isCoarsePointer } = useFormFactor();
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
          '@media (hover: hover)': { '&:hover': { bgcolor: 'action.hover' } },
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
