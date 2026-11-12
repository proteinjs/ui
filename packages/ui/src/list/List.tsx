import React, {
  ReactNode,
  useCallback,
  useEffect,
  useInsertionEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Box, BoxProps, Skeleton, SxProps, Theme, Typography } from '@mui/material';
import { CursorLoader } from '../table/CursorLoader';
import { useCursorWindows } from '../table/cursorWindows';
import { ScrollTopButton, ScrollTopButtonStyleProps } from '../components/ScrollTopButton';
import { PrependReservoir } from './PrependReservoir';
import { PREPEND_SAFE_SCROLLER_LEAD_VIEWPORTS } from './PrependSafeScroller';
import { ScrollRest } from './ScrollRest';

/**
 * The windowed mode's margin: the rows mounted beyond the viewport on each side, in client heights. The window is
 * re-centered once the viewport comes within half of it of a mounted edge, so a scroll shorter than half a screen
 * commits nothing — the budget the bounded-mount pin reads (listWindowed.test).
 */
export const LIST_WINDOW_SCREENS = 1;

/**
 * The frame budget of a scroll through a windowed list — one frame at 60 Hz. The golden's scroll leg reads it: a fling
 * through ten pages holds every frame inside it with zero long tasks. The jsdom pins hold the shape that makes the
 * number possible (no layout read in the scroll listener, one commit per frame at most, the mounted DOM bounded by the
 * viewport); the number itself is the simulator's to prove.
 */
export const LIST_SCROLL_FRAME_BUDGET_MS = 16;

/** The opt-in windowed mode of `List` (`ListProps.windowed`): what the shell needs to know about rows it has not laid out. */
export interface ListWindowing {
  /**
   * A row's height, px, until the row is measured — the seed for the spacers' sums and the window's derivation. A row's
   * measured height replaces it for as long as the list lives (a row scrolled out and back in is never measured twice
   * from the seed). Exact for a list whose rows share one height; an estimate otherwise.
   */
  estimatedRowHeight: number;
  /** A group header's height, px, until measured. Default `estimatedRowHeight`. */
  estimatedGroupHeaderHeight?: number;
  /** The margin kept mounted beyond the viewport on each side, in client heights. Default `LIST_WINDOW_SCREENS`. */
  windowScreens?: number;
  /**
   * The lead: the next window is asked while the loaded end is within this many client heights below the viewport's
   * bottom — never only at the end. Default `PREPEND_SAFE_SCROLLER_LEAD_VIEWPORTS` (the one lead constant of the
   * library's lists).
   */
  leadViewports?: number;
}

export interface ListProps<T> {
  /**
   * The list's window loader. `List` owns the loading behavior on the shared caching contract
   * (`useCursorWindows`): window accumulation with threaded cursors, keyed invalidation
   * refetching every loaded window in place, and stale-while-revalidate across query-identity
   * changes (a loader with a new `dataQueryKey` swaps rows without a skeleton flash).
   */
  loader: CursorLoader<T>;
  /** Rows fetched per cursor window — the initial paint and each sentinel-triggered extension. */
  windowSize: number;
  /**
   * The row's entire presentation — `List` renders exactly what this returns (keyed by `rowId`,
   * so the returned element needs no `key`). `index` is the row's position in the full list.
   */
  renderRow: (row: T, index: number) => ReactNode;
  /** Row identity: React keys and cross-window de-duplication. Pass a stable function. */
  rowId: (row: T) => string | number;
  /**
   * Grouping seam: consecutive rows sharing a key render as one group (the input order is the
   * render order — for the sorted lists cursor windows produce, equal keys are adjacent). The
   * shell manages only the boundaries; headers and rows stay the consumer's pixels.
   */
  groupKey?: (row: T) => string;
  /** Header above each group's rows; `groupIndex` lets consumers treat the first group specially. */
  renderGroupHeader?: (key: string, rows: T[], groupIndex: number) => ReactNode;
  /** Rendered before the first window has EVER resolved (cold cache). Rendered bare — no shell container. */
  skeleton?: ReactNode;
  /** Rendered when the list resolves empty. Default `null` — empty lists disappear. Rendered bare. */
  emptyState?: ReactNode;
  /**
   * Rendered when loading failed before anything ever resolved. Once rows have resolved they
   * win over a background refetch failure (stale-but-real data beats an error screen — the
   * Table rule), so this never replaces rows. Rendered bare.
   */
  errorState?: ReactNode;
  /** Gate fetching (react-query `enabled`) — e.g. a popover list that must not load until opened. */
  enabled?: boolean;
  refetchOnWindowFocus?: boolean;
  /**
   * Opt-in floating back-to-top button over the list's scroll container. `true` renders the
   * framework-default styling; pass `ScrollTopButtonStyleProps` (e.g. an app's house preset) to
   * restyle. Off by default. Unlike `Table`, `List` renders inside the consumer's scroller
   * rather than owning one, so the wiring finds the nearest scrollable ancestor and floats the
   * button over its bottom edge via a sticky strip at the list's tail — same geometry as
   * `Table`'s sibling-after-scroller placement. Element scrollers only: a window-scrolled page
   * has no scrollable ancestor and the button stays retired.
   */
  scrollTopButton?: boolean | ScrollTopButtonStyleProps;
  /**
   * The list's foot — rendered inside the shell after the rows (and after the back-to-top strip, so
   * the button never rests over it) and ahead of the sentinel, once rows exist, with the pager's state: `fetchingNextWindow` is true only while a NEXT window is in flight
   * (never the first window — the skeleton's — and never a background refetch of the loaded windows);
   * `hasMore` while windows remain. Called on every state, so a consumer's loading row can time its own
   * appearance across the fetch's edges (a show delay, a minimum hold); return null to draw nothing. In the windowed
   * mode the foot is drawn inside ONE box of the list's own (`data-list-foot`, a plain block box, out of the browser's
   * scroll anchoring with every other child of the root — `ROWS_OUT_OF_ANCHORING`): the foot is laid out as that box's
   * content, whatever it is — an element, a fragment, bare text, something that draws itself later.
   */
  renderFoot?: (state: ListFootState) => ReactNode;
  /**
   * THE WINDOWED MODE (opt-in; absent, the list mounts every loaded row as it always has): only the rows whose boxes
   * sit inside the viewport plus `windowScreens` client heights on each side are in the document; the rows above the
   * window stand as the reservoir (the library's `PrependReservoir` — the top spacer, sized by their measured heights,
   * absorbing every height change above the reader with no scroll write), the rows below as a plain spacer. A row's
   * height is seeded by `estimatedRowHeight` and measured once per mount by one ResizeObserver; the scroll path is one
   * passive listener that schedules one animation frame, which derives the window from the height map and commits one
   * update only when the window moves (a scroll shorter than half the margin commits nothing). The next window is
   * asked at the lead (`leadViewports` client heights before the loaded end), not at the end; the tail sentinel stays
   * as the backstop for a viewport the rows never fill. Each row (and each group header) renders inside a box-less
   * (`display: contents`) element that carries `data-list-cell`: the row's first element is its box — a fragment's
   * first element stands for it — and group containers keep `groupSx` / `groupRowsSx` around the mounted part of a
   * group. The list needs the nearest scrollable ancestor with a laid-out box: without one, or until the box has a
   * height (a pane mounted hidden), every row mounts as before and the window begins when the box arrives. THE HIDDEN
   * INTERVAL: while the box is 0, and until the first frame after it returns, the list makes NO judgment against
   * layout — no anchor is recorded or read, a cell's report (its zero under the hidden box, its re-report at the show)
   * is a measurement the height map takes and never growth to absorb, no reconcile step runs — and that first frame
   * derives the window from the scroll offset and records the anchors fresh; a debt the hide interrupted is paid at the
   * next rest. A row keeps no state of its own across the window — a row that scrolls out of the window leaves the
   * document — so a consumer holds a row's open menu, its swipe, its selection in its own state keyed by the row's
   * identity. THE LAW: the browser holds the list's place under what stands above it. The list holds its rows. So while
   * the window's engine is mounted (a scroller exists) every child of the list's root is out of the browser's scroll
   * anchoring and the root stays in it (`ROWS_OUT_OF_ANCHORING`).
   */
  windowed?: ListWindowing;
  /** The root container (wraps rows and sentinel; slots render bare). */
  sx?: BoxProps['sx'];
  /** Each group's container. */
  groupSx?: BoxProps['sx'];
  /** The rows container inside each group (e.g. between-row dividers that must skip the header). */
  groupRowsSx?: BoxProps['sx'];
}

