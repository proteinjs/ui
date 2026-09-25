import { InvalidateQueryFilters, QueryClient, QueryKey } from 'react-query';

/**
 * THE SETTLE — the last step of a write over cached reads: invalidate the queries (a key, which
 * prefix-matches, or filters) and READ FRESH. A read still in flight when the write answers was
 * issued before the write answered, so it carries the rows as they stood before the act. react-query
 * v3 serves a refetch asked for while a fetch runs by folding it into that running fetch
 * (`cancelRefetch` off, the v3 default — v4 turned it on for exactly this), so a plain
 * `invalidateQueries` ADOPTS such a read: it lands over the act's rows and over any optimistic row
 * the caller wrote, and no fresh read follows until the next focus, mount or reload. Such a read
 * comes from a focus return during the round trip, a second observer mounting, a pager's next page
 * or a live-update tick. The settle invalidates with `cancelRefetch`: the running read is dropped
 * silently (the rows on screen stay until the fresh read lands) and the queries are read after the
 * write answered. Call it once the write has answered — a settle issued mid round trip is itself
 * such a read — and write an optimistic row the react-query way (cancel the reads in flight, then
 * patch): v3 stops tracking a read that was running under a patch, so no settle can drop it. A first
 * load still in flight (no data yet) is joined, not dropped; v3 cancels only a refetch.
 */
export function settleQueries(queryClient: QueryClient, queries: QueryKey | InvalidateQueryFilters): Promise<void> {
  const filters: InvalidateQueryFilters =
    typeof queries === 'string' || Array.isArray(queries) ? { queryKey: queries } : (queries as InvalidateQueryFilters);
  return queryClient.invalidateQueries(filters, { cancelRefetch: true });
}
