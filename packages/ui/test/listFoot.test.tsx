/**
 * @jest-environment jsdom
 *
 * The List foot slot (src/list/List.tsx `renderFoot`) and the signal it rides on
 * (src/table/cursorWindows.ts `isFetchingNextWindow`): a list that pages at the bottom tells its
 * foot exactly when the NEXT window is on its way, so the consumer's loading row is the state's
 * honest face — never a flash under the first window, never a blip during a background refetch.
 * Asserted as rendered OUTCOMES through the real hook under a real QueryClientProvider:
 *  1. No foot before the first window ever resolves (the skeleton owns that state).
 *  2. Settled with more windows: the foot is told { hasMore: true, fetchingNextWindow: false }.
 *  3. The sentinel's pull, held in flight: { hasMore: true, fetchingNextWindow: true } — and the
 *     foot sits AFTER the last row and AHEAD of the sentinel in the DOM.
 *  4. The short last window: { hasMore: false, fetchingNextWindow: false } — the honest bottom.
 *  5. A dataKey invalidation refetches every loaded window (isFetching is true) and the foot is
 *     NEVER told fetchingNextWindow — the discriminating case for the signal.
 */
import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { QueryClient, QueryClientProvider } from 'react-query';
import { CursorLoader, CursorValue, CursorWindow } from '../src/table/CursorLoader';
import { List, ListFootState } from '../src/list/List';

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

type Row = { id: string; at: number };
const row = (at: number): Row => ({ id: `row-${at}`, at });
const rowId = (r: Row) => r.id;

/** In-memory CursorLoader (desc on `at`, `at < cursor` windows) whose loads can be HELD in flight. */
class HoldableCorpusLoader implements CursorLoader<Row> {
  loads: (CursorValue | null)[] = [];
  /** While true every load waits for `release()` — the fetch-in-flight state under test. */
  hold = false;
  private pendingReleases: Array<() => void> = [];

  constructor(
    public reactQueryKeys: { dataKey: string; dataQueryKey: string },
    private corpus: () => Row[]
  ) {}

  async loadWindow(cursor: CursorValue | null, windowSize: number): Promise<CursorWindow<Row>> {
    this.loads.push(cursor);
    if (this.hold) {
      await new Promise<void>((resolve) => this.pendingReleases.push(resolve));
    }
    const sorted = [...this.corpus()].sort((a, b) => b.at - a.at);
    const rows = (cursor === null ? sorted : sorted.filter((r) => r.at < (cursor as number))).slice(0, windowSize);
    const nextCursor = rows.length < windowSize ? null : rows[rows.length - 1].at;
    return { rows, nextCursor };
  }

  releaseAll() {
    const releases = this.pendingReleases.splice(0);
    releases.forEach((release) => release());
  }
}

let keySequence = 0;
const keys = () => ({ dataKey: `list-foot-test-${Date.now()}-${keySequence++}`, dataQueryKey: 'list' });

