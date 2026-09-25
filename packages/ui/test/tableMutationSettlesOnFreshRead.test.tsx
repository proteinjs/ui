/**
 * @jest-environment jsdom
 *
 * A TABLE MUTATION SETTLES ON A FRESH READ: a read of the data set still in flight when the
 * mutation's write answers was issued before the write answered, so it carries the rows as they
 * stood before the act — the deleted row still there, the pinned row still unpinned. Such a read
 * is not the settle's. react-query v3's `Query.fetch` folds a refetch asked for while a fetch runs
 * into that running fetch (`cancelRefetch` off, the v3 default — v4 turned it on), so the
 * mutation's plain `invalidateQueries` adopted the stale read: it landed over the act's rows (and
 * over an optimistic row a consumer wrote), and no fresh read followed until the next focus,
 * mount or reload. The act looked undone.
 *
 * Who issues such a read is not the point (a focus return during the round trip, a second
 * observer of the data set mounting, a pager's next-page read): the contract is the settle's.
 * Asserted as OUTCOMES on a real QueryClient with an in-memory ledger whose write and next read
 * can each be held, for every data owner a `useTableMutation` invalidation reaches — the offset
 * table (pages and infinite scroll) and the cursor windows: once everything lands, the rows read
 * as the act left them, and a read served after the write answered is the one on screen.
 */
import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { QueryClient, QueryClientProvider } from 'react-query';
import { CursorLoader, CursorValue, CursorWindow } from '../src/table/CursorLoader';
import { useCursorWindows } from '../src/table/cursorWindows';
import { useTableData, useTableMutation } from '../src/table/tableData';
import { ReactQueryKeys, RowWindow, TableLoader } from '../src/table/TableLoader';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

type Row = { id: string; at: number; pinned: boolean };

/** In-memory ledger, newest first; the act's write and the next read can each be HELD. */
class FakeLedger {
  rows: Row[] = [];
  /** Every read, in order: whether it was the held read, and whether the write had answered when it was served. */
  reads: Array<{ held: boolean; afterWrite: boolean }> = [];
  writeAnswered = false;
  readHeld = false;
  private holdNext = false;
  private releaseRead: (() => void) | undefined;
  private releaseWrite: (() => void) | undefined;
  private writeGate: Promise<void> | undefined;

  seed(count: number): void {
    this.rows = Array.from({ length: count }, (_, i) => ({ id: `row-${i + 1}`, at: 100 - i, pinned: false }));
  }

  /** The next read snapshots the ledger as it is when the read arrives, then waits for `release()`. */
  holdNextRead(): void {
    this.holdNext = true;
  }

  release(): void {
    this.readHeld = false;
    this.releaseRead?.();
    this.releaseRead = undefined;
  }

  /** The act's write waits until `answer()` — the round trip the act is in the middle of. */
  holdWrite(): void {
    this.writeGate = new Promise<void>((resolve) => {
      this.releaseWrite = resolve;
    });
  }

  answer(): void {
    this.writeGate = undefined;
    this.releaseWrite?.();
    this.releaseWrite = undefined;
  }

  async read<R>(serve: (rows: Row[]) => R): Promise<R> {
    const snapshot = serve([...this.rows].sort((a, b) => b.at - a.at).map((row) => ({ ...row })));
    if (this.holdNext) {
      this.holdNext = false;
      this.reads.push({ held: true, afterWrite: this.writeAnswered });
      this.readHeld = true;
      await new Promise<void>((resolve) => {
        this.releaseRead = resolve;
      });
      return snapshot;
    }
    this.reads.push({ held: false, afterWrite: this.writeAnswered });
    return snapshot;
  }

  async remove(id: string): Promise<void> {
    await this.writeGate;
    this.rows = this.rows.filter((row) => row.id !== id);
    this.writeAnswered = true;
  }

  async pin(id: string): Promise<void> {
    await this.writeGate;
    this.rows.find((row) => row.id === id)!.pinned = true;
    this.writeAnswered = true;
  }
}

/** The offset loader shape (`TableLoader`) over the ledger. */
class LedgerTableLoader implements TableLoader<Row> {
  constructor(
    public reactQueryKeys: ReactQueryKeys,
    private ledger: FakeLedger
  ) {}

