/**
 * @jest-environment jsdom
 *
 * The /record/table silent-400 spinner: as a non-admin, DbService/query 400s
 * ("User is not authorized to query table: migration") and the page spun FOREVER instead of
 * rendering the honest error state that resolveTableBodyState already provides.
 *
 * Mechanism (live-verified via jsdom probes): RecordTable constructs a fresh QueryTableLoader
 * on every render, and Table's reset effect was keyed on loader OBJECT identity — so every
 * parent re-render (app shell re-renders constantly) forced resetQuery() → refetch, and
 * react-query v3 flips a refetching errored query back to `loading`. Each shell re-render
 * bought another full spinner-plus-retry-storm window; the error state never survived.
 *
 * Contract under test:
 *  1. A failed load renders the honest error state (server message shown), spinner gone.
 *  2. THE REPRO SHAPE: the error state SURVIVES a parent re-render handing an equivalent
 *     loader (new instance, same react-query keys) — no refetch, no spinner return
 *     (red at the identity-keyed effect: the re-render refired the query and the spinner
 *     replaced the error).
 *  3. A loader whose KEYS change is a genuine data change and still resets + refetches.
 */
import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from 'react-query';
import { Table } from '../src/table/Table';
import type { TableLoader, RowWindow } from '../src/table/TableLoader';

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// IntersectionObserver stub (jsdom has none); the pager's sentinel is not under test here.
class FakeIntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as any).IntersectionObserver = FakeIntersectionObserver;

type Row = { description: string; status: string };

const DENIAL = 'User is not authorized to query table: migration';

describe('Table load-error stability — a denied query renders its error and keeps it', () => {
  let container: HTMLDivElement;
  let root: Root;
  let client: QueryClient;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    client = new QueryClient({ defaultOptions: { queries: { retry: false, cacheTime: 0 } } });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    client.clear();
  });

  const renderTable = async (loader: TableLoader<Row>) => {
    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <MemoryRouter>
            <Table<Row> title='Migrations' columns={['description', 'status']} tableLoader={loader} />
          </MemoryRouter>
        </QueryClientProvider>
      );
    });
  };

  const settle = async () => {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
  };

  const domState = () => ({
    spinner: container.querySelector('.MuiCircularProgress-root') != null,
    errorShown: (container.textContent || '').includes("Couldn't load rows."),
    denialShown: (container.textContent || '').includes(DENIAL),
  });

  it('renders the honest error state on a denied query: server message shown, spinner gone', async () => {
    let attempts = 0;
    const loader: TableLoader<Row> = {
      reactQueryKeys: { dataKey: `denied-${Date.now()}`, dataQueryKey: 'all' },
      load: async () => {
        attempts++;
        throw new Error(DENIAL);
      },
    };

    await renderTable(loader);
    await settle();

    expect(domState()).toEqual({ spinner: false, errorShown: true, denialShown: true });
    expect(attempts).toBe(1);
  });

  it('keeps the error state across parent re-renders handing an equivalent loader — no refetch, no spinner', async () => {
    const dataKey = `denied-rerender-${Date.now()}`;
    let attempts = 0;
    // RecordTable's shape: a NEW loader instance every parent render, same query keys.
    const makeLoader = (): TableLoader<Row> => ({
      reactQueryKeys: { dataKey, dataQueryKey: 'all' },
      load: async () => {
        attempts++;
        throw new Error(DENIAL);
      },
    });

    await renderTable(makeLoader());
    await settle();
    expect(domState()).toEqual({ spinner: false, errorShown: true, denialShown: true });
    expect(attempts).toBe(1);

    // Two parent re-renders (the app shell re-renders constantly). The error state must hold:
    // no new query attempts, no spinner — immediately after the re-render commit and at rest.
    await renderTable(makeLoader());
    expect(domState()).toEqual({ spinner: false, errorShown: true, denialShown: true });
    await settle();
    await renderTable(makeLoader());
    expect(domState()).toEqual({ spinner: false, errorShown: true, denialShown: true });
    await settle();

    expect(domState()).toEqual({ spinner: false, errorShown: true, denialShown: true });
    expect(attempts).toBe(1);
  });

  it('still resets and refetches when the loader keys genuinely change', async () => {
    const attemptsByKey: { [key: string]: number } = {};
    const makeLoader = (dataQueryKey: string, rows: Row[]): TableLoader<Row> => ({
      reactQueryKeys: { dataKey: `keyed-${Date.now()}`, dataQueryKey },
      load: async (): Promise<RowWindow<Row>> => {
        attemptsByKey[dataQueryKey] = (attemptsByKey[dataQueryKey] || 0) + 1;
        return { rows, totalCount: rows.length };
      },
    });

    await renderTable(makeLoader('query-a', [{ description: 'Migration A', status: 'success' }]));
    await settle();
    expect(container.textContent).toContain('Migration A');

    await renderTable(makeLoader('query-b', [{ description: 'Migration B', status: 'success' }]));
    await settle();
    expect(container.textContent).toContain('Migration B');
    expect(attemptsByKey['query-b']).toBeGreaterThanOrEqual(1);
  });
});
