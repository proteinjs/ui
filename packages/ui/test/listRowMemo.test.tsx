/**
 * @jest-environment jsdom
 *
 * The List primitive's rows are memoized (src/list/List.tsx `ListRow`): a render of the shell
 * re-renders only the rows whose inputs changed, so a long list stays cheap as it grows. The
 * contracts, asserted as render COUNTS through the real hook under a real QueryClientProvider,
 * with a stable `renderRow` (the consumer's half of the bargain):
 *  1. A next window landing renders the NEW rows once each and the loaded rows NOT AT ALL.
 *  2. A fetch-state flip that changes no row (a refetch held in flight: the shell re-renders on
 *     `isFetching`) renders no row.
 *  3. A parent's render (the shell re-rendered with equal props) renders no row.
 *  4. Fresh row objects landing from a refetch DO render — the memo keys on the row's identity,
 *     never on a stale snapshot.
 */
import React, { useState } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { QueryClient, QueryClientProvider } from 'react-query';
import { CursorLoader, CursorValue, CursorWindow } from '../src/table/CursorLoader';
import { List } from '../src/list/List';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

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
    this.entry.callback([{ isIntersecting: false }]);
  }
  unobserve(target: Element) {
    this.entry.targets = this.entry.targets.filter((t) => t !== target);
  }
  disconnect() {
    this.entry.targets = [];
  }
}
(globalThis as any).IntersectionObserver = FakeIntersectionObserver;

type Row = { id: string; at: number; rev: number };
const rowId = (r: Row) => r.id;

/**
 * In-memory CursorLoader (desc on `at`, `at < cursor` windows) whose loads can be HELD in flight
 * and which hands back a FRESH object per row on every load, stamped with the corpus `rev` — the
 * shape a server read has (react-query's structural sharing keeps a row's reference when its data
 * is deep-equal, so only a row whose data CHANGED arrives as a new object).
 */
class HoldableFreshRowsLoader implements CursorLoader<Row> {
  loads: (CursorValue | null)[] = [];
  hold = false;
  /** The corpus revision every loaded row carries — bump it and the next load's rows are new data. */
  rev = 1;
  private pendingReleases: Array<() => void> = [];

  constructor(
    public reactQueryKeys: { dataKey: string; dataQueryKey: string },
    private ats: number[]
  ) {}

  async loadWindow(cursor: CursorValue | null, windowSize: number): Promise<CursorWindow<Row>> {
    this.loads.push(cursor);
    if (this.hold) {
      await new Promise<void>((resolve) => this.pendingReleases.push(resolve));
    }
    const sorted = [...this.ats].sort((a, b) => b - a);
    const ats = (cursor === null ? sorted : sorted.filter((at) => at < (cursor as number))).slice(0, windowSize);
    const rows = ats.map((at) => ({ id: `row-${at}`, at, rev: this.rev }));
    const nextCursor = rows.length < windowSize ? null : rows[rows.length - 1].at;
    return { rows, nextCursor };
  }

  releaseAll() {
    const releases = this.pendingReleases.splice(0);
    releases.forEach((release) => release());
  }
}

let keySequence = 0;
const keys = () => ({ dataKey: `list-row-memo-test-${Date.now()}-${keySequence++}`, dataQueryKey: 'list' });

/** Render counts per row id — bumped by the ONE module-level `renderRow` (a stable reference). */
const renders: { [id: string]: number } = {};
const countingRow = (r: Row) => {
  renders[r.id] = (renders[r.id] ?? 0) + 1;
  return <div data-test-row={r.at}>{r.id}</div>;
};
const resetRenders = () => {
  Object.keys(renders).forEach((id) => delete renders[id]);
};
const renderedCounts = () => ({ ...renders });

let rerenderParent: () => void = () => undefined;
/** A parent whose state changes re-render the shell with EQUAL props — the consumer re-render case. */
const Parent = ({ loader }: { loader: CursorLoader<Row> }) => {
  const [tick, setTick] = useState(0);
  rerenderParent = () => setTick((t) => t + 1);
  return (
    <div data-test-tick={tick}>
      <List<Row> loader={loader} windowSize={3} rowId={rowId} renderRow={countingRow} />
    </div>
  );
};

describe('List rows — memoized: a render of the shell re-renders only the rows whose inputs changed', () => {
  let container: HTMLDivElement;
  let root: Root;
  let queryClient: QueryClient;

  const flush = async () => {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  };

  const waitFor = async (predicate: () => boolean) => {
    const deadline = Date.now() + 3000;
    while (!predicate()) {
      if (Date.now() > deadline) {
        throw new Error('waitFor timed out');
      }
      await flush();
    }
  };

  const fireSentinel = async () => {
    await act(async () => {
      const live = [...ioInstances].reverse().find((entry) => entry.targets.length > 0);
      live?.callback([{ isIntersecting: true }]);
    });
  };

  const renderedRowAts = () =>
    Array.from(container.querySelectorAll('[data-test-row]')).map((el) => Number(el.getAttribute('data-test-row')));

  beforeEach(() => {
    ioInstances.length = 0;
    resetRenders();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    queryClient.clear();
    container.remove();
  });

  it('renders only the new rows when the next window lands, no row on a fetch-state flip or a parent render, and every row on fresh data', async () => {
    const loader = new HoldableFreshRowsLoader(keys(), [70, 60, 50, 40, 30, 20, 10]);
    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <Parent loader={loader} />
        </QueryClientProvider>
      );
    });
    await waitFor(() => renderedRowAts().length === 3);
    expect(renderedCounts()).toEqual({ 'row-70': 1, 'row-60': 1, 'row-50': 1 });

    // 1. The next window lands: the three new rows render once each; the loaded three not at all.
    resetRenders();
    await fireSentinel();
    await waitFor(() => renderedRowAts().length === 6);
    expect(renderedRowAts()).toEqual([70, 60, 50, 40, 30, 20]);
    expect(renderedCounts()).toEqual({ 'row-40': 1, 'row-30': 1, 'row-20': 1 });

    // 2. A refetch held in flight: the shell re-renders on isFetching with the same rows — no row renders.
    //    (The corpus moves to rev 2 first, so the refetch, once released, lands CHANGED rows for case 4.)
    resetRenders();
    loader.rev = 2;
    loader.hold = true;
    await act(async () => {
      void queryClient.invalidateQueries({ queryKey: [loader.reactQueryKeys.dataKey] });
    });
    await waitFor(() => loader.loads.length === 3);
    await flush();
    expect(renderedRowAts()).toEqual([70, 60, 50, 40, 30, 20]);
    expect(renderedCounts()).toEqual({});

    // 3. A parent render with equal props: no row renders.
    await act(async () => {
      rerenderParent();
    });
    await flush();
    expect(container.querySelector('[data-test-tick="1"]')).not.toBeNull();
    expect(renderedCounts()).toEqual({});

    // 4. The refetch lands CHANGED rows (rev 2 — new objects past react-query's structural sharing): every
    //    loaded row renders exactly once — the memo keys on the row's identity, so new data is never shown stale.
    await act(async () => {
      loader.releaseAll();
    });
    await waitFor(() => loader.loads.length === 4);
    await act(async () => {
      loader.releaseAll();
    });
    await flush();
    expect(loader.loads).toEqual([null, 50, null, 50]);
    expect(renderedRowAts()).toEqual([70, 60, 50, 40, 30, 20]);
    expect(renderedCounts()).toEqual({
      'row-70': 1,
      'row-60': 1,
      'row-50': 1,
      'row-40': 1,
      'row-30': 1,
      'row-20': 1,
    });
  });
});
