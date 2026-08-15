import React, { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, BoxProps, Skeleton, SxProps, Theme, Typography } from '@mui/material';
import { CursorLoader } from '../table/CursorLoader';
import { useCursorWindows } from '../table/cursorWindows';
import { ScrollTopButton, ScrollTopButtonStyleProps } from '../components/ScrollTopButton';

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
  /** The root container (wraps rows and sentinel; slots render bare). */
  sx?: BoxProps['sx'];
  /** Each group's container. */
  groupSx?: BoxProps['sx'];
  /** The rows container inside each group (e.g. between-row dividers that must skip the header). */
  groupRowsSx?: BoxProps['sx'];
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
const stickyHostSx = (hostSx: ScrollTopButtonStyleProps['hostSx']): SxProps<Theme> => [
  { position: 'sticky', bottom: 0 },
  ...(Array.isArray(hostSx) ? hostSx : hostSx ? [hostSx] : []),
];

/**
 * `Table`'s row-stream peer: `List` renders cursor windows through `renderRow`, owning behavior
 * while the consumer owns every pixel. Behavior in the shell: window accumulation and row
 * de-duplication (`useCursorWindows` on the one CursorLoader → react-query seam `Table` rides,
 * so keyed invalidation and caching work identically across both), a tail sentinel that pulls
 * the next window into view (viewport-rooted IntersectionObserver — re-observed as the list
 * grows, so an under-filled viewport chains windows until it fills), group boundary management,
 * and the skeleton / empty / error slot switch. Presentation in the consumer: rows, group
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
  sx,
  groupSx,
  groupRowsSx,
}: ListProps<T>): React.ReactElement {
  // rows is undefined until the first window ever resolves (the skeleton state); afterwards
  // stale rows persist through refetches and query-identity changes (stale-while-revalidate).
  const { rows, fetchNextWindow, hasMore, error } = useCursorWindows(loader, windowSize, {
    rowId,
    enabled,
    refetchOnWindowFocus,
  });
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Scroller discovery via callback ref: runs exactly when the shell mounts/unmounts (the
  // skeleton/empty slots render bare, so there is no root to anchor discovery to until rows
  // exist), and re-runs if React remounts the root.
  const [scrollHost, setScrollHost] = useState<HTMLElement | null>(null);
  const discoverScrollHost = useCallback((node: HTMLDivElement | null) => {
    setScrollHost(node ? findScrollableAncestor(node) : null);
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

  if (!rows) {
    return <>{error ? errorState : skeleton}</>;
  }

  if (rows.length === 0) {
    return <>{emptyState}</>;
  }

  const scrollTopStyleProps = scrollTopButton && scrollTopButton !== true ? scrollTopButton : undefined;

  return (
    <Box ref={scrollTopButton ? discoverScrollHost : undefined} sx={sx}>
      {groups
        ? groups.map((group, groupIndex) => (
            <Box key={group.reactKey} sx={groupSx}>
              {renderGroupHeader?.(group.key, group.rows, groupIndex)}
              <Box sx={groupRowsSx}>
                {group.rows.map((row, rowIndex) => (
                  <React.Fragment key={rowId(row)}>{renderRow(row, group.startIndex + rowIndex)}</React.Fragment>
                ))}
              </Box>
            </Box>
          ))
        : rows.map((row, index) => <React.Fragment key={rowId(row)}>{renderRow(row, index)}</React.Fragment>)}
      {hasMore && <Box ref={sentinelRef} data-list-sentinel sx={{ height: '1px' }} />}
      {scrollTopButton && (
        <ScrollTopButton
          scrollContainer={scrollHost}
          {...scrollTopStyleProps}
          hostSx={stickyHostSx(scrollTopStyleProps?.hostSx)}
        />
      )}
    </Box>
  );
}
