/**
 * @jest-environment jsdom
 *
 * The List primitive (src/list/List.tsx): behavior in the shell, presentation in the consumer.
 * Load-bearing contracts, asserted as rendered OUTCOMES through the real hook under a real
 * QueryClientProvider:
 *  1. Sentinel-driven windowing: the first window renders alone; ONLY a sentinel intersection
 *     pulls the next window; exhaustion retires the sentinel.
 *  2. Group boundary management: consecutive same-key rows share one group, key changes cut a
 *     boundary, headers receive (key, rows, groupIndex) — including non-adjacent key recurrence.
 *  3. Slot switching: skeleton before the first window ever resolves, emptyState on an empty
 *     resolve, errorState when nothing ever loaded, and rows WIN over a later refetch failure.
 *  4. Cross-window de-duplication by rowId (boundary rows shared across windows render once).
 */
import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { QueryClient, QueryClientProvider } from 'react-query';
import { CursorLoader, CursorValue, CursorWindow } from '../src/table/CursorLoader';
import { List } from '../src/list/List';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// ── IntersectionObserver stub (jsdom has none): records observers so tests can fire the
// sentinel's intersection the way a real scroll-into-view would. Mirrors the real API's initial
// report — observe() delivers the current (non-)intersection — because the sentinel gating
// exists exactly to ignore those non-intersecting reports. ────────────────────────────────────
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
    // The initial report: the sentinel sits below the fold (not intersecting).
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

type Row = { id: string; at: number };
const row = (at: number): Row => ({ id: `row-${at}`, at });
const rowId = (r: Row) => r.id;

/** In-memory CursorLoader mirroring QueryCursorLoader's window semantics: desc sort on `at`,
 *  `at < cursor` windows, nextCursor = the full window's tail (short window = exhausted). */
class FakeCorpusLoader implements CursorLoader<Row> {
  loads: (CursorValue | null)[] = [];
  holdFirstLoad = false;
  failLoads = false;
  private pendingReleases: Array<() => void> = [];

  constructor(
    public reactQueryKeys: { dataKey: string; dataQueryKey: string },
    private corpus: () => Row[]
  ) {}

  async loadWindow(cursor: CursorValue | null, windowSize: number): Promise<CursorWindow<Row>> {
    this.loads.push(cursor);
    if (this.failLoads) {
      throw new Error('window load failed');
    }
    if (this.holdFirstLoad) {
      this.holdFirstLoad = false;
      await new Promise<void>((resolve) => this.pendingReleases.push(resolve));
    }
    const sorted = [...this.corpus()].sort((a, b) => b.at - a.at);
    const rows = (cursor === null ? sorted : sorted.filter((r) => r.at < (cursor as number))).slice(0, windowSize);
    const nextCursor = rows.length < windowSize ? null : rows[rows.length - 1].at;
    return { rows, nextCursor };
  }

  release() {
    const release = this.pendingReleases.shift();
    release?.();
  }
}

/** A loader whose windows the test scripts directly (dedupe/boundary shapes). */
class ScriptedWindowsLoader implements CursorLoader<Row> {
  constructor(
    public reactQueryKeys: { dataKey: string; dataQueryKey: string },
    private windows: CursorWindow<Row>[]
  ) {}

  async loadWindow(cursor: CursorValue | null): Promise<CursorWindow<Row>> {
    return cursor === null ? this.windows[0] : this.windows[this.windows.findIndex((w) => w.nextCursor === cursor) + 1];
  }
}

let keySequence = 0;
const keys = () => ({ dataKey: `list-test-${Date.now()}-${keySequence++}`, dataQueryKey: 'list' });