/** What the foot slot is told: whether windows remain, and whether the next one is on its way. */
export interface ListFootState {
  hasMore: boolean;
  fetchingNextWindow: boolean;
}

/** One consecutive run of rows sharing a group key. */
type ListGroup<T> = {
  key: string;
  /** React key: the group key, disambiguated only when the same key recurs non-adjacently. */
  reactKey: string;
  rows: T[];
  /** The full-list index of the group's first row (threads `renderRow`'s global index). */
  startIndex: number;
};

const groupConsecutive = <T,>(rows: T[], groupKey: (row: T) => string): ListGroup<T>[] => {
  const groups: ListGroup<T>[] = [];
  const runCounts: { [key: string]: number } = {};
  rows.forEach((row, index) => {
    const key = groupKey(row);
    const lastGroup = groups[groups.length - 1];
    if (lastGroup && lastGroup.key === key) {
      lastGroup.rows.push(row);
      return;
    }
    const runCount = (runCounts[key] = (runCounts[key] ?? 0) + 1);
    groups.push({ key, reactKey: runCount === 1 ? key : `${key}#${runCount}`, rows: [row], startIndex: index });
  });
  return groups;
};

type ListRowProps<T> = {
  row: T;
  /** The row's position in the full list — threaded to `renderRow`. */
  index: number;
  renderRow: (row: T, index: number) => ReactNode;
};

const ListRowInner = <T,>({ row, index, renderRow }: ListRowProps<T>) => <>{renderRow(row, index)}</>;

/**
 * ONE row of the list, memoized: a render of the shell — a window landing, a fetch-state flip
 * (`isFetching`), a parent re-rendering with equal props — re-renders only the rows whose inputs
 * changed, and a row with the same item, the same index and the same `renderRow` renders nothing.
 * The inputs are stable by value for the usual list: react-query hands back the same row objects
 * until a refetch replaces them (fresh objects then render, so new data never shows stale), a
 * window appends and never shifts the rows above it, and a consumer passing a stable `renderRow`
 * (`useCallback`, or a module-level function) gets the memo's whole worth. An inline arrow still
 * renders every row every time, as before — correct, just not cheap. Without this a list of N rows
 * rendered all N on every shell render, twice per page landing: the cost that made a long list
 * stutter as it grew.
 */
const ListRow = React.memo(ListRowInner) as unknown as typeof ListRowInner;

const defaultSkeleton = (
  <Box sx={{ width: '100%' }}>
    {[0, 1, 2].map((index) => (
      <Skeleton key={index} variant='text' sx={{ fontSize: '16px' }} />
    ))}
  </Box>
);

const defaultErrorState = (
  <Typography sx={{ fontSize: '15px', color: 'text.secondary', py: 2 }}>Something went wrong.</Typography>
);

/** The nearest ancestor that scrolls vertically — the scroller the back-to-top button watches
 *  and returns to the top. `List` renders inside the consumer's scroll container rather than
 *  owning one (unlike `Table`), so the wiring finds it in the DOM at mount. */
const findScrollableAncestor = (node: HTMLElement): HTMLElement | null => {
  for (let el = node.parentElement; el; el = el.parentElement) {
    const { overflowY } = getComputedStyle(el);
    if (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') {
      return el;
    }
  }
  return null;
};

/** The button's host strip rides `position: sticky` inside the scroller — stuck at the scroll
 *  viewport's bottom edge while the reader is scrolled up, at the content tail at rest. Same
 *  geometry as `Table`'s sibling-after-scroller strip, achieved from within the scroller. The
 *  consumer's `hostSx` appends after (array-merged), so it can still restyle the strip. */