  load(startIndex: number, endIndex: number): Promise<RowWindow<Row>> {
    return this.ledger.read((rows) => ({ rows: rows.slice(startIndex, endIndex), totalCount: rows.length }));
  }
}

/** The cursor loader shape (`CursorLoader`) over the ledger: `at < cursor` windows, newest first. */
class LedgerCursorLoader implements CursorLoader<Row> {
  constructor(
    public reactQueryKeys: ReactQueryKeys,
    private ledger: FakeLedger
  ) {}

  loadWindow(cursor: CursorValue | null, windowSize: number): Promise<CursorWindow<Row>> {
    return this.ledger.read((rows) => {
      const from = cursor === null ? rows : rows.filter((row) => row.at < (cursor as number));
      const window = from.slice(0, windowSize);
      return { rows: window, nextCursor: window.length < windowSize ? null : window[window.length - 1].at };
    });
  }
}

const WINDOW = 10;
const rowId = (row: Row) => row.id;

let shown: Row[] | undefined;
let mutate: ((run: () => Promise<void>) => void) | undefined;

const PagedTableProbe = ({ loader }: { loader: TableLoader<Row> }) => {
  shown = useTableData(loader, WINDOW, 0, false, undefined, true).rows;
  return null;
};

const InfiniteTableProbe = ({ loader }: { loader: TableLoader<Row> }) => {
  shown = useTableData(loader, WINDOW, 0, true, undefined, true).rows;
  return null;
};

const CursorWindowsProbe = ({ loader }: { loader: CursorLoader<Row> }) => {
  shown = useCursorWindows(loader, WINDOW, { rowId, refetchOnWindowFocus: true }).rows;
  return null;
};

const MutationProbe = ({ loader }: { loader: TableLoader<Row> | CursorLoader<Row> }) => {
  mutate = useTableMutation<() => Promise<void>>(loader, (run) => run()).mutate;
  return null;
};

type Owner = { name: string; mount: (ledger: FakeLedger, keys: ReactQueryKeys) => React.ReactElement };

/** Every data owner a `useTableMutation` invalidation of `[dataKey]` reaches. */
const OWNERS: Owner[] = [
  {
    name: 'the paged table (useTableData, pages)',
    mount: (ledger, keys) => {
      const loader = new LedgerTableLoader(keys, ledger);
      return (
        <>
          <PagedTableProbe loader={loader} />
          <MutationProbe loader={loader} />
        </>
      );
    },
  },
  {
    name: 'the infinite-scroll table (useTableData, infinite)',
    mount: (ledger, keys) => {
      const loader = new LedgerTableLoader(keys, ledger);
      return (
        <>
          <InfiniteTableProbe loader={loader} />
          <MutationProbe loader={loader} />
        </>
      );
    },
  },
  {
    name: 'the cursor windows (useCursorWindows)',
    mount: (ledger, keys) => {
      const loader = new LedgerCursorLoader(keys, ledger);
      return (
        <>
          <CursorWindowsProbe loader={loader} />
          <MutationProbe loader={loader} />
        </>
      );
    },
  },
];

