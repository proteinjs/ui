import { useCallback, useMemo } from 'react';
import { InfiniteQueryObserverResult, QueryFunctionContext, useInfiniteQuery } from 'react-query';
import { CursorLoader, CursorValue, CursorWindow } from './CursorLoader';

export type CursorWindowsQueryKey = [string, string];

/**
 * The react-query wiring `useCursorWindows` runs on, exposed as data so the contract can be
 * exercised headlessly (an `InfiniteQueryObserver` in tests drives the exact key, query
 * function, and page-param derivation the hook uses).
 */
export type CursorWindowsQuery<T> = {
  queryKey: CursorWindowsQueryKey;
  queryFn: (context: QueryFunctionContext<CursorWindowsQueryKey, CursorValue | null>) => Promise<CursorWindow<T>>;
  getNextPageParam: (lastWindow: CursorWindow<T>) => CursorValue | undefined;
};

export const buildCursorWindowsQuery = <T>(loader: CursorLoader<T>, windowSize: number): CursorWindowsQuery<T> => ({
  // Keyed [dataKey, dataQueryKey]: invalidating [dataKey] (useTableMutation's pattern)
  // prefix-matches every cursor query over the data set and refetches the loaded windows.
  queryKey: [loader.reactQueryKeys.dataKey, loader.reactQueryKeys.dataQueryKey],
  queryFn: ({ pageParam = null }) => loader.loadWindow(pageParam, windowSize),
  // null nextCursor (exhausted) must map to UNDEFINED: react-query's refetch pass re-derives
  // each window's cursor from the freshly fetched previous window, and only an undefined
  // param stops the chain — null would be passed through to queryFn and load from the top
  // again, duplicating the first window.
  getNextPageParam: (lastWindow) => lastWindow.nextCursor ?? undefined,
});

/**
 * Concatenate loaded windows into the row list, de-duplicating by `rowId` when provided
 * (first occurrence wins). Cursor windows condition on `< cursor`, so a duplicate can only
 * appear when boundary rows share the cursor value across a window boundary — dropped here
 * so row identity (e.g. React keys) stays unique.
 */
export const flattenWindows = <T>(windows: CursorWindow<T>[], rowId?: (row: T) => string | number): T[] => {
  if (!rowId) {
    return windows.reduce((rows: T[], window) => rows.concat(window.rows), []);
  }
  const seen: { [id: string]: true } = {};
  const rows: T[] = [];
  for (const window of windows) {
    for (const row of window.rows) {
      const id = String(rowId(row));
      if (!seen[id]) {
        seen[id] = true;
        rows.push(row);
      }
    }
  }
  return rows;
};

/** The results of `useCursorWindows` a caller can limit its re-renders to (see `notifyOnChangeProps`). */
export type CursorWindowsNotifyProp = 'rows' | 'error' | 'isFetching' | 'isFetchingNextWindow' | 'hasMore';

/** Each result, as the query props whose change moves it. */
const QUERY_PROPS_BY_RESULT: { [prop in CursorWindowsNotifyProp]: Array<keyof InfiniteQueryObserverResult> } = {
  rows: ['data'],
  error: ['error'],
  isFetching: ['isFetching'],
  isFetchingNextWindow: ['isFetchingNextPage'],
  hasMore: ['hasNextPage', 'isPreviousData'],
};

export interface UseCursorWindowsOptions<T> {
  /** Row identity for cross-window de-duplication (see `flattenWindows`). Pass a stable function. */
  rowId?: (row: T) => string | number;
  refetchOnWindowFocus?: boolean;
  enabled?: boolean;
  /**
   * The results whose change re-renders the caller — react-query's `notifyOnChangeProps`, in this hook's own
   * vocabulary. Omit and every change does (the pager's shape: `List` reads them all). A SECOND observer on a
   * list's query that reads only the rows and the error — a reach face beside the `List` that pages — passes
   * `['rows', 'error']` and sleeps through the fetch-state flips of every window landing and refetch, which
   * otherwise re-render it twice per landing. A query that never resolved re-reads with its error cleared, so
   * `'error'` alone still tells such an observer a retry began.
   */
  notifyOnChangeProps?: ReadonlyArray<CursorWindowsNotifyProp>;
}

