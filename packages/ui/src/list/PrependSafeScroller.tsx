import React, { ReactNode, useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { Box, BoxProps, SxProps, Theme } from '@mui/material';
import { ListStartEdge } from './ListStartEdge';
import { ScrollRest } from './ScrollRest';

/** The scroller's door for a consumer's own view math (`apiRef`). */
export interface PrependSafeScrollerApi {
  /** The scroll container. */
  readonly scroller: HTMLDivElement | null;
  /** How far the scroller's top edge sits below the loaded start, in px (rows above the scroll origin count as loaded). */
  distanceFromLoadedStart(): number;
  /** What the start edge holds, in px: negative while rows sit above the scroll origin until the settle, 0 with nothing held. */
  reservePx(): number;
  /**
   * The consumer's own news arrived (rows it holds as data): `onRest` comes at the next of the scroller's two
   * moments. Where the reader stands at the loaded start, at once with no known finger down and at that finger's
   * lift with one — however often the reader pulls there, and with no rest; anywhere else at the list's next rest,
   * in the next task when it is at rest now.
   */
  requestRest(): void;
}

export interface PrependSafeScrollerProps<T> extends Omit<BoxProps, 'children' | 'ref'> {
  /** The loaded items, start first. Items landing at index 0 are a landing at the start (older rows loaded above). */
  items: T[];
  /** Row identity — React keys and the reader's row across a commit. Pass a stable function; keys are compared as strings. */
  itemKey: (item: T) => string | number;
  /**
   * The row's entire presentation. The returned element's box is the row's geometry (a fragment's first element
   * stands for it); the scroller wraps each item in a box-less (`display: contents`) element keyed by `itemKey`.
   */
  renderItem: (item: T, index: number) => ReactNode;
  /**
   * Whether rows remain above the first item: only its being above zero is read (the consumer's count, or any
   * positive number while more exist — rows the consumer holds as data and has not yet put in `items` are rows
   * above the first item). 0 says the start is reached: nothing is asked for, and nothing shows there.
   */
  remainingAbove: number;
  /** Not read: nothing is sized from a guess of the rows not yet loaded. It stays for those who pass it. */
  estimatedRowHeight?: number;
  /**
   * Asked when the viewport is within `leadViewports` client heights of the loaded start and no ask is in flight:
   * the consumer fetches the next older rows and lands them at the start of `items` — at once, or held as data and
   * landed at `onRest`. The gate reopens when rows land at the start or when `loading` turns from true to false —
   * never on the ask's own result (a promise settles before the rows' commit, and a scroll event in that gap would
   * ask for the same page again). A read that brings nothing reopens the gate only through `loading`; a consumer
   * that reaches the start sets `remainingAbove` to 0. The lead is judged at the opening frame, on scroll, after
   * every commit of rows and whenever the scroller's OWN box gains height — rows that landed while the scroller
   * had no geometry (a pane mounted hidden and laid out later) are asked above once the box arrives, by this one
   * rule.
   */
  onNeedMore?: () => void | Promise<unknown>;
  /**
   * True while the consumer's fetch is in flight: shows `loadingRow` over the list's start, and its turn to false
   * reopens the gate — in the same update that lands the rows, or after it, never before (the next ask reads the
   * consumer's cursor).
   */
  loading?: boolean;
  /**
   * The face shown while `loading` and rows remain above: it floats over the start of the rows, where a reader who
   * has run out of loaded rows is standing. It takes no room, so nothing moves when it comes or goes.
   */
  loadingRow?: ReactNode;
  /** The lead: the ask leaves this many client heights before the reader reaches the loaded start. Default 2. */
  leadViewports?: number;
  /**
   * The moment for a consumer's own rest-dependent work, and for landing rows it holds as data. It comes at the
   * list's rest as `ScrollRest` judges it, and where the reader has run out of loaded rows (the scroller's top edge
   * at the loaded start, no known finger down, or at that finger's lift) — and once more after a settle that either
   * moment began, when the rows above are reachable. It can come more than once around one landing: the work done
   * in it must be safe to repeat. A consumer whose rows arrive later says so (`apiRef.requestRest()`).
   */
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
 * ROWS REMAIN ABOVE THIS START: on the scroller's root while the consumer says rows remain above the first item, or
 * while the start edge holds anything until its write. One fact for whoever asks "can this list still go up?" of a
 * scroller whose offset reads 0 at its loaded start, or "is this a list that scrolls?" in the one painted frame it
 * is stopped for its write (its overflow reads hidden then): a sheet that would otherwise take the pull, a fade that
 * marks content above.
 */
export const PREPEND_ROWS_ABOVE_ATTR = 'data-prepend-rows-above';

/** The reader's rows as a commit found them: each one's key and its top against the start edge. */
type ReaderRows = Array<{ key: string; top: number }>;

interface RowsCommitProps {
  /** The rows' list: a commit that changes it is a commit of rows. */
  items: unknown;
  /** Called immediately before a commit of rows changes the document, with the list it replaces. */
  before: (previous: unknown) => void;
}

/**
 * THE MOMENT BEFORE A COMMIT OF ROWS: React's snapshot before an update — the one point at which the document is
 * still the one the reader is looking at while the next one is already decided. A class, because that moment exists
 * only on one; it draws nothing. The scroller reads the reader's row there, and reads it again in its own layout
 * pass of the same commit.
 */
class RowsCommit extends React.Component<RowsCommitProps> {
  shouldComponentUpdate(next: RowsCommitProps): boolean {
    return next.items !== this.props.items;
  }

  getSnapshotBeforeUpdate(previous: RowsCommitProps): null {
    this.props.before(previous.items);
    return null;
  }

  /** React asks for it beside the snapshot; the commit's measure is the scroller's own layout pass, after every row's. */
  componentDidUpdate(): void {}

  render(): ReactNode {
    return null;
  }
}

/**
 * A vertical scroller whose contract is that a height change ABOVE the reader never moves what the reader sees, on
 * every engine, with no scroll-position write while the list is moving. The list is a plain list of real rows: there
 * is no room for rows not yet loaded and nothing is sized from a guess. Older rows landing at the start, a row above
 * the reader growing later, a row above it leaving — each is HELD by the start edge (`ListStartEdge`): the height
 * that appeared above the reader's own row, measured on that row across the commit, is kept out of the scroll range
 * in the same layout pass, before paint. So `scrollHeight` and `scrollTop` are unchanged and rows land under a
 * finger, a glide or a rubber band with nothing for the engine to undo; rows that landed above the scroll origin are
 * not painted while they stand there.
 *
 * ONE COUNT OF EVERY CHANGE. A commit of rows is measured on the reader's own row, and that measure already holds
 * whatever the commit changed above it. The sizes an engine reports next are that commit's own — the rows it added,
 * the rows it changed — so the first reports after a commit are judged on the reader's row again, against the place
 * the commit left it: they hold only what moved it since (a row that fills itself in a second pass, or in its own
 * effect), and never what the commit counted. Reports that come later are each judged by the row they name.
 *
 * What is held is paid by THE SETTLE — the list stopped for one painted frame where a finger can move it, then one
 * exact write — at two moments only: at the list's REST (`ScrollRest`), where nothing is seen; and WHERE THE READER
 * HAS RUN OUT of loaded rows (the scroller's top edge at the loaded start), where the list has stopped anyway: at
 * once with no known finger down, at the lift with one. `onRest` tells the consumer of both moments, so rows it holds
 * as data land there too. A settle never begins while a commit's rows are still being set up, and a commit that
 * lands rows ends a stop under way before it changes the document: no row's own effect, layout or passive, finds the
 * scroller stopped.
 *
 * The scroller owns the loader's gate (the `onNeedMore` ask, one in flight, re-asked after every landing and
 * whenever its own box gains height, until the lead is filled or nothing remains), the place of the
 * consumer's loading face, and the fact `PREPEND_ROWS_ABOVE_ATTR`. It turns the engine's own scroll anchoring off on
 * its root: a height change above the reader has one keeper. It never reorders, virtualizes or styles rows, and never
 * writes for the consumer's own deliberate moves. With `remainingAbove` 0 and nothing held it is a plain scroller.
 */
export function PrependSafeScroller<T>(props: PrependSafeScrollerProps<T>): React.ReactElement {
  const {
    items,
    itemKey,
    renderItem,
    remainingAbove,
    // Taken out of what reaches the element; not read (see the prop).
    estimatedRowHeight: _estimatedRowHeight,
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
  const edgeEl = useRef<HTMLDivElement | null>(null);
  const engine = useRef<ListStartEdge | null>(null);
  const rest = useRef<ScrollRest | null>(null);
  const observer = useRef<ResizeObserver | null>(null);
  const observedHeights = useRef(new Map<Element, number>());
  /** The observation of the scroller's OWN box, beside the rows' (`observer`). */
  const boxObserver = useRef<ResizeObserver | null>(null);
  /** The scroller's box height as last judged — growth re-judges the lead. */
  const boxHeight = useRef(0);
  const askInFlight = useRef(false);
  const landedSinceAsk = useRef(false);
  /** The consumer's inputs as of the last commit judged, so each judgment sees what changed. */
  const previousCommit = useRef({ loading });
  /** Every ask numbered; the ask a `loading` turn belongs to is the latest one when it turned true. */
  const askSeq = useRef(0);
  const loadingForAsk = useRef(-1);
  const mounted = useRef(false);
  const firstKey = useRef<string | number | undefined>(undefined);
  /** The rows that landed above the scroll origin: not painted while they stand there. */
  const unpainted = useRef(new Set<HTMLElement>());
  /** The consumer was told that the reader ran out of loaded rows, at this arrival at the loaded start. */
  const toldRanOut = useRef(false);
  /** The consumer said its own news arrived (`requestRest`) and has not been told since. */
  const consumerWaits = useRef(false);
  /** The reader's rows as the commit under way found them; undefined between commits. */
  const rowsBefore = useRef<{ rows: ReaderRows } | undefined>(undefined);
  /**
   * The reader's row where the last commit of rows left it, until that commit's own size reports have come: its box
   * and its place against the loaded start (a number a hold or a payment in between does not move). Given up two
   * frames on, should no report come (a commit that changed no size).
   */
  const commitPlace = useRef<{ box: HTMLElement; place: number; frame: number } | null>(null);
  /** A commit of rows is between its layout pass and its passive effects: its rows are still being set up. */
  const settingUp = useRef(false);
  const latest = useRef({ onNeedMore, onRest, remainingAbove, leadViewports, items, itemKey });
  latest.current = { onNeedMore, onRest, remainingAbove, leadViewports, items, itemKey };

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

  /** The one fact for those who ask whether this list still goes up (`PREPEND_ROWS_ABOVE_ATTR`), moved only when it changes. */
  const stampRowsAbove = useCallback(() => {
    const scroller = scrollerEl.current;
    if (!scroller) {
      return;
    }
    const above = latest.current.remainingAbove > 0 || (engine.current?.owes ?? false);
    if (above !== scroller.hasAttribute(PREPEND_ROWS_ABOVE_ATTR)) {
      scroller.toggleAttribute(PREPEND_ROWS_ABOVE_ATTR, above);
    }
  }, []);

  /**
   * THE ROWS THAT WAIT UNPAINTED ARE THOSE ABOVE THE SCROLL ORIGIN, AND NO OTHERS — judged again whenever what is
   * held changes, by the one test that made them wait: a row comes into reach by the write that pays what is held,
   * and just as well by height that leaves above the reader, or by a list replaced under it.
   */
  const paintReachableRows = useCallback(() => {
    if (unpainted.current.size === 0) {
      return;
    }
    const rowsAbove = (engine.current?.reservePx ?? 0) < -0.5;
    const origin = rowsAbove ? edgeEl.current?.getBoundingClientRect().bottom ?? 0 : 0;
    unpainted.current.forEach((wrapper) => {
      const box = wrapper.firstElementChild;
      if (rowsAbove && wrapper.isConnected && box && box.getBoundingClientRect().bottom <= origin + 0.5) {
        return; // still above the origin: it waits
      }
      wrapper.style.visibility = '';
      unpainted.current.delete(wrapper); // in reach, or gone from the document
    });
  }, []);

  /**
   * THE SETTLE, asked for: when one begins, the rows it frees are painted in its write's task, and the consumer hears
   * of the rest that follows. None begins while a commit's rows are still being set up: the commit's own passive
   * effects ask again.
   */
  const settle = useCallback(() => {
    if (settingUp.current) {
      return;
    }
    engine.current?.settle(() => {
      paintReachableRows();
      stampRowsAbove();
      latest.current.onRest?.();
    });
  }, [paintReachableRows, stampRowsAbove]);

  /**
   * WHERE THE READER HAS RUN OUT OF LOADED ROWS: the scroller's top edge at the loaded start (offset zero, or past
   * it in the band) with rows remaining above or held. The list has stopped there by itself, so the consumer is told
   * now — rows it holds as data land here, not at a rest a reader who keeps swiping never gives — and what is held is
   * settled now. With a known finger down nothing is done: its lift comes back here. The consumer is told once per
   * arrival, and again whenever it says its own news arrived (`requestRest`): rows that reach it after the reader
   * did are landed here too, at once or at the lift, with no rest. A landing that arrives while the reader stands
   * there is settled once its rows are set up.
   */
  const ranOut = useCallback(() => {
    const current = engine.current;
    const scroller = scrollerEl.current;
    const watch = rest.current;
    if (!current || !scroller || !watch) {
      return;
    }
    if (scroller.scrollTop > 0.5) {
      toldRanOut.current = false;
      return;
    }
    if (watch.armDown || current.settling || scroller.clientHeight <= 0) {
      return;
    }
    const news = consumerWaits.current || (!toldRanOut.current && latest.current.remainingAbove > 0);
    if (!current.owes && !news) {
      return;
    }
    toldRanOut.current = true;
    consumerWaits.current = false;
    latest.current.onRest?.();
    settle();
  }, [settle]);

  /**
   * What is held changed: the fact and the waiting rows follow it; while something is held a rest is asked for (an
   * idle list declares none by itself), and a reader standing at the loaded start is settled now.
   */
  const held = useCallback(() => {
    stampRowsAbove();
    paintReachableRows();
    if (engine.current?.owes) {
      rest.current?.request();
      ranOut();
    }
  }, [stampRowsAbove, paintReachableRows, ranOut]);

  /** The last commit's place is given up: its reports came, or none will. */
  const forgetCommitPlace = useCallback(() => {
    const place = commitPlace.current;
    if (place) {
      cancelAnimationFrame(place.frame);
      commitPlace.current = null;
    }
  }, []);

  /**
   * THE SIZES AN ENGINE REPORTS, after layout and before paint: height that appeared above the reader is held.
   *
   * The first reports after a commit of rows are that commit's own, and the commit's measure on the reader's row has
   * already held what it changed. So they are judged on that row once more, against the place the commit left it:
   * what moved it since is held — a landed row that filled itself in a second pass, or in its own effect before it
   * was first reported — and what each report says is only remembered. Every later report is judged by the row it
   * names, against the height remembered for it. A pane with no box reports zeros that say nothing: they are neither
   * judged nor remembered, so a pane shown again is not rows growing.
   */
  const onResize = useCallback(
    (entries: ResizeObserverEntry[]) => {
      const current = engine.current;
      const scroller = scrollerEl.current;
      if (!current || !scroller) {
        return;
      }
      const place = commitPlace.current;
      forgetCommitPlace();
      if (scroller.clientHeight <= 0) {
        return;
      }
      const scrollerTop = scroller.getBoundingClientRect().top;
      let byRow = 0;
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
          byRow += delta;
        }
      }
      // A commit's own reports: what moved the reader's row since the commit, never the rows it already counted.
      const above = place && place.box.isConnected ? current.placeOf(place.box) - place.place : byRow;
      if (Math.abs(above) > 0.01) {
        current.hold(above);
        held();
      }
    },
    [held, forgetCommitPlace]
  );

  /**
   * The scroller's OWN box gaining height re-judges the lead. Rows that landed while the scroller had no geometry —
   * a pane mounted hidden (display:none) and laid out later, a pane that grows — were judged against no viewport: the
   * opening frame saw none, the commits since saw none, and the box arrived with no commit behind it, so the page
   * above was never asked for and the reader found the loaded start short. The box's growth is the one moment left,
   * judged here by the same rule and the same gate (`askIfNeeded`: inside the lead, rows remaining, no ask in
   * flight). The height is read from the box itself, after layout, never from the entry (a consumer's own observer
   * may deliver the same moment). A shrink asks nothing — the lead shrinks with it; growth while an ask is out is
   * judged again at that ask's landing. What was held while there was no box (a settle needs one, in the frame it
   * begins and in the frame it writes) is asked for again.
   */
  const onBoxResize = useCallback(() => {
    const scroller = scrollerEl.current;
    if (!scroller) {
      return;
    }
    const height = scroller.clientHeight;
    const last = boxHeight.current;
    boxHeight.current = height;
    if (height > last) {
      askIfNeeded();
      if (engine.current?.owes) {
        rest.current?.request();
      }
    }
  }, [askIfNeeded]);

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

  // Mount: the start edge, the rest watch and the gate on the scroller.
  useLayoutEffect(() => {
    const scroller = scrollerEl.current;
    const edge = edgeEl.current;
    if (!scroller || !edge) {
      return;
    }
    const current = new ListStartEdge(scroller, edge, rowBoxes);
    engine.current = current;
    current.reset();
    firstKey.current = items.length > 0 ? itemKey(items[0]) : undefined;
    // THE REST: the consumer first — rows it holds as data land in its next commit, and are held with whatever
    // already is — then one settle for all of it.
    const watch = new ScrollRest(
      () => {
        consumerWaits.current = false;
        latest.current.onRest?.();
        settle();
      },
      () => ranOut()
    );
    rest.current = watch;
    const detachRest = watch.attach(scroller);
    const onScroll = () => {
      askIfNeeded();
      ranOut();
    };
    scroller.addEventListener('scroll', onScroll, { passive: true });
    if (typeof ResizeObserver !== 'undefined') {
      observer.current = new ResizeObserver(onResize);
      syncObserved();
      // The scroller's own box: its height as mounted is the baseline (the observation's first report says the same
      // height and judges nothing; the opening ask below keeps its frame), growth from there re-judges the lead.
      boxHeight.current = scroller.clientHeight;
      boxObserver.current = new ResizeObserver(onBoxResize);
      boxObserver.current.observe(scroller);
    }
    stampRowsAbove();
    // The opening ask waits a frame: a consumer lands its own opening view in its own effects first.
    const opening = requestAnimationFrame(() => askIfNeeded());
    const heldRows = unpainted.current;
    return () => {
      cancelAnimationFrame(opening);
      scroller.removeEventListener('scroll', onScroll);
      detachRest();
      rest.current = null;
      observer.current?.disconnect();
      observer.current = null;
      observedHeights.current.clear();
      boxObserver.current?.disconnect();
      boxObserver.current = null;
      current.cancel();
      forgetCommitPlace();
      heldRows.clear();
      engine.current = null;
    };
  }, []);

  /**
   * Immediately before a commit of rows changes the document: the reader's rows, each by its key and its top against
   * the start edge. And a stop under way ends here when the commit lands rows — the overflow back, nothing written,
   * what is held standing: the rows it adds are set up on a scroller that reads as it is, and the settle begins
   * again once they are (the commit's passive effects).
   */
  const beforeRowsCommit = useCallback((previous: unknown) => {
    const current = engine.current;
    if (!current) {
      return;
    }
    if (current.settling) {
      const { items: next, itemKey: keyOf } = latest.current;
      const known = new Set((previous as T[]).map((item) => String(keyOf(item))));
      if (next.some((item) => !known.has(String(keyOf(item))))) {
        current.cancel();
      }
    }
    rowsBefore.current = {
      rows: current.readerRows().map((box) => ({
        key: box.parentElement?.getAttribute('data-prepend-row') ?? '',
        top: current.topOf(box),
      })),
    };
  }, []);

  /**
   * EVERY COMMIT OF ROWS, in the scroller's own layout pass — after every row's own effects: the reader's row is
   * measured again, and the height that appeared above it — rows landed at the start, a chain that moved up among
   * them, a row removed — is held before paint. One measure for every shape of commit: it reads the reader's own
   * row, never which rows came or went. Should the commit have removed that row, the first of the rows after it
   * that is still in the document stands for it. With no row of the old list left, or none before, there is nothing
   * to hold against: a list replaced or filled from empty starts with nothing held.
   */
  useLayoutEffect(() => {
    const current = engine.current;
    const scroller = scrollerEl.current;
    const before = rowsBefore.current;
    rowsBefore.current = undefined;
    if (!current || !scroller || !before) {
      return; // the mount: no document came before this one
    }
    settingUp.current = true;
    const wrappers = new Map<string, HTMLElement>();
    for (let i = 0; i < scroller.children.length; i++) {
      const child = scroller.children[i];
      const key = child.getAttribute('data-prepend-row');
      if (key !== null && child instanceof HTMLElement) {
        wrappers.set(key, child);
      }
    }
    forgetCommitPlace();
    const place = before.rows.find((row) => wrappers.has(row.key));
    const box = place ? wrappers.get(place.key)?.firstElementChild : null;
    if (place && box instanceof HTMLElement) {
      const moved = current.topOf(box) - place.top;
      if (Math.abs(moved) > 0.01) {
        current.hold(moved);
      }
      // The reader's row is back where it was: this commit's own size reports are judged against that place.
      const record = {
        box,
        place: current.placeOf(box),
        frame: requestAnimationFrame(() => {
          record.frame = requestAnimationFrame(() => {
            if (commitPlace.current === record) {
              commitPlace.current = null;
            }
          });
        }),
      };
      commitPlace.current = record;
    } else {
      current.reset();
    }
    // Rows that landed at the start reopen the gate, and wait unpainted while they stand above the scroll origin
    // (their last lines would show in a scroller's own top padding): each is put among the waiting rows here, and
    // the one judgment of who waits (`paintReachableRows`, in `held` below) paints those already in reach.
    const previousFirst = firstKey.current;
    firstKey.current = items.length > 0 ? itemKey(items[0]) : undefined;
    const landed = previousFirst === undefined ? -1 : items.findIndex((item) => itemKey(item) === previousFirst);
    if (landed > 0) {
      landedSinceAsk.current = true;
      if (current.reservePx < -0.5) {
        for (let index = 0; index < landed; index++) {
          const wrapper = wrappers.get(String(itemKey(items[index])));
          if (wrapper) {
            wrapper.style.visibility = 'hidden';
            unpainted.current.add(wrapper);
          }
        }
      }
    }
    syncObserved();
    held();
  }, [items, itemKey, forgetCommitPlace, syncObserved, held]);

  // ONE judgment per commit, after it: the gate reopens at most once — for rows that landed at the start, or for
  // a `loading` that turned false and belongs to the ask in flight (a turn that lands with the chain's next ask
  // in the same commit closes the old read, never the new one) — then the lead is asked once. Not at the mount: the
  // opening ask waits its frame.
  useEffect(() => {
    const previous = previousCommit.current;
    previousCommit.current = { loading };
    if (settingUp.current) {
      // The commit's rows are set up — their own effects have run: a settle may begin again, and what waited for
      // that (a landing at the loaded start, a rest that came in between) is judged now.
      settingUp.current = false;
      held();
    }
    if (!engine.current || !mounted.current) {
      return;
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
  }, [items, loading, remainingAbove, askIfNeeded, held]);

  // Whether rows remain above is the consumer's word: the fact on the root follows it before paint.
  useLayoutEffect(() => {
    stampRowsAbove();
  }, [remainingAbove, stampRowsAbove]);

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
      requestRest: () => {
        consumerWaits.current = true;
        rest.current?.request();
        ranOut();
      },
    };
    return () => {
      apiRef.current = null;
    };
  }, [apiRef, ranOut]);

  const scrollerSx: SxProps<Theme> = [
    { overflowY: 'auto', overflowAnchor: 'none' },
    ...(Array.isArray(sx) ? sx : sx ? [sx] : []),
  ];
  return (
    <Box ref={setScroller} {...boxProps} sx={scrollerSx}>
      <div ref={edgeEl} data-prepend-start-edge style={{ position: 'relative', flexShrink: 0, overflowAnchor: 'none' }}>
        {loading && remainingAbove > 0 && loadingRow !== undefined && (
          <div
            data-prepend-loading
            style={{ position: 'absolute', left: 0, right: 0, top: '100%', zIndex: 1, pointerEvents: 'none' }}
          >
            {loadingRow}
          </div>
        )}
      </div>
      {items.map((item, index) => (
        <div key={itemKey(item)} data-prepend-row={String(itemKey(item))} style={{ display: 'contents' }}>
          {renderItem(item, index)}
        </div>
      ))}
      <RowsCommit items={items} before={beforeRowsCommit} />
      {children}
    </Box>
  );
}
