import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Box } from '@mui/material';

/**
 * The content-cutoff cue at the TOP of a scrolling container: a small gradient band that
 * appears once content is scrolled off above, fading rows out under the container's top edge
 * instead of clipping them crisply. The scroll-container grammar app shells pair with
 * `ScrollTopButton` (founder ruling, admin round 3 — the record surfaces' scrollers adopt the
 * house scroll-container behavior).
 *
 * Mount it as the FIRST CHILD of the overflow element — it wires itself to `parentElement`.
 * Sticky and zero-height, so it pins to the scrollport without taking layout space; the band
 * spans the scroller's full inner width (negative insets mirror the scroller's paddings, and
 * the pin compensates `paddingTop`, so the veil always starts at the container's VISUAL top).
 *
 * SELF-DRIVEN visibility (a scoped, passive scroll listener on the parent — the same wiring
 * contract as `ScrollTopButton`): this component is the fade owner for scrollers the
 * framework layer itself renders. Consumer apps with their own app-wide fade machinery (e.g.
 * a document-level scrolled-past-top stamper driving CSS) keep owning THEIR scrollers with
 * it; the two mechanisms are per-scroller and never compose on the same element.
 *
 * The gradient runs from `color` (default: the theme's `background.paper` — the surface the
 * framework's cards scroll within) to transparent. A consumer whose scroller rests on a
 * different fill passes that fill's color; the fade must end on the surface's own resting
 * color or it reads as a seam.
 */
export function TopScrollFade({ fadeHeight = 16, color }: { fadeHeight?: number; color?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [pad, setPad] = useState({ top: 0, left: 0, right: 0 });
  const [scrolled, setScrolled] = useState(false);

  useLayoutEffect(() => {
    const scroller = ref.current?.parentElement;
    if (!scroller) {
      return;
    }

    const measure = () => {
      const cs = getComputedStyle(scroller);
      const next = {
        top: parseFloat(cs.paddingTop) || 0,
        left: parseFloat(cs.paddingLeft) || 0,
        right: parseFloat(cs.paddingRight) || 0,
      };
      setPad((prev) => (prev.top === next.top && prev.left === next.left && prev.right === next.right ? prev : next));
    };
    measure();
    // Paddings are runtime facts (a host can flip them after mount); a scroller's outer size
    // is constrained, so a padding change resizes its content box — ResizeObserver is the
    // complete change signal. Guarded: jsdom (the test environment) doesn't implement it.
    if (typeof ResizeObserver === 'undefined') {
      return;
    }
    const observer = new ResizeObserver(measure);
    observer.observe(scroller);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const scroller = ref.current?.parentElement;
    if (!scroller) {
      return;
    }

    const update = () => setScrolled(scroller.scrollTop > 0);
    // Sync immediately so a band mounted over an already-scrolled container renders in the
    // right state on its first frame.
    update();
    scroller.addEventListener('scroll', update, { passive: true });
    return () => scroller.removeEventListener('scroll', update);
  }, []);

  return (
    <Box
      ref={ref}
      component='span'
      data-top-scroll-fade
      data-shown={scrolled ? 'true' : 'false'}
      aria-hidden
      sx={(theme) => ({
        display: 'block',
        position: 'sticky',
        top: -pad.top,
        height: 0,
        // Above static content rows, BELOW pinned chrome (MUI sticky header cells sit at 2):
        // opaque pinned chrome owns the edge and the fade sits behind it — the same rule the
        // house app-side fade follows. Where no chrome pins (the table's phone card face,
        // headerless tables, plain lists), the band is the edge treatment.
        zIndex: 1,
        pointerEvents: 'none',
        flexShrink: 0,
        opacity: scrolled ? 1 : 0,
        '&::before': {
          content: '""',
          position: 'absolute',
          top: 0,
          left: -pad.left,
          right: -pad.right,
          height: `${pad.top + fadeHeight}px`,
          background: `linear-gradient(to bottom, ${color ?? theme.palette.background.paper}, transparent)`,
        },
      })}
    />
  );
}