const stickyHostSx = (hostSx: ScrollTopButtonStyleProps['hostSx'], rowsHeldAlone: boolean): SxProps<Theme> => [
  { position: 'sticky', bottom: 0 },
  ...(Array.isArray(hostSx) ? hostSx : hostSx ? [hostSx] : []),
  // The strip is a child of the list's root: out of the browser's anchoring with the rest (`ROWS_OUT_OF_ANCHORING`).
  ...(rowsHeldAlone ? [OUT_OF_ANCHORING] : []),
];

// ── The windowed mode's cells, window and geometry ─────────────────────────────────────────────────────────────────

/** One thing the windowed list lays out in order: a group header, or a row. */
type ListCell<T> =
  | { key: string; kind: 'head'; group: ListGroup<T>; groupIndex: number }
  | { key: string; kind: 'row'; row: T; index: number; groupIndex: number };

/** The rows (and group headers, where a header renderer exists) as the cells the window ranges over, in document order. */
const buildCells = <T,>(
  rows: T[],
  groups: ListGroup<T>[] | undefined,
  rowId: (row: T) => string | number,
  withHeads: boolean
): ListCell<T>[] => {
  const cells: ListCell<T>[] = [];
  if (!groups) {
    rows.forEach((row, index) => cells.push({ key: `r:${rowId(row)}`, kind: 'row', row, index, groupIndex: -1 }));
    return cells;
  }
  groups.forEach((group, groupIndex) => {
    if (withHeads) {
      cells.push({ key: `h:${group.reactKey}`, kind: 'head', group, groupIndex });
    }
    group.rows.forEach((row, rowIndex) =>
      cells.push({ key: `r:${rowId(row)}`, kind: 'row', row, index: group.startIndex + rowIndex, groupIndex })
    );
  });
  return cells;
};

/** The mounted range of cells, inclusive. */
type ListWindow = { first: number; last: number };

/**
 * The window from the cells' heights and the viewport, with hysteresis: the current window stands while it still
 * covers the viewport plus half the margin on each side; otherwise the window is re-centered on the viewport plus
 * the whole margin. Returns null when the current window stands. Pure — the scroll path's one derivation.
 */
const deriveWindow = (
  heights: number[],
  viewportTop: number,
  viewportBottom: number,
  marginPx: number,
  current: ListWindow | null
): ListWindow | null => {
  const count = heights.length;
  if (count === 0) {
    return current && current.first === 0 && current.last === -1 ? null : { first: 0, last: -1 };
  }
  const rangeOver = (top: number, bottom: number): ListWindow => {
    let first = -1;
    let last = -1;
    let y = 0;
    for (let i = 0; i < count; i++) {
      const next = y + heights[i];
      if (first < 0 && next > top) {
        first = i;
      }
      if (y < bottom) {
        last = i;
      }
      y = next;
    }
    if (first < 0) {
      first = count - 1; // the viewport sits below the content: the tail stands
    }
    if (last < first) {
      last = first;
    }
    return { first, last };
  };
  const must = rangeOver(viewportTop - marginPx / 2, viewportBottom + marginPx / 2);
  if (current && current.first <= must.first && current.last >= must.last) {
    return null;
  }
  return rangeOver(viewportTop - marginPx, viewportBottom + marginPx);
};

/** The sum of the heights before `first` and after `last` — the two spacers. */
const spacerHeights = (heights: number[], window: ListWindow): { above: number; below: number } => {
  let above = 0;
  let below = 0;
  for (let i = 0; i < heights.length; i++) {
    if (i < window.first) {
      above += heights[i];
    } else if (i > window.last) {
      below += heights[i];
    }
  }
  return { above, below };
};

/** The cell wrapper: box-less, so the consumer's element is the cell's box (the scroller's shape). */
const cellWrapperStyle: React.CSSProperties = { display: 'contents' };

/**
 * THE LAW, in two sentences: the browser holds the list's place under what stands above it. The list holds its rows.
 * So while the window's engine is mounted the list's ROOT stays a candidate of the browser's scroll anchoring — what a
 * consumer renders above the list in the same scroller can change height under a reader deep in the list and the
 * browser keeps the reader's row where it was, as it does for any content — and EVERY child of the root is out of it:
 * the reservoir, the group boxes (the row boxes of an ungrouped list), the spacer below, the back-to-top strip, the
 * foot's box, the sentinel. WHY the rows are out: the list holds them itself (the reservoir, and its law for a row that
 * grows above the reader), and a browser that anchors on one of them answers a window commit with an adjustment of its
 * own, which ends an animated scroll where it stands and fires `scrollend` under a fling (WebKit from iOS 27); with
 * every child out, the browser's anchor inside the list is the root, whose top no commit of the list moves. WHY every
 * child, the foot too: a child left a candidate is the ONLY candidate under the root, and the browser holds IT — a
 * foot left in throws a reader at the tail down by every page that lands above it. WHO CARRIES THE DECLARATION: the
 * list's own boxes carry it from their render (`OUT_OF_ANCHORING`, on each while the engine is mounted) — the
 * reservoir, each group box, the spacer below, the strip, the sentinel, and THE FOOT'S BOX: the consumer's foot is
 * drawn inside one box of the list's own (`data-list-foot`), so whatever a consumer hands as the foot — an element, a
 * fragment, bare text, a box-less element, something that draws itself later on its own state — sits under a box that
 * is already out. The rows of an UNGROUPED list are the one thing no box of the list's stands over (a cell is box-less,
 * and a browser reads no declaration from an element with no box): the engine's walk (`holdRowsAlone`, where the engine
 * re-reads the document — at its mount and after each commit of the list, ahead of every read of the layout) declares
 * each element of each cell under the root, and the engine's watch (each such cell's child list) walks again for a row
 * that draws or replaces its own box on a commit that is not the list's. WHEN THE ENGINE LEAVES the list's own boxes
 * drop the declaration with that render, and the rows' boxes go with the mode (a list leaving the windowed mode mounts
 * its rows anew): nothing declared outlives the engine. Declared with the engine, never by the `windowed` prop alone: a
 * list handed the prop with no scrollable ancestor mounts no engine and declares nothing, and a list that is not
 * windowed is untouched (its foot drawn bare, as ever).
 * NOT REACHED, in an ungrouped list only: a row of bare text (the row's first element is its box) and the children of a
 * consumer's own box-less element (`display: contents`) handed as a row — such a row stays a candidate. A group box a
 * consumer's `groupSx` makes box-less carries nothing for its rows; a portal is not under the root and is not the
 * list's to hold.
 */
