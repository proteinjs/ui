/**
 * @jest-environment jsdom
 *
 * The cursor-window loading contract (src/table/cursorWindows.ts + src/table/CursorLoader.ts):
 * window accumulation with threaded cursors, exhaustion, stale-while-revalidate across query
 * identity changes, and — load-bearing for every consumer — that a `useTableMutation`-style
 * invalidation of `[dataKey]` refetches EVERY loaded window of EVERY query over the data set
 * with freshly re-derived cursors. Exercised through the real hooks rendered under a real
 * QueryClientProvider, so the react-query v3 semantics the hook depends on (refetch re-derives
 * page params; `undefined` — not `null` — stops the window chain) are what's tested.
 */
import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { QueryClient, QueryClientProvider } from 'react-query';
import { CursorLoader, CursorValue, CursorWindow } from '../src/table/CursorLoader';
import { CursorWindowsResult, flattenWindows, useCursorWindows } from '../src/table/cursorWindows';
import { useTableMutation } from '../src/table/tableData';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

type Row = { id: string; at: number };

const row = (at: number): Row => ({ id: `row-${at}`, at });

/**
 * In-memory CursorLoader mirroring QueryCursorLoader's window semantics: desc sort on `at`,
 * `at < cursor` windows, nextCursor = the full window's tail (short window = exhausted).
 */
class FakeCorpusLoader implements CursorLoader<Row> {
  loads: (CursorValue | null)[] = [];

  constructor(
    public reactQueryKeys: { dataKey: string; dataQueryKey: string },
    private corpus: () => Row[]
  ) {}

  async loadWindow(cursor: CursorValue | null, windowSize: number): Promise<CursorWindow<Row>> {
    this.loads.push(cursor);
    const sorted = [...this.corpus()].sort((a, b) => b.at - a.at);
    const rows = (cursor === null ? sorted : sorted.filter((r) => r.at < (cursor as number))).slice(0, windowSize);
    const nextCursor = rows.length < windowSize ? null : rows[rows.length - 1].at;
    return { rows, nextCursor };
  }
}

const rowId = (r: Row) => r.id;

/** Rendered-hook capture slots, keyed by probe name. */
const results: { [name: string]: CursorWindowsResult<Row> } = {};
let mutate: ((mutation: () => Promise<void>) => void) | undefined;

const WindowsProbe = ({
  name,
  loader,
  windowSize,
  withRowId = true,
}: {
  name: string;
  loader: CursorLoader<Row>;
  windowSize: number;
  withRowId?: boolean;
}) => {
  results[name] = useCursorWindows(loader, windowSize, withRowId ? { rowId } : {});
  return null;
};

const MutationProbe = ({ loader }: { loader: CursorLoader<Row> }) => {
  const mutation = useTableMutation<() => Promise<void>>(loader, (run) => run());
  mutate = mutation.mutate;
  return null;
};

describe('flattenWindows', () => {
  const window = (...ats: number[]): CursorWindow<Row> => ({ rows: ats.map(row), nextCursor: null });

  it('concatenates windows in load order', () => {
    expect(flattenWindows([window(70, 60), window(50, 40)], rowId).map((r) => r.at)).toEqual([70, 60, 50, 40]);
  });

  it('drops rows whose id already appeared in an earlier window (boundary re-fetch), keeping the first copy', () => {
    const first: CursorWindow<Row> = { rows: [{ id: 'row-60', at: 60 }], nextCursor: 60 };
    const second: CursorWindow<Row> = { rows: [{ id: 'row-60', at: 61 }, row(50)], nextCursor: null };
    const rows = flattenWindows([first, second], rowId);
    expect(rows.map((r) => r.id)).toEqual(['row-60', 'row-50']);
    expect(rows[0].at).toBe(60); // the accumulated copy, not the incoming one
  });

  it('concatenates without de-duplication when no rowId is provided', () => {
    expect(flattenWindows([window(60), window(60)]).map((r) => r.at)).toEqual([60, 60]);
  });
});