describe('List foot — told exactly when the next window is on its way', () => {
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

  const render = (element: React.ReactElement) => {
    act(() => {
      root.render(<QueryClientProvider client={queryClient}>{element}</QueryClientProvider>);
    });
  };

  const fireSentinel = async () => {
    await act(async () => {
      const live = [...ioInstances].reverse().find((entry) => entry.targets.length > 0);
      live?.callback([{ isIntersecting: true }]);
    });
  };

  const renderedRowAts = () =>
    Array.from(container.querySelectorAll('[data-test-row]')).map((el) => Number(el.getAttribute('data-test-row')));
  const foot = () => container.querySelector('[data-test-foot]');
  const footState = (): ListFootState | null => {
    const el = foot();
    return el
      ? {
          hasMore: el.getAttribute('data-has-more') === 'true',
          fetchingNextWindow: el.getAttribute('data-fetching') === 'true',
        }
      : null;
  };
  const testRow = (r: Row) => <div data-test-row={r.at}>{r.id}</div>;
  const testFoot = (state: ListFootState) => (
    <div data-test-foot data-has-more={String(state.hasMore)} data-fetching={String(state.fetchingNextWindow)} />
  );

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

  it('is told fetchingNextWindow only while the sentinel’s pull is in flight, after the rows and ahead of the sentinel, and hasMore false at the bottom', async () => {
    const corpus = [row(70), row(60), row(50), row(40), row(30)];
    const loader = new HoldableCorpusLoader(keys(), () => corpus);
    loader.hold = true;

    render(
      <List<Row>
        loader={loader}
        windowSize={3}
        rowId={rowId}
        renderRow={testRow}
        skeleton={<div data-test-skeleton />}
        renderFoot={testFoot}
        scrollTopButton
      />
    );
    await flush();
    // 1. The first window in flight: the skeleton, and NO foot — the first load is not "more".
    expect(container.querySelector('[data-test-skeleton]')).toBeTruthy();
    expect(foot()).toBeNull();

    await act(async () => {
      loader.releaseAll();
    });
    await waitFor(() => renderedRowAts().length === 3);
    // 2. Settled with windows remaining: the foot stands, idle.
    expect(footState()).toEqual({ hasMore: true, fetchingNextWindow: false });

    // 3. The sentinel pulls the next window and it is held in flight.
    await fireSentinel();
    await waitFor(() => loader.loads.length === 2);
    await flush();
    expect(footState()).toEqual({ hasMore: true, fetchingNextWindow: true });
    // The DOM order: every row, then the foot, then the sentinel.
    const lastRow = container.querySelector('[data-test-row="50"]')!;
    const sentinel = container.querySelector('[data-list-sentinel]')!;
    expect(lastRow.compareDocumentPosition(foot()!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(foot()!.compareDocumentPosition(sentinel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // THE BACK-TO-TOP STRIP SITS AHEAD OF THE FOOT (the live finding on the phone, 2026-10-16): the
    // strip is sticky inside the scroller and RESTS at its flow position once the reader is at the
    // tail, with the button floating 36px up from it — a foot placed after the strip's resting place
    // had the button sitting exactly over the spinner. Ahead of the foot, the button keeps its old
    // resting band over the last row and the foot shows clear below it.
    const strip = container.querySelector('button[aria-label="Back to top"]')!.parentElement!;
    expect(strip.compareDocumentPosition(foot()!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    // 4. The short last window lands: the rows, the honest bottom, the sentinel retired.
    await act(async () => {
      loader.releaseAll();
    });
    await waitFor(() => renderedRowAts().length === 5);
    expect(footState()).toEqual({ hasMore: false, fetchingNextWindow: false });
    expect(container.querySelector('[data-list-sentinel]')).toBeNull();
  });

  it('is NEVER told fetchingNextWindow during a background refetch of the loaded windows', async () => {
    const corpus = [row(70), row(60), row(50), row(40), row(30), row(20), row(10)];
    const loader = new HoldableCorpusLoader(keys(), () => corpus);
    const footStates: ListFootState[] = [];
    const recordingFoot = (state: ListFootState) => {
      footStates.push(state);
      return testFoot(state);
    };

    render(<List<Row> loader={loader} windowSize={3} rowId={rowId} renderRow={testRow} renderFoot={recordingFoot} />);
    await waitFor(() => renderedRowAts().length === 3);
    await fireSentinel();
    await waitFor(() => renderedRowAts().length === 6);
    expect(loader.loads).toEqual([null, 50]);
    footStates.length = 0;

    // The invalidation refetches BOTH loaded windows (two more loads, cursors re-derived), held in
    // flight so the refetch is observable: the foot stays idle the whole way.
    loader.hold = true;
    await act(async () => {
      void queryClient.invalidateQueries({ queryKey: [loader.reactQueryKeys.dataKey] });
    });
    await waitFor(() => loader.loads.length === 3);
    await flush();
    expect(footStates.some((state) => state.fetchingNextWindow)).toBe(false);
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
    expect(footStates.some((state) => state.fetchingNextWindow)).toBe(false);
    expect(footState()).toEqual({ hasMore: true, fetchingNextWindow: false });
  });
});