const ROWS_OUT_OF_ANCHORING = { property: 'overflow-anchor', value: 'none' } as const;

/** The declaration as the list's own boxes carry it: React's `style` on each, the strip's `sx`. */
const OUT_OF_ANCHORING = { overflowAnchor: ROWS_OUT_OF_ANCHORING.value } as const;

/**
 * The engine's walk: the rows of an ungrouped list — each element of each box-less cell directly under the root — out
 * of the browser's anchoring, and each such cell's child list under the engine's watch. A grouped list has no cell
 * directly under its root (its group boxes carry the declaration for their rows): the walk finds nothing there and the
 * watch is handed nothing.
 */
const holdRowsAlone = (root: HTMLElement, watch: MutationObserver | null): void => {
  for (let i = 0; i < root.children.length; i++) {
    const cell = root.children[i];
    if (!cell.hasAttribute('data-list-cell')) {
      continue;
    }
    watch?.observe(cell, { childList: true });
    for (let k = 0; k < cell.children.length; k++) {
      (cell.children[k] as HTMLElement).style.setProperty(ROWS_OUT_OF_ANCHORING.property, ROWS_OUT_OF_ANCHORING.value);
    }
  }
};

/**
 * `Table`'s row-stream peer: `List` renders cursor windows through `renderRow`, owning behavior
 * while the consumer owns every pixel. Behavior in the shell: window accumulation and row
 * de-duplication (`useCursorWindows` on the one CursorLoader → react-query seam `Table` rides,
 * so keyed invalidation and caching work identically across both), a tail sentinel that pulls
 * the next window into view (viewport-rooted IntersectionObserver — re-observed as the list
 * grows, so an under-filled viewport chains windows until it fills), group boundary management,
 * and the skeleton / empty / error slot switch — and, opted into through `windowed`, the window:
 * only the viewport's rows in the document, the reservoir above them, the lead ahead of the end.
 * Presentation in the consumer: rows, group
 * headers, and the slot contents; the shell's own containers are plain boxes that accept `sx`.
 * Deliberately NOT here (v1): selection and row-action affordances — Table idioms, added when a
 * consumer demands them.
 */
