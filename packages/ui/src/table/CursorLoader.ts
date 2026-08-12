import { ReactQueryKeys, KeyedDataLoader } from './TableLoader';

/**
 * A cursor anchors the next window at the primary-sort-field value of the last row loaded.
 * Cursors ride react-query cache state (`pageParams`) and may appear in query keys, so the
 * type is limited to values that serialize cleanly: scalars, `Date`, or anything with a
 * stable `toJSON` (e.g. a moment).
 */
export type CursorValue = string | number | boolean | Date | { toJSON(): string };

export type CursorWindow<T> = {
  rows: T[];
  /** Cursor anchoring the window after this one; null = the data set is exhausted. */
  nextCursor: CursorValue | null;
};

/**
 * The cursor-window counterpart to `TableLoader`: `reactQueryKeys` keep the same semantics
 * (`dataKey` names the data set — invalidating `[dataKey]` reaches every cached query over
 * it, these windows included; `dataQueryKey` names the query), but each window is anchored
 * by a cursor instead of an offset, so rows created or removed while paging can never shift
 * the window frame. Consume through `useCursorWindows`.
 */
export interface CursorLoader<T> extends KeyedDataLoader {
  reactQueryKeys: ReactQueryKeys;
  /** Load one window: the first when `cursor` is null, otherwise the rows past the cursor. */
  loadWindow(cursor: CursorValue | null, windowSize: number): Promise<CursorWindow<T>>;
}