describe('a table mutation settles on a fresh read — a read issued before the write answered never stands as the settle', () => {
  let container: HTMLDivElement;
  let root: Root;
  let queryClient: QueryClient;
  let ledger: FakeLedger;
  let keys: ReactQueryKeys;

  /** Run `fire` and let what it starts run on, inside act — every update it causes is the test's. */
  const step = async (fire: () => void = () => undefined) => {
    await act(async () => {
      fire();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  };
  // Deadline under jest's 5s test timeout: waitFor must throw INSIDE the test (act unwinds,
  // afterEach cleans up) — a jest-killed test aborts mid-act and poisons the next.
  const waitFor = async (predicate: () => boolean, what: string) => {
    const deadline = Date.now() + 3000;
    while (!predicate()) {
      if (Date.now() > deadline) {
        throw new Error(
          `waitFor timed out: ${what} (shown=${JSON.stringify(shown?.map(rowId))}, reads=${JSON.stringify(ledger.reads)})`
        );
      }
      await step();
    }
  };
  const mount = (owner: Owner) =>
    act(() => {
      root.render(<QueryClientProvider client={queryClient}>{owner.mount(ledger, keys)}</QueryClientProvider>);
    });
  const focusReturn = () => step(() => window.dispatchEvent(new Event('focus')));
  /** The write answers, the mutation settles, and only THEN the held read lands — the shape of the flap. */
  const answerThenLandTheHeldRead = async () => {
    await step(() => ledger.answer());
    await step();
    await step(() => ledger.release());
    await waitFor(() => queryClient.isFetching() === 0 && queryClient.isMutating() === 0, 'the data set settled');
  };
  /** A consumer's optimistic write: patch the row in every active cached query over the data set. */
  const patchCachedRow = (id: string, patch: Partial<Row>) => {
    const patchRows = (rows: Row[]) => rows.map((row) => (row.id === id ? { ...row, ...patch } : row));
    for (const query of queryClient.getQueryCache().findAll([keys.dataKey], { active: true })) {
      queryClient.setQueryData(query.queryKey, (data: any) =>
        data.pages
          ? { ...data, pages: data.pages.map((page: any) => ({ ...page, rows: patchRows(page.rows) })) }
          : { ...data, rows: patchRows(data.rows) }
      );
    }
  };

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    ledger = new FakeLedger();
    keys = { dataKey: `settle-${Math.random()}`, dataQueryKey: 'all' };
    shown = undefined;
    mutate = undefined;
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    queryClient.clear();
    container.remove();
  });

  it.each(OWNERS)(
    'A DELETE with a slow read started before the act — $name: the read carries the row, and the row is GONE once everything lands',
    async (owner) => {
      ledger.seed(3);
      mount(owner);
      await waitFor(() => shown?.length === 3, 'the first read');
      expect(ledger.reads).toEqual([{ held: false, afterWrite: false }]);

      // A slow read starts BEFORE the act (a focus return), held, carrying row-2.
      ledger.holdNextRead();
      await focusReturn();
      await waitFor(() => ledger.readHeld, 'the slow read started before the act');

      // The delete, as useTableMutation's consumers write it (no optimistic row): its write is held
      // while the slow read is still in flight.
      ledger.holdWrite();
      await step(() => mutate!(() => ledger.remove('row-2')));
      expect(ledger.reads).toEqual([
        { held: false, afterWrite: false },
        { held: true, afterWrite: false },
      ]);

      await answerThenLandTheHeldRead();

      // THE OUTCOME: the deleted row is gone and stays gone; the data set was read after the
      // write answered, and that read is the one on screen.
      expect(shown!.map(rowId)).toEqual(['row-1', 'row-3']);
      expect(ledger.reads.some((read) => read.afterWrite && !read.held)).toBe(true);
    }
  );

  it.each(OWNERS)(
    'AN OPTIMISTIC PIN with a focus return during the round trip — $name: the focus read carries the row unpinned before the write answers, and the optimistic row STAYS pinned once everything lands',
    async (owner) => {
      ledger.seed(3);
      mount(owner);
      await waitFor(() => shown?.length === 3, 'the first read');

      // The pin: the consumer writes the row optimistically (react-query's recipe — cancel the data
      // set's reads in flight, then patch), then its write is held.
      ledger.holdWrite();
      await step(() =>
        mutate!(async () => {
          await queryClient.cancelQueries([keys.dataKey]);
          patchCachedRow('row-2', { pinned: true });
          await ledger.pin('row-2');
        })
      );
      await waitFor(() => shown!.find((row) => row.id === 'row-2')!.pinned, 'the optimistic row');

      // The reader comes back to the foreground mid round trip: a read served before the write
      // answers, held, carrying row-2 unpinned.
      ledger.holdNextRead();
      await focusReturn();
      await waitFor(() => ledger.readHeld, 'the focus read issued before the write answered');
      expect(ledger.reads).toEqual([
        { held: false, afterWrite: false },
        { held: true, afterWrite: false },
      ]);

      await answerThenLandTheHeldRead();

      // THE OUTCOME: the optimistic row stays pinned — the ledger's row, read after the write answered.
      expect(shown!.map(rowId)).toEqual(['row-1', 'row-2', 'row-3']);
      expect(shown!.find((row) => row.id === 'row-2')!.pinned).toBe(true);
      expect(ledger.reads.some((read) => read.afterWrite && !read.held)).toBe(true);
    }
  );
});
