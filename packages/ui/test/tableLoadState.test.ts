import { resolveTableBodyState, tableLoadErrorText } from '../src/table/tableLoadState';

/**
 * Guards the table's load-outcome contract.
 *
 * The bug: a failed load (authorization denied, server error, network) rendered as
 * "No rows to display." — indistinguishable from a genuinely empty table. The admin Sessions
 * table read as empty while every query behind it was being denied.
 *
 * The outcomes that matter: a failure renders as an ERROR, an empty success renders as EMPTY,
 * and rows that already loaded are never replaced by a refetch failure.
 */
describe('resolveTableBodyState', () => {
  it('renders a failed load as an error, never as an empty table', () => {
    expect(
      resolveTableBodyState({
        isLoading: false,
        hasRows: false,
        error: new Error('User is not authorized to query table: session'),
      })
    ).toBe('error');
  });

  it('renders an empty successful load as empty', () => {
    expect(resolveTableBodyState({ isLoading: false, hasRows: false, error: null })).toBe('empty');
  });

  it('renders rows when rows loaded', () => {
    expect(resolveTableBodyState({ isLoading: false, hasRows: true, error: null })).toBe('rows');
  });

  it('keeps showing loaded rows when a background refetch fails', () => {
    expect(resolveTableBodyState({ isLoading: false, hasRows: true, error: new Error('boom') })).toBe('rows');
  });

  it('shows the loading state while the first load is in flight', () => {
    expect(resolveTableBodyState({ isLoading: true, hasRows: false, error: null })).toBe('loading');
  });
});

describe('tableLoadErrorText', () => {
  it('shows the service error message verbatim (client-safe by ServiceRouter contract)', () => {
    expect(tableLoadErrorText(new Error('User is not authorized to query table: session'))).toBe(
      'User is not authorized to query table: session'
    );
  });

  it('falls back to a generic line for message-less failures', () => {
    expect(tableLoadErrorText(undefined)).toBe('Something went wrong loading rows.');
    expect(tableLoadErrorText(new Error(''))).toBe('Something went wrong loading rows.');
  });
});
