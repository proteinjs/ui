/**
 * Which body a table renders for a given load outcome. Extracted as pure logic (same pattern as
 * rowClickIntent) so the contract is testable without a DOM.
 *
 * The load-bearing rule: a FAILED load renders as an error, never as an empty table. Before this,
 * any loader failure (authorization denied, server error, network) fell into the "No rows to
 * display." branch — an admin-facing table over live data reading as empty is a lie that masks
 * real failures (the admin Sessions table read "no rows" while every query was being denied,
 * 2026-08).
 */
export type TableBodyState = 'loading' | 'rows' | 'error' | 'empty';

export const resolveTableBodyState = (args: {
  isLoading: boolean;
  hasRows: boolean;
  error: unknown;
}): TableBodyState => {
  if (args.isLoading) {
    return 'loading';
  }

  // Loaded rows win over a background refetch failure: stale-but-real data beats an error screen.
  if (args.hasRows) {
    return 'rows';
  }

  if (args.error) {
    return 'error';
  }

  return 'empty';
};

/**
 * The detail line shown under the error headline. Service errors cross the wire with client-safe
 * messages (ServiceRouter contract), so the message is shown verbatim.
 */
export const tableLoadErrorText = (error: unknown): string => {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return 'Something went wrong loading rows.';
};