export interface CursorWindowsResult<T> {
  /**
   * Every loaded window's rows, in load order. `undefined` until a first window has EVER
   * resolved for the data set (cold cache) — the caller's skeleton state. Once resolved,
   * rows persist through refetches and query-identity changes (stale-while-revalidate) and
   * swap atomically when fresh data lands.
   */
  rows: T[] | undefined;
  /** Pull the next window into the list. No-op while fetching, exhausted, or showing previous-query rows. */
  fetchNextWindow: () => void;
  /** More windows may exist (a full window implies more; the next short/empty window settles it). */
  hasMore: boolean;
  /** Re-read every loaded window from the top with freshly derived cursors; one atomic swap. */
  refresh: () => void;
  /** Any fetch in flight — the first window, a next window, or a refetch of the loaded windows. */
  isFetching: boolean;
  /**
   * A NEXT window is in flight — the sentinel's pull, and only that: false during the first window
   * (the caller's skeleton state) and during a background refetch of the loaded windows (`isFetching`
   * covers both). The signal a list's loading foot draws on: true exactly while rows are about to be
   * appended below the ones on screen.
   */
  isFetchingNextWindow: boolean;
  /**
   * The query's error (null while healthy). Pairs with `rows` for slot decisions: an error with
   * `rows` undefined means nothing ever loaded (`List`'s errorState); once rows have resolved
   * they persist through refetch failures, so an error never has to replace real data.
   */
  error: Error | null;
}

/** The query props a result list listens on, each once. */
const queryPropsOf = (results: ReadonlyArray<CursorWindowsNotifyProp>): Array<keyof InfiniteQueryObserverResult> => {
  const props: Array<keyof InfiniteQueryObserverResult> = [];
  results.forEach((result) => {
    QUERY_PROPS_BY_RESULT[result].forEach((prop) => {
      if (!props.includes(prop)) {
        props.push(prop);
      }
    });
  });
  return props;
};

/**
 * THE consumer seam for `CursorLoader`s: accumulates cursor windows through react-query's
 * infinite-query cache, keyed on the loader's `reactQueryKeys` — so a `useTableMutation`
 * (or any `invalidateQueries({ queryKey: [dataKey] })`) refetches the loaded windows in
 * place, window by window with re-derived cursors, and the rows swap atomically.
 */
export function useCursorWindows<T>(
  loader: CursorLoader<T>,
  windowSize: number,
  options: UseCursorWindowsOptions<T> = {}
): CursorWindowsResult<T> {
  const { queryKey, queryFn, getNextPageParam } = buildCursorWindowsQuery(loader, windowSize);
  const { data, error, fetchNextPage, hasNextPage, isFetching, isFetchingNextPage, isPreviousData, refetch } =
    useInfiniteQuery<CursorWindow<T>, Error, CursorWindow<T>, CursorWindowsQueryKey>(queryKey, queryFn, {
      getNextPageParam,
      // A query-identity change (new dataQueryKey) keeps showing the previous rows until the
      // new first window lands — stale-while-revalidate, no skeleton flash on filter changes.
      keepPreviousData: true,
      refetchOnWindowFocus: options.refetchOnWindowFocus ?? false,
      enabled: options.enabled ?? true,
      ...(options.notifyOnChangeProps ? { notifyOnChangeProps: queryPropsOf(options.notifyOnChangeProps) } : {}),
    });

  const rowId = options.rowId;
  const rows = useMemo(() => (data ? flattenWindows(data.pages, rowId) : undefined), [data, rowId]);

  const fetchNextWindow = useCallback(() => {
    // Previous-query rows must never anchor a next-window fetch for the new query.
    if (!isFetching && hasNextPage && !isPreviousData) {
      void fetchNextPage();
    }
  }, [isFetching, hasNextPage, isPreviousData, fetchNextPage]);

  const refresh = useCallback(() => {
    void refetch();
  }, [refetch]);

  return {
    rows,
    fetchNextWindow,
    hasMore: !!hasNextPage && !isPreviousData,
    refresh,
    isFetching,
    isFetchingNextWindow: isFetchingNextPage,
    error,
  };
}
