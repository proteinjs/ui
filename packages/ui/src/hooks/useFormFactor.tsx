import { useMediaQuery, useTheme } from '@mui/material';

export interface FormFactor {
  /** Layout fork — see the useFormFactor doc for the predicate. */
  isPhone: boolean;
  /** Input-affordance fork — `(pointer: coarse)`; true on tablets as well as phones. */
  isCoarsePointer: boolean;
}

/**
 * THE app-wide form-factor fork (MOBILE_SUPPORT S1). Every mobile/desktop behavior split
 * keys off this hook — no ad-hoc `window.innerWidth`, user-agent sniffing, or local
 * form-factor media queries anywhere else.
 *
 * Hosted here (the lowest UI layer) so framework surfaces — Table's phone card face, Form's
 * phone layout — fork on the same predicate as app surfaces; consumer kits re-export it
 * rather than re-implementing it. The predicate needs nothing beyond MUI + the ambient
 * theme, so this layer can own it.
 *
 * Two axes, because the doctrine forks on two different questions:
 *
 * `isPhone` — the LAYOUT fork (sheets instead of dialogs/menus, pager instead of tiled
 * widgets, pill nav instead of the rail):
 *
 *     (pointer: coarse) AND (viewport width < PHONE line OR viewport height < PHONE line)
 *
 * where the PHONE line is `theme.breakpoints.values.sm` (600px). Predicate rationale:
 * - The height term keeps a phone in LANDSCAPE (e.g. 932×430) phone-classified — a
 *   width-only breakpoint would flip it to desktop layout mid-rotation. Equivalently:
 *   phone-class means the SMALLER viewport dimension sits below the PHONE line.
 * - Tablets stay desktop-classified in both orientations (smallest dimension ≥ 744 even
 *   on an iPad mini): per the plan, widget simultaneity is a desktop/tablet affordance —
 *   tablets take desktop layout plus the coarse-pointer input doctrine.
 * - The coarse-pointer term keeps a narrow DESKTOP window on desktop layout — a
 *   fine-pointer machine can never enter the phone shell, which makes the Wave 0
 *   "desktop pixel-unchanged" bar structural rather than incidental. Touch-screen
 *   laptops report a fine primary pointer, so they stay desktop too. Browser device
 *   emulation emulates a coarse pointer, so phone layout is reproducible in dev tools.
 *
 * `isCoarsePointer` — the INPUT-AFFORDANCE fork (S3: hover-reveal replacements, tooltip
 * suppression, hit-slop, press-state feedback via `palette.action.press`). True on
 * tablets as well as phones — exactly why it is a separate axis from `isPhone`.
 *
 * Media queries are read synchronously on first render (`noSsr`; this is a pure client
 * SPA), so a phone never paints a desktop frame first (no-transient-states bar).
 */
export const useFormFactor = (): FormFactor => {
  const theme = useTheme();
  const phoneLinePx = theme.breakpoints.values.sm;
  // Comma = OR: matches when EITHER dimension is below the line (the smaller-dimension
  // rule above). The -0.05 epsilon mirrors MUI's `breakpoints.down`, so exactly-600 is
  // not phone-class.
  const isPhoneWindow = useMediaQuery(`(max-width: ${phoneLinePx - 0.05}px), (max-height: ${phoneLinePx - 0.05}px)`, {
    noSsr: true,
  });
  const isCoarsePointer = useMediaQuery('(pointer: coarse)', { noSsr: true });

  return { isPhone: isCoarsePointer && isPhoneWindow, isCoarsePointer };
};

/** Convenience form of the layout fork: `useFormFactor().isPhone`. */
export const useIsMobile = (): boolean => useFormFactor().isPhone;