describe('useCursorWindows + useTableMutation contract', () => {
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

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    for (const key of Object.keys(results)) {
      delete results[key];
    }
    mutate = undefined;
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    queryClient.clear();
    container.remove();
  });

  it('accumulates windows through fetchNextWindow, threading each cursor from the previous tail, and exhausts', async () => {
    const corpus = [row(70), row(60), row(50), row(40), row(30), row(20), row(10)];
    const loader = new FakeCorpusLoader({ dataKey: 'content', dataQueryKey: 'list' }, () => corpus);

    render(<WindowsProbe name='list' loader={loader} windowSize={3} />);
    await waitFor(() => results.list?.rows?.length === 3);
    expect(results.list.rows!.map((r) => r.at)).toEqual([70, 60, 50]);
    expect(results.list.hasMore).toBe(true);

    act(() => results.list.fetchNextWindow());
    await waitFor(() => results.list.rows!.length === 6);
    act(() => results.list.fetchNextWindow());
    await waitFor(() => results.list.rows!.length === 7);

    // Cursor threading: first window unanchored, then each window anchored at the prior tail.
    expect(loader.loads).toEqual([null, 50, 20]);
    expect(results.list.rows!.map((r) => r.at)).toEqual([70, 60, 50, 40, 30, 20, 10]);
    // The short last window settles exhaustion.
    expect(results.list.hasMore).toBe(false);
  });

  it('one dataKey invalidation (useTableMutation) refetches every loaded window of every query over the data set', async () => {
    let corpus = [row(70), row(60), row(50), row(40), row(30), row(20), row(10)];
    // Two queries over ONE data set — home's list windows and pins tiles.
    const listLoader = new FakeCorpusLoader({ dataKey: 'content', dataQueryKey: 'list' }, () => corpus);
    const pinsLoader = new FakeCorpusLoader({ dataKey: 'content', dataQueryKey: 'pins' }, () =>
      corpus.filter((r) => r.at >= 50)
    );

    render(
      <>
        <WindowsProbe name='list' loader={listLoader} windowSize={3} />
        <WindowsProbe name='pins' loader={pinsLoader} windowSize={24} />
        <MutationProbe loader={listLoader} />
      </>
    );
    await waitFor(() => results.list?.rows?.length === 3 && results.pins?.rows?.length === 3);
    act(() => results.list.fetchNextWindow());
    await waitFor(() => results.list.rows!.length === 6);

    // The mutation deletes a row from the data set; success invalidates [dataKey].
    act(() => {
      mutate!(async () => {
        corpus = corpus.filter((r) => r.at !== 60);
      });
    });

    // Both queries refetch their loaded windows in place, cursors re-derived from fresh data:
    // the list's two windows re-thread past the deletion (70,50,40 then 30,20,10)...
    await waitFor(() => results.list.rows!.length === 6 && results.list.rows!.every((r) => r.at !== 60));
    expect(results.list.rows!.map((r) => r.at)).toEqual([70, 50, 40, 30, 20, 10]);
    // ...and the pins query over the SAME dataKey refreshed too (the cross-refresh contract).
    await waitFor(() => results.pins.rows!.length === 2);
    expect(results.pins.rows!.map((r) => r.at)).toEqual([70, 50]);
  });

  it('a window exhausted during refetch stops the chain — no duplicate fetch from the top', async () => {
    let corpus = [row(70), row(60), row(50), row(40), row(30), row(20), row(10)];
    const loader = new FakeCorpusLoader({ dataKey: 'content', dataQueryKey: 'list' }, () => corpus);

    // No rowId: any fetch-from-top duplication must surface in the rows themselves.
    render(<WindowsProbe name='list' loader={loader} windowSize={3} withRowId={false} />);
    await waitFor(() => results.list?.rows?.length === 3);
    act(() => results.list.fetchNextWindow());
    await waitFor(() => results.list.rows!.length === 6);

    // The data set shrinks below one window; a refetch must collapse to that single window.
    corpus = [row(70), row(60)];
    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: ['content'] });
    });
    await waitFor(() => results.list.rows!.length === 2);
    expect(results.list.rows!.map((r) => r.at)).toEqual([70, 60]);
    expect(results.list.hasMore).toBe(false);
  });

  it('a query identity change serves the previous rows until the new first window lands (no skeleton flash)', async () => {
    const corpusA = [row(70), row(60)];
    const corpusB = [row(90), row(80)];
    const loaderA = new FakeCorpusLoader({ dataKey: 'content', dataQueryKey: 'a' }, () => corpusA);
    const loaderB = new FakeCorpusLoader({ dataKey: 'content', dataQueryKey: 'b' }, () => corpusB);

    render(<WindowsProbe name='list' loader={loaderA} windowSize={3} />);
    await waitFor(() => results.list?.rows?.length === 2);

    render(<WindowsProbe name='list' loader={loaderB} windowSize={3} />);
    // Immediately after the swap: still A's rows — never undefined (the skeleton state).
    expect(results.list.rows!.map((r) => r.at)).toEqual([70, 60]);
    await waitFor(() => results.list.rows![0]?.at === 90);
    expect(results.list.rows!.map((r) => r.at)).toEqual([90, 80]);
  });
});