describe('List — sentinel windowing, groups, slots, dedupe', () => {
  let container: HTMLDivElement;
  let root: Root;
  let queryClient: QueryClient;

  const flush = async () => {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  };

  // Deadline safely under jest's 5s test timeout: waitFor must throw INSIDE the test (act
  // unwinds, afterEach cleans up) — a jest-killed test aborts mid-act and poisons the next.
  const waitFor = async (predicate: () => boolean) => {
    const deadline = Date.now() + 3000;
    while (!predicate()) {
      if (Date.now() > deadline) {
        throw new Error('waitFor timed out');
      }
      await flush();
    }
  };

  const render = (element: React.ReactElement) => {
    act(() => {
      root.render(<QueryClientProvider client={queryClient}>{element}</QueryClientProvider>);
    });
  };

  /** Fire the LIVE observer (the latest one with an observed target) — a sentinel intersection. */
  const fireSentinel = async () => {
    await act(async () => {
      const live = [...ioInstances].reverse().find((entry) => entry.targets.length > 0);
      live?.callback([{ isIntersecting: true }]);
    });
  };

  const renderedRowAts = () =>
    Array.from(container.querySelectorAll('[data-test-row]')).map((el) => Number(el.getAttribute('data-test-row')));
  const sentinel = () => container.querySelector('[data-list-sentinel]');

  const testRow = (r: Row) => <div data-test-row={r.at}>{r.id}</div>;

  beforeEach(() => {
    ioInstances.length = 0;
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

  it('renders the first window, pulls the next ONLY on sentinel intersection, and retires the sentinel at exhaustion', async () => {
    const corpus = [row(70), row(60), row(50), row(40), row(30)];
    const loader = new FakeCorpusLoader(keys(), () => corpus);

    render(<List<Row> loader={loader} windowSize={3} rowId={rowId} renderRow={testRow} />);
    await waitFor(() => renderedRowAts().length === 3);
    expect(renderedRowAts()).toEqual([70, 60, 50]);
    expect(sentinel()).toBeTruthy();

    // Sentinel gating: settled with more rows available, NO intersection fired — no fetch. The
    // one load is the first window's.
    await flush();
    expect(loader.loads).toEqual([null]);
    expect(renderedRowAts()).toEqual([70, 60, 50]);

    await fireSentinel();
    await waitFor(() => renderedRowAts().length === 5);
    expect(renderedRowAts()).toEqual([70, 60, 50, 40, 30]);
    expect(loader.loads).toEqual([null, 50]);
    // Short window settles exhaustion: an honest, quiet bottom.
    expect(sentinel()).toBeFalsy();
  });

  it('cuts group boundaries on key changes, merges consecutive equal keys, and threads (key, rows, groupIndex)', async () => {
    const corpus = [row(70), row(60), row(50), row(40)];
    const loader = new FakeCorpusLoader(keys(), () => corpus);
    const headerCalls: Array<{ key: string; ats: number[]; groupIndex: number }> = [];
    // 70,60 → 'recent'; 50 → 'older'; 40 → 'recent' again (non-adjacent recurrence must be its
    // own group with its own React identity, not merged and not a duplicate-key collision).
    const groupKey = (r: Row) => (r.at >= 60 || r.at === 40 ? 'recent' : 'older');

    render(
      <List<Row>
        loader={loader}
        windowSize={10}
        rowId={rowId}
        renderRow={testRow}
        groupKey={groupKey}
        renderGroupHeader={(key, rows, groupIndex) => {
          headerCalls.push({ key, ats: rows.map((r) => r.at), groupIndex });
          return <div data-test-header={`${groupIndex}:${key}`}>{key}</div>;
        }}
      />
    );
    await waitFor(() => renderedRowAts().length === 4);

    const headers = Array.from(container.querySelectorAll('[data-test-header]')).map((el) =>
      el.getAttribute('data-test-header')
    );
    expect(headers).toEqual(['0:recent', '1:older', '2:recent']);
    // Rows stay in list order under their boundaries.
    expect(renderedRowAts()).toEqual([70, 60, 50, 40]);
    // The final render pass threads the group contents and indices.
    const lastPass = headerCalls.slice(-3);
    expect(lastPass.map((call) => ({ key: call.key, ats: call.ats, groupIndex: call.groupIndex }))).toEqual([
      { key: 'recent', ats: [70, 60], groupIndex: 0 },
      { key: 'older', ats: [50], groupIndex: 1 },
      { key: 'recent', ats: [40], groupIndex: 2 },
    ]);
  });

  it('switches slots: skeleton before first resolve, emptyState on empty, and rows WIN over refetch failure', async () => {
    const corpus: Row[] = [];
    const loader = new FakeCorpusLoader(keys(), () => corpus);
    loader.holdFirstLoad = true;

    render(
      <List<Row>
        loader={loader}
        windowSize={3}
        rowId={rowId}
        renderRow={testRow}
        skeleton={<div data-test-skeleton />}
        emptyState={<div data-test-empty />}
        errorState={<div data-test-error />}
      />
    );
    await flush();
    // First window in flight: the skeleton, nothing else.
    expect(container.querySelector('[data-test-skeleton]')).toBeTruthy();
    expect(container.querySelector('[data-test-empty]')).toBeFalsy();

    await act(async () => {
      loader.release();
    });
    await waitFor(() => container.querySelector('[data-test-empty]') !== null);
    expect(container.querySelector('[data-test-skeleton]')).toBeFalsy();
    expect(sentinel()).toBeFalsy();

    // Rows land, then a refetch fails: real rows persist — never an error screen over data.
    corpus.push(row(70));
    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: [loader.reactQueryKeys.dataKey] });
    });
    await waitFor(() => renderedRowAts().length === 1);
    loader.failLoads = true;
    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: [loader.reactQueryKeys.dataKey] }).catch(() => undefined);
    });
    await flush();
    expect(renderedRowAts()).toEqual([70]);
    expect(container.querySelector('[data-test-error]')).toBeFalsy();
  });

  it('renders errorState when nothing ever loaded, and renders NOTHING for an empty list by default', async () => {
    const failing = new FakeCorpusLoader(keys(), () => []);
    failing.failLoads = true;
    render(
      <List<Row>
        loader={failing}
        windowSize={3}
        rowId={rowId}
        renderRow={testRow}
        errorState={<div data-test-error />}
      />
    );
    await waitFor(() => container.querySelector('[data-test-error]') !== null);
    expect(renderedRowAts()).toEqual([]);

    // Default emptyState: an empty list disappears (no shell chrome left behind).
    const empty = new FakeCorpusLoader(keys(), () => []);
    render(<List<Row> loader={empty} windowSize={3} rowId={rowId} renderRow={testRow} />);
    await waitFor(() => empty.loads.length === 1 && container.innerHTML === '');
  });

  it('de-duplicates boundary rows shared across windows by rowId — first copy wins, each row renders once', async () => {
    // Window 1 ends at row-50; window 2 re-serves row-50 at its head (the cursor-boundary shape).
    const loader = new ScriptedWindowsLoader(keys(), [
      { rows: [row(70), row(60), row(50)], nextCursor: 50 },
      { rows: [row(50), row(40)], nextCursor: null },
    ]);

    render(<List<Row> loader={loader} windowSize={3} rowId={rowId} renderRow={testRow} />);
    await waitFor(() => renderedRowAts().length === 3);
    await fireSentinel();
    await waitFor(() => renderedRowAts().length === 4);
    expect(renderedRowAts()).toEqual([70, 60, 50, 40]);
  });
});