export function List<T>({
  loader,
  windowSize,
  renderRow,
  rowId,
  groupKey,
  renderGroupHeader,
  skeleton = defaultSkeleton,
  emptyState = null,
  errorState = defaultErrorState,
  enabled,
  refetchOnWindowFocus,
  scrollTopButton,
  renderFoot,
  windowed,
  sx,
  groupSx,
  groupRowsSx,
}: ListProps<T>): React.ReactElement {
  // rows is undefined until the first window ever resolves (the skeleton state); afterwards
  // stale rows persist through refetches and query-identity changes (stale-while-revalidate).
  const { rows, fetchNextWindow, hasMore, isFetchingNextWindow, error } = useCursorWindows(loader, windowSize, {
    rowId,
    enabled,
    refetchOnWindowFocus,
  });
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Scroller discovery via callback ref: runs exactly when the shell mounts/unmounts (the
  // skeleton/empty slots render bare, so there is no root to anchor discovery to until rows
  // exist), and re-runs if React remounts the root.
  const [scrollHost, setScrollHost] = useState<HTMLElement | null>(null);
  const rootEl = useRef<HTMLDivElement | null>(null);
  /** The scroller as a ref too: the frame and the observers read it, so a frame queued before the state landed runs current. */
  const hostRef = useRef<HTMLElement | null>(null);
  const discoverScrollHost = useCallback((node: HTMLDivElement | null) => {
    rootEl.current = node;
    const host = node ? findScrollableAncestor(node) : null;
    hostRef.current = host;
    setScrollHost(host);
  }, []);

  // Re-created whenever the list grows: observe() re-reports current intersection, so a
  // sentinel still in view after a fetch keeps pulling windows without a new scroll event.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) {
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        fetchNextWindow();
      }
    });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [rows, hasMore, fetchNextWindow]);

  const groups = useMemo(() => (rows && groupKey ? groupConsecutive(rows, groupKey) : undefined), [rows, groupKey]);

  // ── The windowed mode ────────────────────────────────────────────────────────────────────────────────────────────
  const isWindowed = windowed !== undefined;
  const withHeads = renderGroupHeader !== undefined;
  const cells = useMemo(
    () => (isWindowed && rows ? buildCells(rows, groups, rowId, withHeads) : undefined),
    [isWindowed, rows, groups, rowId, withHeads]
  );
  /** The mounted range; null = every cell (no geometry yet, or not windowed). */
  const [window, setWindow] = useState<ListWindow | null>(null);
  /** The range the document holds — the committed state, what `afterCommit` sizes the reservoir from. */
  const committed = useRef<ListWindow | null>(null);
  committed.current = window;
  /** The heights map: a cell's measured height, by its key, for the list's life. */
  const heights = useRef(new Map<string, number>());
  /** The mounted cells' boxes by key, as of the last commit (document order kept in `boxOrder`). */
  const boxes = useRef(new Map<string, HTMLElement>());
  const boxOrder = useRef<string[]>([]);
  const keyOfBox = useRef(new WeakMap<Element, string>());
  const reservoirEl = useRef<HTMLDivElement | null>(null);
  const engine = useRef<PrependReservoir | null>(null);
  /** The engine's watch of an ungrouped list's cells (`holdRowsAlone`); null while no engine is mounted. */
  const rowWatch = useRef<MutationObserver | null>(null);
  const rest = useRef<ScrollRest | null>(null);
  const cellObserver = useRef<ResizeObserver | null>(null);
  const observed = useRef(new Set<Element>());
  /** The elements whose first report (their measurement) has landed — a later report is a change. */
  const reported = useRef(new WeakSet<Element>());
  const boxObserver = useRef<ResizeObserver | null>(null);
  const clientHeight = useRef(0);
  /**
   * False through the hidden interval — while the box is 0 and until the first frame after it returns — in which the
   * list makes no judgment against layout: no anchor recorded or read (`afterCommit`), no report absorbed as growth
   * and no zero taken as a measurement (`onCellResize`), no reconcile step (the rest). Two writers: `readBox` opens it
   * (a box of 0; false from the mount until the first frame), the frame with a box closes it, deriving the window and
   * the anchors fresh from the layout as it is.
   */
  const laidOut = useRef(false);
  const frame = useRef(0);
  /** The range the frame last derived — the hysteresis's reference; the committed one is `committed`. */
  const windowRef = useRef<ListWindow | null>(null);
  const askInFlight = useRef(false);
  const rowCountAtAsk = useRef(-1);
  /**
   * The two anchors: the first and the last mounted cell, by key and top against the reservoir — what the next commit
   * reads its drift from, so they are recorded wherever the list itself moves that layout (`recordAnchors`): after a
   * commit, after a cell's report changed a height, after a reconcile step.
   */
  const anchors = useRef<Array<{ key: string; top: number }>>([]);
  const latest = useRef({
    windowed,
    cells,
    hasMore,
    fetchNextWindow,
    isFetchingNextWindow,
    rowCount: rows ? rows.length : 0,
  });
  latest.current = {
    windowed,
    cells,
    hasMore,
    fetchNextWindow,
    isFetchingNextWindow,
    rowCount: rows ? rows.length : 0,
  };

  const seedOf = useCallback((cell: ListCell<T>): number => {
    const options = latest.current.windowed;
    if (!options) {
      return 0;
    }
    return cell.kind === 'head'
      ? options.estimatedGroupHeaderHeight ?? options.estimatedRowHeight
      : options.estimatedRowHeight;
  }, []);

  /** Every cell's height from the map, the seed where none is measured — the frame's one input. */
  const cellHeights = useCallback((): number[] => {
    const current = latest.current.cells;
    if (!current) {
      return [];
    }
    const map = heights.current;
    return current.map((cell) => map.get(cell.key) ?? seedOf(cell));
  }, [seedOf]);

  /** The mounted cells' boxes in document order — the engine's rows. */
  const mountedBoxes = useCallback((): HTMLElement[] => {
    const out: HTMLElement[] = [];
    boxOrder.current.forEach((key) => {
      const box = boxes.current.get(key);
      if (box) {
        out.push(box);
      }
    });
    return out;
  }, []);

  /**
   * The document re-read after a commit, ahead of every read of its layout: the rows the commit left directly under
   * the root (an ungrouped list's) taken out of the browser's anchoring (`ROWS_OUT_OF_ANCHORING` — a row that is a
   * candidate at a layout the list itself asks for is a row the browser may hold), then the boxes, each cell wrapper's
   * first element.
   */
  const refreshBoxes = useCallback(() => {
    boxes.current.clear();
    boxOrder.current = [];
    const root = rootEl.current;
    if (!root) {
      return;
    }
    holdRowsAlone(root, rowWatch.current);
    const wrappers = root.querySelectorAll('[data-list-cell]');
    for (let i = 0; i < wrappers.length; i++) {
      const wrapper = wrappers[i];
      const key = wrapper.getAttribute('data-list-cell');
      const box = wrapper.firstElementChild;
      if (key && box instanceof HTMLElement) {
        boxes.current.set(key, box);
        boxOrder.current.push(key);
        keyOfBox.current.set(box, key);
      }
    }
  }, []);

  /** The scroller's box as laid out now — read in its observer and at the mount, never on the scroll path; a box of 0 opens the hidden interval. */
  const readBox = useCallback((host: HTMLElement) => {
    clientHeight.current = host.clientHeight;
    if (clientHeight.current <= 0) {
      laidOut.current = false;
    }
  }, []);

  /**
   * The anchors from the layout as it is now. A record older than the list's own last change of that layout reads the
   * change back as drift at the next commit: a hold undone (the growth un-absorbed), or a payment absorbed again as a
   * debt nobody owes — the reader's row thrown by it at every commit after, a write at every rest (an engine's own
   * anchoring hid both; on one that does not anchor — and under `ROWS_OUT_OF_ANCHORING` on every one — the list's
   * record is the only one).
   */
  const recordAnchors = useCallback(() => {
    const current = engine.current;
    const order = boxOrder.current;
    anchors.current = [];
    if (!current || order.length === 0) {
      return;
    }
    const firstKey = order[0];
    const lastKey = order[order.length - 1];
    anchors.current.push({ key: firstKey, top: current.topOf(boxes.current.get(firstKey) as HTMLElement) });
    if (lastKey !== firstKey) {
      anchors.current.push({ key: lastKey, top: current.topOf(boxes.current.get(lastKey) as HTMLElement) });
    }
  }, []);

  /** A reconcile step is owed: at the next rest, never in this task (the reservoir's law). */
  const requestReconcile = useCallback(() => {
    const current = engine.current;
    if (current && current.owed(clientHeight.current)) {
      rest.current?.request();
    }
  }, []);

  /** The gate: the next window asked while the loaded end is inside the lead, one ask in flight. */
  const askIfNeeded = useCallback((viewportBottom: number, totalHeight: number) => {
    const { windowed: options, hasMore: more, fetchNextWindow: ask, rowCount } = latest.current;
    if (!options || !more || askInFlight.current || clientHeight.current <= 0) {
      return;
    }
    const lead = (options.leadViewports ?? PREPEND_SAFE_SCROLLER_LEAD_VIEWPORTS) * clientHeight.current;
    if (totalHeight - viewportBottom >= lead) {
      return;
    }
    askInFlight.current = true;
    rowCountAtAsk.current = rowCount;
    ask();
  }, []);

  /**
   * THE FRAME: one per scroll burst — reads the scroll position, derives the window from the height map and commits
   * one update only when the window moves; then judges the lead. Its geometry reads are two rects on a clean layout
   * (the list's offset inside a shared scroller whose content above it may move) and the scroll offset — never a
   * read per row, never a read in the scroll listener.
   */
  const onFrame = useCallback(() => {
    frame.current = 0;
    const host = hostRef.current;
    const root = rootEl.current;
    const options = latest.current.windowed;
    if (!host || !root || !options) {
      return;
    }
    const height = clientHeight.current;
    const allHeights = cellHeights();
    if (height <= 0) {
      // THE HIDDEN PANE (the box 0): every row mounts, as documented — and the frame FORGETS the hysteresis's reference
      // range, judged against the layout the box no longer has (else the box's return finds the stale window "still
      // covering" the viewport and resumes nothing — row 3234 round 2, the refuter's R1/R2). The anchors are
      // `afterCommit`'s: through the hidden interval it records none and reads none (round 3). Nothing more: the
      // heights map is a measurement, not a judgment; the ask gate is judged fresh at a height; the committed range is
      // the state, nulled here.
      if (windowRef.current !== null) {
        windowRef.current = null;
        setWindow(null);
      }
      return;
    }
    if (!laidOut.current) {
      // THE INTERVAL'S END — the first frame with a box since it was 0: the window is derived below from the scroll
      // offset with no reference (forgotten above), its commit records the anchors fresh, and a debt the hide
      // interrupted is owed at the next rest.
      laidOut.current = true;
      requestReconcile();
    }
    const scrollTop = host.scrollTop;
    const listTop = root.getBoundingClientRect().top - host.getBoundingClientRect().top + scrollTop;
    const viewportTop = scrollTop - listTop;
    const viewportBottom = viewportTop + height;
    const margin = (options.windowScreens ?? LIST_WINDOW_SCREENS) * height;
    const next = deriveWindow(allHeights, viewportTop, viewportBottom, margin, windowRef.current);
    if (next) {
      windowRef.current = next;
      setWindow(next);
    }
    let total = 0;
    for (let i = 0; i < allHeights.length; i++) {
      total += allHeights[i];
    }
    askIfNeeded(viewportBottom, total);
  }, [cellHeights, askIfNeeded, requestReconcile]);

  const scheduleFrame = useCallback(() => {
    if (frame.current === 0) {
      frame.current = requestAnimationFrame(onFrame);
    }
  }, [onFrame]);

  /** A mounted cell's box reported: the first report measures it; a change re-measures it and, above the reader, is absorbed. */
  const onCellResize = useCallback(
    (entries: ResizeObserverEntry[]) => {
      const current = engine.current;
      const host = hostRef.current;
      if (!current || !host) {
        return;
      }
      let absorb = 0;
      let changed = false;
      let hostTop: number | null = null;
      for (const entry of entries) {
        const box = entry.target;
        const key = keyOfBox.current.get(box);
        if (!key) {
          continue;
        }
        const size = Array.isArray(entry.borderBoxSize) ? entry.borderBoxSize[0] : entry.borderBoxSize;
        const height = size && typeof size.blockSize === 'number' ? size.blockSize : entry.contentRect.height;
        if (!laidOut.current && height <= 0) {
          // THE HIDDEN ZERO: a cell's 0 under a box of 0 is NO measurement — the map keeps its last real height, so a
          // reveal staged over two commits (the box back and its first frame BEFORE the cells' re-report: a container
          // shown a commit ahead of its content) derives that frame's window from the heights the rows have, not from
          // zeros (round 4, the refuter's R7 — listWindowed 10e). The re-report at a height is the measurement.
          continue;
        }
        const last = heights.current.get(key);
        heights.current.set(key, height);
        if (!reported.current.has(box)) {
          // The element's first report is its MEASUREMENT — the map takes it; what its mount changed above the
          // reader the commit's hold already absorbed (a re-mounted row at a height the map did not know).
          reported.current.add(box);
          continue;
        }
        if (!laidOut.current) {
          // THE HIDDEN INTERVAL: the report is a MEASUREMENT the map took — a cell's re-report at its height when the
          // pane shows (the second of the observer's two reports; the first, its zero, skipped above) — never growth
          // to absorb: there is no laid-out "before" the change could have pushed the reader from, and the first
          // frame with a box derives the window and records the anchors from the layout as it is (round 3, the
          // refuter's R5/R6).
          continue;
        }
        if (last === undefined) {
          continue;
        }
        const delta = height - last;
        if (delta === 0) {
          continue;
        }
        changed = true;
        if (hostTop === null) {
          hostTop = host.getBoundingClientRect().top;
        }
        // The row's bottom BEFORE the change above the scroller's top edge: the whole change pushed the reader.
        if (box.getBoundingClientRect().bottom - delta <= hostTop + 0.5) {
          absorb += delta;
        }
      }
      if (absorb !== 0) {
        current.absorbGrowth(absorb);
        requestReconcile();
      }
      if (changed) {
        // A height changed between two commits, absorbed or not: the anchors' tops moved with it.
        recordAnchors();
      }
    },
    [requestReconcile, recordAnchors]
  );

  /** The observer follows the mounted cells. */
  const syncObserved = useCallback(() => {
    const ro = cellObserver.current;
    if (!ro) {
      return;
    }
    const present = new Set<Element>(mountedBoxes());
    observed.current.forEach((box) => {
      if (!present.has(box)) {
        ro.unobserve(box);
        observed.current.delete(box);
      }
    });
    present.forEach((box) => {
      if (!observed.current.has(box)) {
        ro.observe(box);
        observed.current.add(box);
      }
    });
  }, [mountedBoxes]);

  /**
   * After every commit of the windowed list, in the rows' own layout pass: the reservoir takes the rows above the
   * window by their measured heights; a cell mounted before and after the commit (the first or the last of the window
   * before it) holds its place — its drift, the difference between the heights the rows mounted above it were seeded
   * with and the heights they were laid out at, is absorbed before paint and paid at the rest (the reservoir's laws);
   * a commit with no surviving cell (a jump) holds nothing. Then the anchors and the observer follow the new window.
   * Through the hidden interval the anchors are neither read nor recorded — a top recorded against a laid-out window,
   * read against a box of 0, is a drift of the whole reservoir, and a top of 0 recorded under the hidden layout, read
   * at the show, the same drift the other way (round 3, the refuter's R4); the first frame with a box commits a window
   * whose anchors are recorded here, fresh.
   */
  const afterCommit = useCallback(() => {
    const current = engine.current;
    if (!current) {
      return;
    }
    refreshBoxes();
    const allHeights = cellHeights();
    const range = committed.current ?? { first: 0, last: allHeights.length - 1 };
    const { above } = spacerHeights(allHeights, range);
    current.setWindowAbove(above);
    if (!laidOut.current) {
      anchors.current = [];
      syncObserved();
      return;
    }
    const anchor = anchors.current.find((candidate) => boxes.current.has(candidate.key));
    if (anchor) {
      const box = boxes.current.get(anchor.key) as HTMLElement;
      const drift = current.topOf(box) - anchor.top;
      if (Math.abs(drift) > 0.5) {
        current.absorbGrowth(drift);
        requestReconcile();
      }
    }
    current.record();
    recordAnchors();
    syncObserved();
  }, [refreshBoxes, cellHeights, requestReconcile, recordAnchors, syncObserved]);

  // Mount (the windowed mode, once the scroller is known): the reservoir over the top spacer, the rest watch, the
  // passive scroll listener, the two observers, the opening frame.
  useLayoutEffect(() => {
    const host = scrollHost;
    const root = rootEl.current;
    const reservoir = reservoirEl.current;
    if (!isWindowed || !host || !root || !reservoir) {
      return;
    }
    const current = new PrependReservoir(host, reservoir, mountedBoxes);
    engine.current = current;
    current.setRemaining(0, latest.current.windowed?.estimatedRowHeight ?? 0);
    // The engine's watch: an ungrouped row that draws or replaces its own box on a commit that is NOT the list's — the
    // walk again, before the browser's next layout. It serves nothing else: every other child of the root is a box of
    // the list's own and carries the declaration from its render (the law at `ROWS_OUT_OF_ANCHORING`).
    const watchOfRows: MutationObserver = new MutationObserver(() => holdRowsAlone(root, watchOfRows));
    rowWatch.current = watchOfRows;
    // The engine's first re-read of the document: an ungrouped list's rows out of the browser's anchoring, then the
    // boxes — before the reservoir's first read of the layout.
    refreshBoxes();
    current.initialize();
    const watch = new ScrollRest(() => {
      // No step through the hidden interval: its drift is measured against a box of 0 — a debt silently zeroed, no
      // write to hold the reader. The interval's end re-asks the rest for what is owed.
      const hostNow = scrollHost;
      if (hostNow && laidOut.current && current.owed(clientHeight.current)) {
        current.step(clientHeight.current);
        recordAnchors();
        if (current.owed(clientHeight.current)) {
          watch.request();
        }
      }
    });
    rest.current = watch;
    const detachRest = watch.attach(host);
    // THE SCROLL LISTENER: nothing but the frame's request — no read, no render, no work per event.
    const onScroll = () => scheduleFrame();
    host.addEventListener('scroll', onScroll, { passive: true });
    // `laidOut` stands false from the mount (its ref's seed) until the opening frame below closes the interval; a box
    // of 0 here keeps it so (`readBox`). No third writer.
    readBox(host);
    if (typeof ResizeObserver !== 'undefined') {
      // The scroller's own box: its height read after layout, in the observer, never in the scroll path. Created BEFORE
      // the cells' observer — LOAD-BEARING: the spec delivers observers in creation order, so in one broadcast (a pane
      // hidden, a pane shown) the box's report leads the cells' and the hidden interval is open before a cell reports
      // under it; the other order judges the hide's zeros against the standing layout (a scroller below a bar absorbs
      // every mounted row above its edge — listWindowed 10f pins the order) and lets them into the map (10e).
      boxObserver.current = new ResizeObserver(() => {
        readBox(host);
        scheduleFrame();
      });
      boxObserver.current.observe(host);
      cellObserver.current = new ResizeObserver(onCellResize);
    }
    afterCommit();
    scheduleFrame();
    return () => {
      if (frame.current !== 0) {
        cancelAnimationFrame(frame.current);
        frame.current = 0;
      }
      host.removeEventListener('scroll', onScroll);
      detachRest();
      rest.current = null;
      cellObserver.current?.disconnect();
      cellObserver.current = null;
      observed.current.clear();
      boxObserver.current?.disconnect();
      boxObserver.current = null;
      engine.current = null;
      anchors.current = [];
      watchOfRows.disconnect();
      rowWatch.current = null;
    };
    // The options ride `latest`; the mount follows the scroller and the mode alone.
  }, [scrollHost, isWindowed]);

  /**
   * THE RESERVOIR STANDS FOR THE ROWS ABOVE THE WINDOW AT EVERY LAYOUT — the first one a commit's own effects ask for
   * among them. A commit that moves the window takes the rows above it out of the document, and the reservoir is sized
   * by the engine, never by React: until it is, the content is short by those rows. A row's own layout effect that
   * reads the layout (a title measuring its overflow) asks the browser for a layout in that state, and the browser
   * clamps the offset to the short content: a reader who jumped down the list (a dragged scrollbar, the End key, a
   * restored offset) is thrown back by the rows the window dropped. A browser anchored on a row or on the spacer below
   * brought the offset back; with every child of the root out of the anchoring (`ROWS_OUT_OF_ANCHORING`) nothing does.
   * So the reservoir takes the rows above in the commit's INSERTION pass — after React has changed the document, before
   * any layout effect of any component — and `afterCommit` finds it standing.
   */
  useInsertionEffect(() => {
    const current = engine.current;
    if (!current) {
      return;
    }
    const allHeights = cellHeights();
    current.setWindowAbove(spacerHeights(allHeights, window ?? { first: 0, last: allHeights.length - 1 }).above);
  }, [window, cells, cellHeights]);

  // Every commit of the window or the cells: the reservoir and the anchors follow (the mount's effect ran its own).
  useLayoutEffect(() => {
    if (engine.current) {
      afterCommit();
    }
  }, [window, cells, afterCommit]);

  // The gate reopens on a landing (the rows grew since the ask) or on a read that settled with nothing (the next-window
  // flag turned false); every commit re-judges the window and the lead — a viewport the first window never filled
  // chains windows until the lead is met.
  useEffect(() => {
    if (!isWindowed) {
      return;
    }
    const count = rows ? rows.length : 0;
    if (askInFlight.current && (count !== rowCountAtAsk.current || !isFetchingNextWindow)) {
      askInFlight.current = false;
    }
    scheduleFrame();
  }, [isWindowed, rows, isFetchingNextWindow, hasMore, scheduleFrame]);

  if (!rows) {
    return <>{error ? errorState : skeleton}</>;
  }

  if (rows.length === 0) {
    return <>{emptyState}</>;
  }

  const scrollTopStyleProps = scrollTopButton && scrollTopButton !== true ? scrollTopButton : undefined;
  /**
   * The engine is mounted — the windowed mode, in a scroller (the mount effect's own condition, in the commit that
   * mounts it): each box of the list's own under the root carries the declaration from this render
   * (`ROWS_OUT_OF_ANCHORING`).
   */
  const rowsHeldAlone = isWindowed && scrollHost !== null;
  const outOfAnchoring = rowsHeldAlone ? OUT_OF_ANCHORING : undefined;

  /** The windowed body: the reservoir, the mounted cells in their group containers, the spacer below. */
  const windowedBody = (): ReactNode => {
    const all = cells as ListCell<T>[];
    const allHeights = cellHeights();
    const range = window ?? { first: 0, last: all.length - 1 };
    const first = Math.min(range.first, all.length - 1);
    const last = Math.min(range.last, all.length - 1);
    const { below } = spacerHeights(allHeights, { first, last });
    const nodes: ReactNode[] = [];
    const cellNode = (cell: ListCell<T>): ReactNode => (
      <div key={cell.key} data-list-cell={cell.key} style={cellWrapperStyle}>
        {cell.kind === 'head' ? (
          renderGroupHeader?.(cell.group.key, cell.group.rows, cell.groupIndex)
        ) : (
          <ListRow<T> row={cell.row} index={cell.index} renderRow={renderRow} />
        )}
      </div>
    );
    if (groups) {
      let i = first;
      while (i <= last) {
        const groupIndex = all[i].groupIndex;
        const group = groups[groupIndex];
        let head: ReactNode = null;
        const rowNodes: ReactNode[] = [];
        while (i <= last && all[i].groupIndex === groupIndex) {
          const cell = all[i];
          if (cell.kind === 'head') {
            head = cellNode(cell);
          } else {
            rowNodes.push(cellNode(cell));
          }
          i++;
        }
        nodes.push(
          <Box key={group.reactKey} sx={groupSx} style={outOfAnchoring}>
            {head}
            <Box sx={groupRowsSx}>{rowNodes}</Box>
          </Box>
        );
      }
    } else {
      for (let i = first; i <= last; i++) {
        nodes.push(cellNode(all[i]));
      }
    }
    return (
      <>
        {/* The reservoir — the rows above the window by their measured heights, sized by the engine in the rows' own
            layout pass (never by React); out of the browser's anchoring while the engine is mounted, as every child of
            the root is (`ROWS_OUT_OF_ANCHORING`), so the browser's anchoring never doubles the hold. */}
        <div ref={reservoirEl} data-list-reservoir style={{ position: 'relative', flexShrink: 0, ...outOfAnchoring }} />
        {nodes}
        <div data-list-below style={{ height: `${below}px`, flexShrink: 0, ...outOfAnchoring }} />
      </>
    );
  };

  return (
    <Box ref={scrollTopButton || isWindowed ? discoverScrollHost : undefined} sx={sx}>
      {cells
        ? windowedBody()
        : groups
          ? groups.map((group, groupIndex) => (
              <Box key={group.reactKey} sx={groupSx}>
                {renderGroupHeader?.(group.key, group.rows, groupIndex)}
                <Box sx={groupRowsSx}>
                  {group.rows.map((row, rowIndex) => (
                    <ListRow<T> key={rowId(row)} row={row} index={group.startIndex + rowIndex} renderRow={renderRow} />
                  ))}
                </Box>
              </Box>
            ))
          : rows.map((row, index) => <ListRow<T> key={rowId(row)} row={row} index={index} renderRow={renderRow} />)}
      {/* The back-to-top strip AHEAD of the foot: sticky inside the scroller, it rests at its flow
          position once the reader is at the tail, the button floating up from it — placed after the
          foot it sat exactly over a loading row's spinner (the phone, 2026-10-16). Ahead, the button
          keeps its resting band over the last row and the foot shows clear below it. */}
      {scrollTopButton && (
        <ScrollTopButton
          scrollContainer={scrollHost}
          {...scrollTopStyleProps}
          hostSx={stickyHostSx(scrollTopStyleProps?.hostSx, rowsHeldAlone)}
        />
      )}
      {/* The foot. In the windowed mode it is drawn inside ONE box of the list's own, out of the browser's anchoring
          from its render while the engine is mounted — so whatever the consumer hands (an element, a fragment, bare
          text, a box-less element, something that draws itself later) sits under a box that is already out: a foot
          left a candidate is the only one under the root, and the browser holding it throws a reader at the tail down
          by every landed page (`ROWS_OUT_OF_ANCHORING`). A list that is not windowed draws its foot bare, as ever. */}
      {renderFoot &&
        (isWindowed ? (
          <div data-list-foot style={outOfAnchoring}>
            {renderFoot({ hasMore, fetchingNextWindow: isFetchingNextWindow })}
          </div>
        ) : (
          renderFoot({ hasMore, fetchingNextWindow: isFetchingNextWindow })
        ))}
      {hasMore && <Box ref={sentinelRef} data-list-sentinel sx={{ height: '1px' }} style={outOfAnchoring} />}
    </Box>
  );
}
