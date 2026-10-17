import React, { ReactNode, useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { Box, BoxProps, SxProps, Theme } from '@mui/material';
import { PrependReservoir } from './PrependReservoir';
import { ScrollRest } from './ScrollRest';

/** The scroller's door for a consumer's own view math (`apiRef`). */
export interface PrependSafeScrollerApi {
  /** The scroll container. */
  readonly scroller: HTMLDivElement | null;
  /** How far the scroller's top edge sits below the loaded start, in px (negative inside the reservoir). */
  distanceFromLoadedStart(): number;
  /** The reservoir's signed size in px: room above the loaded start, or (negative) a debt owed at the next rest. */
  reservePx(): number;
}

export interface PrependSafeScrollerProps<T> extends Omit<BoxProps, 'children' | 'ref'> {
  /** The loaded items, start first. Items landing at index 0 are a landing at the start (older rows loaded above). */
  items: T[];
  /** Row identity — React keys and the detection of what landed at the start. Pass a stable function. */
  itemKey: (item: T) => string | number;
  /**
   * The row's entire presentation. The returned element's box is the row's geometry (a fragment's first element
   * stands for it); the scroller wraps each item in a box-less (`display: contents`) element keyed by `itemKey`.
   */
  renderItem: (item: T, index: number) => ReactNode;
  /**
   * The consumer's count of rows not yet loaded above the first item — the server's count, or an estimate the
   * consumer owns and corrects. Sizes the reservoir with `estimatedRowHeight` until rows are measured; 0 says
   * the start is reached and the leftover reservoir collapses at the engine's rest.
   */
  remainingAbove: number;
  /** The mean row height to seed the reservoir's size; the measured mean replaces it as rows land. */
  estimatedRowHeight: number;
  /**
   * Asked when the viewport is within `leadViewports` client heights of the loaded start and no ask is in flight:
   * the consumer fetches the next older rows and lands them at the start of `items`. The gate reopens when rows
   * land at the start or when `loading` turns from true to false — never on the ask's own result (a promise
   * settles before the rows' commit, and a scroll event in that gap would ask for the same page again). A read
   * that brings nothing reopens the gate only through `loading`; a consumer that reaches the start sets
   * `remainingAbove` to 0.
   */
  onNeedMore?: () => void | Promise<unknown>;
  /**
   * True while the consumer's fetch is in flight: renders `loadingRow` at the reservoir's foot, and its turn to
   * false reopens the gate — in the same update that lands the rows, or after it, never before (the next ask
   * reads the consumer's cursor).
   */
  loading?: boolean;
  /** The face shown just above the first row while `loading` and rows remain above — height-neutral. */
  loadingRow?: ReactNode;
  /** The lead: the ask leaves this many client heights before the reader reaches the loaded start. Default 2. */
  leadViewports?: number;
  /** The engine's rest, as `ScrollRest` judges it — for a consumer's own rest-dependent work. */
  onRest?: () => void;
  /** The scroll container element. */
  scrollerRef?: React.Ref<HTMLDivElement>;
  /** The scroller's api. */
  apiRef?: React.MutableRefObject<PrependSafeScrollerApi | null>;
  /** Rendered after the rows — a tail the consumer owns (a spacer, a composer's reserve); the scroller owns the top only. */
  children?: ReactNode;
}

/** The lead's default: the ask leaves two viewports before the loaded start. */
export const PREPEND_SAFE_SCROLLER_LEAD_VIEWPORTS = 2;

/**
 * A vertical scroller whose contract is that a height change ABOVE the reader never moves what the reader sees, on
 * every engine, with no scroll-position write on the hot path. Older rows landing at the start, and rows above the
 * reader growing later, are absorbed by the RESERVOIR (`PrependReservoir`) — an empty block at the start edge, sized
 * for the rows not yet loaded, that shrinks by exactly the height added above the reader in the same layout pass,
 * before paint. So the scroller's `scrollHeight` is unchanged, `scrollTop` is unchanged, and rows land under a
 * finger, a fling or a rubber band with nothing for the engine to undo. The scroller owns the loader's gate (the
 * `onNeedMore` ask, one in flight, re-asked after every landing until the lead is filled or nothing remains), a slot
 * at the reservoir's foot for the consumer's loading row, and the one rest definition (`ScrollRest`) at which its
 * rare light writes land — the end collapse and a refill, each by at most a viewport and by the drift it measures.
 * It never reorders, virtualizes or styles rows, and never writes for the consumer's own deliberate moves. With
 * `remainingAbove` 0 it is a plain scroller.
 */
export function PrependSafeScroller<T>(props: PrependSafeScrollerProps<T>): React.ReactElement {
  const {
    items,
    itemKey,
    renderItem,
    remainingAbove,
    estimatedRowHeight,
    onNeedMore,
    loading,
    loadingRow,
    leadViewports = PREPEND_SAFE_SCROLLER_LEAD_VIEWPORTS,
    onRest,
    scrollerRef,
    apiRef,
    children,
    sx,
    ...boxProps
  } = props;
  const scrollerEl = useRef<HTMLDivElement | null>(null);
  const reservoirEl = useRef<HTMLDivElement | null>(null);
  const engine = useRef<PrependReservoir | null>(null);
  const rest = useRef<ScrollRest | null>(null);
  const observer = useRef<ResizeObserver | null>(null);
  const observedHeights = useRef(new Map<Element, number>());
  const askInFlight = useRef(false);
  const landedSinceAsk = useRef(false);
  /** The consumer's inputs as of the last commit judged, so each judgment sees what changed. */
  const previousCommit = useRef({ loading, remainingAbove, estimatedRowHeight });
  /** Every ask numbered; the ask a `loading` turn belongs to is the latest one when it turned true. */
  const askSeq = useRef(0);
  const loadingForAsk = useRef(-1);
  const mounted = useRef(false);
  const firstKey = useRef<string | number | undefined>(undefined);
  const latest = useRef({ onNeedMore, onRest, remainingAbove, estimatedRowHeight, leadViewports });
  latest.current = { onNeedMore, onRest, remainingAbove, estimatedRowHeight, leadViewports };

  /** The rows' boxes in document order: each item wrapper's first element. */
  const rowBoxes = useCallback((): HTMLElement[] => {
    const scroller = scrollerEl.current;
    if (!scroller) {
      return [];
    }
    const boxes: HTMLElement[] = [];
    for (let i = 0; i < scroller.children.length; i++) {
      const child = scroller.children[i];
      if (child.hasAttribute('data-prepend-row')) {
        const box = child.firstElementChild;
        if (box instanceof HTMLElement) {
          boxes.push(box);
        }
      }
    }
    return boxes;
  }, []);

  const setScroller = useCallback(
    (node: HTMLDivElement | null) => {
      scrollerEl.current = node;
      if (typeof scrollerRef === 'function') {
        scrollerRef(node);
      } else if (scrollerRef) {
        (scrollerRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
      }
    },
    [scrollerRef]
  );

  /** The gate: ask once while the viewport is inside the lead with rows remaining above and no ask in flight. */
  const askIfNeeded = useCallback(() => {
    const current = engine.current;
    const scroller = scrollerEl.current;
    const { remainingAbove: remaining, leadViewports: lead, onNeedMore: ask } = latest.current;
    if (!current || !scroller || !ask || remaining <= 0 || askInFlight.current || scroller.clientHeight <= 0) {
      return;
    }
    if (current.distanceFromLoadedStart() >= lead * scroller.clientHeight) {
      return;
    }
    askInFlight.current = true;
    landedSinceAsk.current = false;
    askSeq.current++;
    // The ask's result is never the gate's signal: a promise settles in the microtask BEFORE the rows' commit, and
    // a scroll event in that gap (a busy main thread under a pan widens it past several frames) would ask again
    // with the consumer's cursor still at the old page — the same page twice. The commit reopens the gate.
    void ask();
  }, []);

  /** A reconcile step is owed: at the next rest, not in this task. */
  const requestReconcile = useCallback(() => {
    const current = engine.current;
    const scroller = scrollerEl.current;
    if (current && scroller && current.owed(scroller.clientHeight)) {
      rest.current?.request();
    }
  }, []);

  /** The rows above the first visible row that changed height: absorbed before paint. */
  const onResize = useCallback(
    (entries: ResizeObserverEntry[]) => {
      const current = engine.current;
      const scroller = scrollerEl.current;
      if (!current || !scroller) {
        return;
      }
      const scrollerTop = scroller.getBoundingClientRect().top;
      let absorb = 0;
      for (const entry of entries) {
        const box = entry.target;
        const size = Array.isArray(entry.borderBoxSize) ? entry.borderBoxSize[0] : entry.borderBoxSize;
        const height = size && typeof size.blockSize === 'number' ? size.blockSize : entry.contentRect.height;
        const last = observedHeights.current.get(box);
        observedHeights.current.set(box, height);
        if (last === undefined) {
          continue; // the observation's first report: the size as mounted
        }
        const delta = height - last;
        if (delta === 0) {
          continue;
        }
        // The row's bottom BEFORE the change above the scroller's top edge: the whole change pushed the reader.
        if (box.getBoundingClientRect().bottom - delta <= scrollerTop + 0.5) {
          absorb += delta;
        }
      }
      if (absorb !== 0) {
        current.absorbGrowth(absorb);
        requestReconcile();
      }
    },
    [requestReconcile]
  );

  /** The observer follows the rows in the document. */
  const syncObserved = useCallback(() => {
    const ro = observer.current;
    if (!ro) {
      return;
    }
    const boxes = rowBoxes();
    const present = new Set<Element>(boxes);
    observedHeights.current.forEach((_, box) => {
      if (!present.has(box)) {
        ro.unobserve(box);
        observedHeights.current.delete(box);
      }
    });
    boxes.forEach((box) => {
      if (!observedHeights.current.has(box)) {
        ro.observe(box);
      }
    });
  }, [rowBoxes]);

  // Mount: the reservoir sized before the first paint, the rest watch and the gate on the scroller.
  useLayoutEffect(() => {
    const scroller = scrollerEl.current;
    const reservoir = reservoirEl.current;
    if (!scroller || !reservoir) {
      return;
    }
    const current = new PrependReservoir(scroller, reservoir, rowBoxes);
    engine.current = current;
    current.setRemaining(latest.current.remainingAbove, latest.current.estimatedRowHeight);
    current.initialize();
    firstKey.current = items.length > 0 ? itemKey(items[0]) : undefined;
    const watch = new ScrollRest(() => {
      const scrollerNow = scrollerEl.current;
      if (scrollerNow && current.owed(scrollerNow.clientHeight)) {
        current.step(scrollerNow.clientHeight);
        if (current.owed(scrollerNow.clientHeight)) {
          watch.request();
        }
      }
      latest.current.onRest?.();
    });
    rest.current = watch;
    const detachRest = watch.attach(scroller);
    const onScroll = () => askIfNeeded();
    scroller.addEventListener('scroll', onScroll, { passive: true });
    if (typeof ResizeObserver !== 'undefined') {
      observer.current = new ResizeObserver(onResize);
      syncObserved();
    }
    // The opening ask waits a frame: a consumer lands its own opening view in its own effects first.
    const opening = requestAnimationFrame(() => askIfNeeded());
    return () => {
      cancelAnimationFrame(opening);
      scroller.removeEventListener('scroll', onScroll);
      detachRest();
      rest.current = null;
      observer.current?.disconnect();
      observer.current = null;
      observedHeights.current.clear();
      engine.current = null;
    };
  }, []);

  // Every commit of items: a landing at the start absorbed before paint; otherwise the first row re-recorded.
  useLayoutEffect(() => {
    const current = engine.current;
    if (!current) {
      return;
    }
    const previous = firstKey.current;
    firstKey.current = items.length > 0 ? itemKey(items[0]) : undefined;
    if (previous === undefined || items.length === 0) {
      current.reset();
    } else {
      const index = items.findIndex((item) => itemKey(item) === previous);
      if (index < 0) {
        current.reset();
      } else if (index > 0) {
        const boxes = rowBoxes();
        current.land(boxes[index] ?? null, index);
        landedSinceAsk.current = true;
        requestReconcile();
      } else {
        current.record();
      }
    }
    syncObserved();
  }, [items, itemKey, rowBoxes, syncObserved, requestReconcile]);

  // ONE judgment per commit, after it: the gate reopens at most once — for rows that landed at the start, or for
  // a `loading` that turned false and belongs to the ask in flight (a turn that lands with the chain's next ask
  // in the same commit closes the old read, never the new one) — then the lead is asked once. The consumer's
  // count or seed moving the target asks for a reconcile at the rest and re-judges the lead without reopening
  // (a count that arrives before its rows must not ask twice). Not at the mount: the opening ask waits its frame.
  useEffect(() => {
    const current = engine.current;
    const previous = previousCommit.current;
    previousCommit.current = { loading, remainingAbove, estimatedRowHeight };
    if (!current || !mounted.current) {
      return;
    }
    if (remainingAbove !== previous.remainingAbove || estimatedRowHeight !== previous.estimatedRowHeight) {
      current.setRemaining(remainingAbove, estimatedRowHeight);
      requestReconcile();
    }
    let reopen = false;
    if (landedSinceAsk.current) {
      landedSinceAsk.current = false;
      reopen = true;
    }
    if (previous.loading === true && loading === false && loadingForAsk.current === askSeq.current) {
      reopen = true;
    }
    if (previous.loading !== true && loading === true) {
      loadingForAsk.current = askSeq.current; // the consumer answers the latest ask
    }
    if (reopen) {
      askInFlight.current = false;
    }
    askIfNeeded();
  }, [items, loading, remainingAbove, estimatedRowHeight, requestReconcile, askIfNeeded]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useLayoutEffect(() => {
    if (!apiRef) {
      return;
    }
    apiRef.current = {
      get scroller() {
        return scrollerEl.current;
      },
      distanceFromLoadedStart: () => engine.current?.distanceFromLoadedStart() ?? 0,
      reservePx: () => engine.current?.reservePx ?? 0,
    };
    return () => {
      apiRef.current = null;
    };
  }, [apiRef]);

  const scrollerSx: SxProps<Theme> = [{ overflowY: 'auto' }, ...(Array.isArray(sx) ? sx : sx ? [sx] : [])];
  return (
    <Box ref={setScroller} {...boxProps} sx={scrollerSx}>
      <div
        ref={reservoirEl}
        data-prepend-reservoir
        style={{ position: 'relative', flexShrink: 0, overflowAnchor: 'none' }}
      >
        {loading && remainingAbove > 0 && loadingRow !== undefined && (
          <div data-prepend-loading style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}>
            {loadingRow}
          </div>
        )}
      </div>
      {items.map((item, index) => (
        <div key={itemKey(item)} data-prepend-row={String(itemKey(item))} style={{ display: 'contents' }}>
          {renderItem(item, index)}
        </div>
      ))}
      {children}
    </Box>
  );
}
