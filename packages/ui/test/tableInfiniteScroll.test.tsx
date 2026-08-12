/**
 * @jest-environment jsdom
 *
 * The record-table pager (the n3xa5 Migrations stall, plans/OPS_TOOLING.md rev-28 addendum 2):
 * a >10-row table rendered exactly one page with a PERPETUAL "Loading..." — the old
 * react-infinite-scroll-component integration rendered its loader whenever `hasMore` was true
 * (single-element children defeat its has-children check) while its scroll listener was bound
 * to `window`, which the app's layout never scrolls. Deploy-relevant: a stalled pager makes
 * rows beyond page one (the roles-backfill migration) unreachable.
 *
 * Contract under test, at the cause layer:
 *  1. THE REPRO SHAPE: one page loaded, more rows exist, nothing fetching → NO "Loading..."
 *     (red at the pre-fix pager: the loader rendered unconditionally under hasMore).
 *  2. The loader is HONEST: it renders exactly while a page fetch is in flight.
 *  3. The sentinel drives paging: intersection loads the next page; pages keep appending on
 *     each intersection until the data ends; then sentinel and loader are both gone.
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

// ── IntersectionObserver stub (jsdom has none): records observers so tests can fire the
// sentinel's intersection the way a real scroll-into-view / under-filled container would. ──────
type IOCallback = (entries: Array<{ isIntersecting: boolean }>) => void;
const ioInstances: Array<{ callback: IOCallback; targets: Element[] }> = [];
class FakeIntersectionObserver {
  private entry: { callback: IOCallback; targets: Element[] };
  constructor(callback: IOCallback) {
    this.entry = { callback, targets: [] };
    ioInstances.push(this.entry);
  }
  observe(target: Element) {
    this.entry.targets.push(target);
  }
  unobserve(target: Element) {
    this.entry.targets = this.entry.targets.filter((t) => t !== target);
  }
  disconnect() {
    this.entry.targets = [];
  }
}
(globalThis as any).IntersectionObserver = FakeIntersectionObserver;

/** Fire the LIVE observer (the latest one with an observed target) — a sentinel intersection. */
const fireSentinel = async () => {
  await act(async () => {
    const live = [...ioInstances].reverse().find((entry) => entry.targets.length > 0);
    live?.callback([{ isIntersecting: true }]);
  });
};

type Row = { description: string; status: string };
const ROW_COUNT = 23; // the brent-dev-2 migration-table shape: >2 pages at 10/page
const allRows: Row[] = Array.from({ length: ROW_COUNT }, (_, i) => ({
  description: `Migration ${i + 1}`,
  status: 'success',
}));

/** A controllable loader: resolves each page only when the test releases it, so the in-flight
 *  state is observable (the honest-loader contract). */
class ScriptedLoader implements TableLoader<Row> {
  reactQueryKeys = { dataKey: `pager-test-${Date.now()}-${Math.random()}`, dataQueryKey: 'all' };
  pending: Array<() => void> = [];
  holdPages = false;
  async load(startIndex: number, endIndex: number): Promise<RowWindow<Row>> {
    if (this.holdPages) {
      await new Promise<void>((resolve) => this.pending.push(resolve));
    }
    return { rows: allRows.slice(startIndex, endIndex), totalCount: allRows.length };
  }
  releasePage() {
    const release = this.pending.shift();
    release?.();
  }
}

describe('Table infinite scroll — the pager pages and the loader tells the truth', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    ioInstances.length = 0;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  const mount = async (loader: ScriptedLoader) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, cacheTime: 0 } } });
    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <MemoryRouter>
            <Table<Row> title='Migrations' columns={['description', 'status']} tableLoader={loader} />
          </MemoryRouter>
        </QueryClientProvider>
      );
    });
    // Let the initial page settle (react-query resolves outside the render commit).
    await act(async () => {
      await Promise.resolve();
    });
  };

  const rowCount = () => container.querySelectorAll('tbody tr').length;
  const loaderShown = () => /Loading\.\.\./.test(container.textContent ?? '');
  const sentinel = () => container.querySelector('[data-infinite-scroll-sentinel]');

  it('THE n3xa5 REPRO SHAPE: one page rendered, more rows exist, nothing fetching — no perpetual "Loading..."', async () => {
    const loader = new ScriptedLoader();
    await mount(loader);

    // Page 1 rendered, 13 more rows exist server-side (hasMore: the sentinel is armed).
    expect(rowCount()).toBe(10);
    expect(sentinel()).toBeTruthy();
    // The stall's face: the old pager showed "Loading..." here forever while fetching nothing.
    expect(loaderShown()).toBe(false);
  });

  it('the loader renders exactly while a page fetch is in flight', async () => {
    const loader = new ScriptedLoader();
    await mount(loader);
    expect(rowCount()).toBe(10);

    loader.holdPages = true;
    await fireSentinel();
    // In flight: the promise of progress is now TRUE.
    expect(loaderShown()).toBe(true);
    expect(rowCount()).toBe(10);

    await act(async () => {
      loader.releasePage();
    });
    // Landed: 20 rows, still more to come, nothing fetching — loader honest again.
    expect(rowCount()).toBe(20);
    expect(loaderShown()).toBe(false);
    expect(sentinel()).toBeTruthy();
  });

  it('intersections page to the end — every row reachable, then sentinel and loader retire', async () => {
    const loader = new ScriptedLoader();
    await mount(loader);

    await fireSentinel();
    expect(rowCount()).toBe(20);
    await fireSentinel();
    expect(rowCount()).toBe(ROW_COUNT);
    // The deploy-relevant outcome: the last page's rows are reachable.
    expect(container.textContent).toContain(`Migration ${ROW_COUNT}`);
    // Data ended: no more sentinel, no loader — an honest, quiet bottom.
    expect(sentinel()).toBeFalsy();
    expect(loaderShown()).toBe(false);
  });
});
