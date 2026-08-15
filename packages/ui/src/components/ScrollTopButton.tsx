import React, { ReactNode, useEffect, useState } from 'react';
import { Box, SxProps, Theme, useTheme } from '@mui/material';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';

/**
 * Show once the container has scrolled past this many px — roughly "the top of the content is
 * out of view". Incidental-scroll flicker is absorbed by the button's 200ms scale+fade
 * transition, not by threshold slack.
 */
const DEFAULT_SHOW_AFTER_PX = 36;

/**
 * Styling/behavior injection points — everything except the scroller wiring. App surfaces pass
 * a house preset here (one visual system across surfaces) rather than restyling ad hoc; the
 * defaults below are framework-neutral MUI. `Table`'s `scrollTopButton` prop accepts this shape.
 */
export interface ScrollTopButtonStyleProps {
  /** Show once the container has scrolled past this many px. Default 36. */
  showAfterPx?: number;
  /** Glyph inside the circle. Default: MUI ArrowUpward at 16px. */
  icon?: ReactNode;
  /** Styling appended after the button's default sx (array-merged, so these win). */
  buttonSx?: SxProps<Theme>;
  /** Styling appended after the zero-height positioning strip's default sx. */
  hostSx?: SxProps<Theme>;
  /** Accessible name for the button. Default 'Back to top'. */
  'aria-label'?: string;
}

export interface ScrollTopButtonProps extends ScrollTopButtonStyleProps {
  /**
   * The scroll container this button watches and scrolls. Pass the element (not a ref) so the
   * button re-wires when the container mounts/changes — callers typically hold it in state via
   * a callback ref. Optional when `visible` and `onClick` are both controlled (the surface owns
   * its own scroller wiring).
   */
  scrollContainer?: HTMLElement | null;
  /**
   * Controlled visibility: when provided, the internal threshold watcher is skipped and this
   * value alone drives show/hide. For surfaces whose show condition isn't a top threshold —
   * chat's jump-to-bottom shows when the reader is away from the bottom; the thought editor
   * yields to its edits-tour card.
   */
  visible?: boolean;
  /**
   * Override the activate action (default: smooth-scroll `scrollContainer` to top). For
   * surfaces with their own scroll behavior — chat's eased scroll-to-bottom that also re-pins
   * stream following.
   */
  onClick?: () => void;
}

/**
 * Floating back-to-top affordance for long scrolling lists: a small circle pinned to the
 * bottom-center of the scroller that appears (scale+fade) once the reader is meaningfully deep
 * and smooth-scrolls the container back to the top on click.
 *
 * Render it as a sibling immediately AFTER the scroll container — the zero-height host strip
 * floats the button over the scroller's bottom edge without taking layout space. Mobile-ready
 * per convention: 44px touch target around the 36px visual circle, safe-area-inset aware,
 * pressed state.
 *
 * Surfaces whose trigger or action isn't a top threshold (chat's jump-to-bottom, the thought
 * editor's tour-yielding back-to-top) control `visible`/`onClick` and keep the shared geometry,
 * motion, and positioning — one visual system, no per-surface variants.
 */
export function ScrollTopButton({
  scrollContainer,
  showAfterPx = DEFAULT_SHOW_AFTER_PX,
  icon,
  buttonSx,
  hostSx,
  'aria-label': ariaLabel = 'Back to top',
  visible: controlledVisible,
  onClick,
}: ScrollTopButtonProps) {
  const theme = useTheme();
  const controlled = controlledVisible !== undefined;
  const [watchedVisible, setWatchedVisible] = useState(false);
  const visible = controlled ? controlledVisible : watchedVisible;

  useEffect(() => {
    if (controlled || !scrollContainer) {
      return;
    }
    const update = () => setWatchedVisible(scrollContainer.scrollTop > showAfterPx);
    // Sync immediately so a button mounted over an already-scrolled container renders in the
    // right state on its first frame (no hidden→shown pop).
    update();
    scrollContainer.addEventListener('scroll', update, { passive: true });
    return () => scrollContainer.removeEventListener('scroll', update);
  }, [controlled, scrollContainer, showAfterPx]);

  return (
    <Box
      sx={[
        {
          position: 'relative',
          width: '100%',
          height: 0,
          zIndex: theme.zIndex.mobileStepper,
          pointerEvents: 'none',
        },
        ...normalizeSx(hostSx),
      ]}
    >
      <Box
        component='button'
        type='button'
        aria-label={ariaLabel}
        data-shown={visible ? 'true' : 'false'}
        onClick={onClick ?? (() => scrollContainer?.scrollTo({ top: 0, behavior: 'smooth' }))}
        sx={[
          {
            position: 'absolute',
            // Clear of the scroller's bottom edge; on notched phones also clear the home bar.
            bottom: 'calc(8px + env(safe-area-inset-bottom, 0px))',
            left: '50%',
            transform: `translateX(-50%) scale(${visible ? 1 : 0})`,
            opacity: visible ? 1 : 0,
            transition: 'transform 200ms ease-out, opacity 200ms ease-out',
            pointerEvents: visible ? 'auto' : 'none',
            width: 36,
            height: 36,
            padding: 0,
            borderRadius: '50%',
            border: 'none',
            backgroundColor: theme.palette.background.paper,
            boxShadow: theme.shadows[3],
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: theme.palette.text.secondary,
            '&:hover': {
              backgroundColor: theme.palette.background.paper,
              boxShadow: theme.shadows[6],
            },
            '&:active': {
              transform: 'translateX(-50%) scale(0.92)',
            },
            // ≥44px touch target around the 36px visual circle (mobile convention).
            '&::after': {
              content: '""',
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: 44,
              height: 44,
              borderRadius: '50%',
            },
          },
          ...normalizeSx(buttonSx),
        ]}
      >
        {icon ?? <ArrowUpwardIcon sx={{ fontSize: 16 }} />}
      </Box>
    </Box>
  );
}

/** sx accepts a single value, a theme callback, or an array — normalize to a spreadable array. */
function normalizeSx(sx: SxProps<Theme> | undefined) {
  if (!sx) {
    return [];
  }
  return Array.isArray(sx) ? sx : [sx];
}
