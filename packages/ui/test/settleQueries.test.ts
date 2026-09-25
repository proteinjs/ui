/**
 * THE SETTLE READS FRESH (`settleQueries`, the exported owner every consumer's write settles
 * through): a read still in flight when a write answers was issued before the write answered, so it
 * carries the rows as they stood before the act. react-query v3 folds a refetch asked for while a
 * fetch runs into that running fetch (`cancelRefetch` off, the v3 default), so a plain invalidation
 * adopts such a read. The settle drops it and reads after the write answered.
 *
 * Asserted as OUTCOMES on a real QueryClient with an in-memory ledger whose write and next read can
 * each be held, through both call shapes (a key, which prefix-matches; filters with a predicate):
 * once everything lands, the cached rows are the ones the write left, served by a read issued after
 * the write answered — and an optimistic row written mid round trip is never reverted while the
 * fresh read runs.
 */
import { QueryClient, QueryKey, QueryObserver } from 'react-query';
import { settleQueries } from '../src/query/settleQueries';

type Row = { id: string; label: string };

/** In-memory ledger; the act's write and the next read can each be HELD. */
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
    this.rows = Array.from({ length: count }, (_, i) => ({ id: `row-${i + 1}`, label: `Row ${i + 1}` }));
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

  async read(): Promise<Row[]> {
    const snapshot = this.rows.map((row) => ({ ...row }));
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

  async rename(id: string, label: string): Promise<void> {
    await this.writeGate;
    this.rows.find((row) => row.id === id)!.label = label;
    this.writeAnswered = true;
  }
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('settleQueries — a write settles on a fresh read; a read issued before the write answered is dropped, never adopted', () => {
  let queryClient: QueryClient;
  let ledger: FakeLedger;
  let unsubscribes: Array<() => void>;

  /** An active observer (a mounted list) over `queryKey`, reading the ledger. */
  const observe = (queryKey: QueryKey): QueryObserver<Row[]> => {
    const observer = new QueryObserver<Row[]>(queryClient, { queryKey, queryFn: () => ledger.read() });
    unsubscribes.push(observer.subscribe(() => undefined));
    return observer;
  };
  const rowsOf = (queryKey: QueryKey) => queryClient.getQueryData<Row[]>(queryKey);
  const waitFor = async (predicate: () => boolean, what: string) => {
    const deadline = Date.now() + 3000;
    while (!predicate()) {
      if (Date.now() > deadline) {
        throw new Error(`waitFor timed out: ${what} (reads=${JSON.stringify(ledger.reads)})`);
      }
      await tick();
    }
  };
  /** The write answers, the caller settles, and only THEN the held read lands — the shape of the flap. */
  const answerSettleThenLandTheHeldRead = async (settle: () => Promise<void>) => {
    ledger.answer();
    await tick();
    const settled = settle();
    await tick();
    ledger.release();
    await settled;
    await waitFor(() => queryClient.isFetching() === 0, 'the reads settled');
    await tick();
  };

  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    ledger = new FakeLedger();
    unsubscribes = [];
  });

  afterEach(() => {
    unsubscribes.forEach((unsubscribe) => unsubscribe());
    queryClient.clear();
  });

  it('BY KEY — a delete with a read issued mid round trip: the held read carries the row, and the row is GONE once everything lands', async () => {
    ledger.seed(3);
    const observer = observe(['rows', 'all']);
    await waitFor(() => rowsOf(['rows', 'all'])?.length === 3, 'the first read');

    // The delete's write is held; a read is issued mid round trip (a focus return, a second
    // observer) and held, carrying row-2.
    ledger.holdWrite();
    const write = ledger.remove('row-2');
    ledger.holdNextRead();
    void observer.refetch();
    await waitFor(() => ledger.readHeld, 'the read issued before the write answered');

    // `['rows']` prefix-matches the observed `['rows', 'all']`.
    await answerSettleThenLandTheHeldRead(() => settleQueries(queryClient, ['rows']));
    await write;

    expect(rowsOf(['rows', 'all'])!.map((row) => row.id)).toEqual(['row-1', 'row-3']);
    expect(ledger.reads).toEqual([
      { held: false, afterWrite: false },
      { held: true, afterWrite: false },
      { held: false, afterWrite: true },
    ]);
  });

  it('BY FILTERS — a predicate sweep over a list and a view whose key extends it: both drop their held reads and read the rename', async () => {
    ledger.seed(2);
    observe(['rows', 'widget-1']);
    const view = observe(['rows', 'widget-1-view']);
    await waitFor(
      () => rowsOf(['rows', 'widget-1'])?.length === 2 && rowsOf(['rows', 'widget-1-view'])?.length === 2,
      'the first reads'
    );

    ledger.holdWrite();
    const write = ledger.rename('row-1', 'Renamed');
    ledger.holdNextRead();
    void view.refetch();
    await waitFor(() => ledger.readHeld, 'the view read issued before the write answered');

    await answerSettleThenLandTheHeldRead(() =>
      settleQueries(queryClient, {
        predicate: (query) => query.queryKey[0] === 'rows' && String(query.queryKey[1]).startsWith('widget-1'),
      })
    );
    await write;

    expect(rowsOf(['rows', 'widget-1'])![0].label).toBe('Renamed');
    expect(rowsOf(['rows', 'widget-1-view'])![0].label).toBe('Renamed');
    expect(ledger.reads.filter((read) => read.afterWrite && !read.held)).toHaveLength(2);
  });

  it('AN OPTIMISTIC ROW (cancel, then patch) with a read issued mid round trip: the row never falls back to the held read while the settle reads, and the served row matches it', async () => {
    ledger.seed(2);
    const observer = observe(['rows', 'all']);
    await waitFor(() => rowsOf(['rows', 'all'])?.length === 2, 'the first read');

    const seen: string[] = [];
    unsubscribes.push(
      observer.subscribe((result) => {
        const label = result.data?.find((row) => row.id === 'row-2')?.label;
        if (label) {
          seen.push(label);
        }
      })
    );

    // The act, the react-query way: cancel the reads in flight, patch the row, then the write (held).
    await queryClient.cancelQueries(['rows', 'all']);
    queryClient.setQueryData<Row[]>(['rows', 'all'], (rows) =>
      rows!.map((row) => (row.id === 'row-2' ? { ...row, label: 'Optimistic' } : row))
    );
    ledger.holdWrite();
    const write = ledger.rename('row-2', 'Optimistic');
    // Mid round trip a read is issued (a focus return, a second observer) and held, carrying row-2 as it was.
    ledger.holdNextRead();
    void observer.refetch();
    await waitFor(() => ledger.readHeld, 'the read issued before the write answered');

    await answerSettleThenLandTheHeldRead(() => settleQueries(queryClient, ['rows', 'all']));
    await write;

    expect(rowsOf(['rows', 'all'])!.find((row) => row.id === 'row-2')!.label).toBe('Optimistic');
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((label) => label === 'Optimistic')).toBe(true);
    expect(ledger.reads.some((read) => read.afterWrite && !read.held)).toBe(true);
  });
});
