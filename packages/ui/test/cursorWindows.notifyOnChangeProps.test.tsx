/**
 * @jest-environment jsdom
 *
 * `useCursorWindows`'s `notifyOnChangeProps` (src/table/cursorWindows.ts): a second observer on a list's query
 * that reads only the rows and the error — the reach face beside the `List` that pages — limits its re-renders
 * to those, so the fetch-state flips of every window landing and refetch (two per landing on the pager's
 * query) no longer re-render it. Outcomes, as render counts of two probes on ONE query, its windows held in
 * flight:
 *  1. The next window's pull: the pager (no option) re-renders on the flip; the watcher (['rows', 'error'])
 *     does not — and when the window lands, both do, the watcher holding the new row.
 *  2. A refetch of the loaded windows: the same — the watcher sleeps through the flip, wakes on the rows.
 *  3. The error path the watcher exists for: a query that never resolved fails — the watcher hears the error;
 *     its retry begins — the watcher hears that too (the query re-reads with its error cleared), so a face
 *     listening on rows and error alone still stands down while a retry is in flight.
 */
import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { QueryClient, QueryClientProvider } from 'react-query';
import { CursorLoader, CursorValue, CursorWindow } from '../src/table/CursorLoader';
import { CursorWindowsNotifyProp, CursorWindowsResult, useCursorWindows } from '../src/table/cursorWindows';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

type Row = { id: string };

/** Windows held in flight until released; a rejection when told to fail. */
class HeldLoader implements CursorLoader<Row> {
  reactQueryKeys = { dataKey: `held-${Date.now()}-${Math.random()}`, dataQueryKey: 'all' };
  loads = 0;
  failNext = false;
  private releases: Array<() => void> = [];

  async loadWindow(cursor: CursorValue | null, _windowSize: number): Promise<CursorWindow<Row>> {
    this.loads += 1;
    await new Promise<void>((resolve) => this.releases.push(resolve));
    if (this.failNext) {
      this.failNext = false;
      throw new Error('the read died');
    }
    return cursor === null
      ? { rows: [{ id: 'a' }, { id: 'b' }], nextCursor: 'w2' }
      : { rows: [{ id: 'c' }], nextCursor: null };
  }

  release() {
    this.releases.shift()?.();
  }
}

const rowId = (row: Row) => row.id;
const renders: { [name: string]: number } = {};
const results: { [name: string]: CursorWindowsResult<Row> } = {};

const Probe = ({
  name,
  loader,
  notifyOnChangeProps,
}: {
  name: string;
  loader: CursorLoader<Row>;
  notifyOnChangeProps?: ReadonlyArray<CursorWindowsNotifyProp>;
}) => {
  renders[name] = (renders[name] ?? 0) + 1;
  results[name] = useCursorWindows(loader, 2, { rowId, ...(notifyOnChangeProps ? { notifyOnChangeProps } : {}) });
  return null;
};

const wait = async (ms = 0) => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
};

describe('useCursorWindows — notifyOnChangeProps limits a watcher to the results it reads', () => {
  let container: HTMLDivElement;
  let root: Root;
  let client: QueryClient;

  beforeEach(() => {
    Object.keys(renders).forEach((name) => delete renders[name]);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    client = new QueryClient({ defaultOptions: { queries: { retry: false, cacheTime: 0 } } });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const mount = async (loader: HeldLoader) => {
    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <Probe name='pager' loader={loader} />
          <Probe name='watcher' loader={loader} notifyOnChangeProps={['rows', 'error']} />
        </QueryClientProvider>
      );
    });
  };

  const rendersSince = (() => {
    let mark = { pager: 0, watcher: 0 };
    return () => {
      const now = { pager: renders.pager ?? 0, watcher: renders.watcher ?? 0 };
      const delta = { pager: now.pager - mark.pager, watcher: now.watcher - mark.watcher };
      mark = now;
      return delta;
    };
  })();

  it('the watcher sleeps through the fetch-state flips and wakes on the rows', async () => {
    const loader = new HeldLoader();
    await mount(loader);
    await act(async () => loader.release());
    await wait();
    expect(results.watcher.rows?.map(rowId)).toEqual(['a', 'b']);
    rendersSince();

    // 1. The next window's pull, held in flight: isFetching flips — the pager re-renders, the watcher not at all.
    await act(async () => results.pager.fetchNextWindow());
    await wait();
    expect(loader.loads).toBe(2);
    expect(rendersSince()).toEqual({ pager: expect.any(Number), watcher: 0 });
    expect(results.pager.isFetching).toBe(true);

    //    The window lands: both render; the watcher holds the new row.
    await act(async () => loader.release());
    await wait();
    const landed = rendersSince();
    expect(landed.watcher).toBeGreaterThan(0);
    expect(landed.pager).toBeGreaterThan(0);
    expect(results.watcher.rows?.map(rowId)).toEqual(['a', 'b', 'c']);

    // 2. A refetch of the loaded windows, held in flight: the same silence on the flip.
    await act(async () => {
      void client.invalidateQueries({ queryKey: [loader.reactQueryKeys.dataKey] });
    });
    await wait();
    expect(loader.loads).toBe(3);
    expect(rendersSince()).toEqual({ pager: expect.any(Number), watcher: 0 });
    await act(async () => loader.release());
    await wait();
    await act(async () => loader.release());
    await wait();
    expect(loader.loads).toBe(4);
    expect(results.watcher.rows?.map(rowId)).toEqual(['a', 'b', 'c']);
  });

  it('a query that never resolved: the watcher hears the error, and hears its retry begin', async () => {
    const loader = new HeldLoader();
    loader.failNext = true;
    await mount(loader);
    rendersSince();
    await act(async () => loader.release());
    await wait();
    expect(results.watcher.error?.message).toBe('the read died');
    expect(results.watcher.rows).toBeUndefined();
    expect(rendersSince().watcher).toBeGreaterThan(0);

    // The retry: the query re-reads with its error cleared — a change on 'error', so the watcher renders and
    // reads no error while the read is in flight (a face on rows + error stands down for the retry).
    await act(async () => {
      void client.refetchQueries({ queryKey: [loader.reactQueryKeys.dataKey] });
    });
    await wait();
    expect(loader.loads).toBe(2);
    expect(rendersSince().watcher).toBeGreaterThan(0);
    expect(results.watcher.error).toBeNull();
    expect(results.watcher.isFetching).toBe(true);

    await act(async () => loader.release());
    await wait();
    expect(results.watcher.rows?.map(rowId)).toEqual(['a', 'b']);
  });
});
