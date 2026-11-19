/**
 * @jest-environment jsdom
 *
 * Table's phone card face (admin surfaces work on mobile). Below the phone line the
 * Table presents rows as a stacked card list — the house list-row idiom — instead of a
 * horizontally-overflowing MUI table. Same machinery both faces: one loader pipeline, one
 * toolbar, one selection model, one row-click intent guard. Contracts as rendered OUTCOMES:
 *  1. Phone: NO <table> element renders; the card face renders one card per row, each showing
 *     the column labels (humanized) and values — nothing requires horizontal scroll.
 *  2. Tap on a card runs rowOnClick with the row (the record-form door).
 *  3. Selection survives the face swap: with buttons configured, each card carries a checkbox;
 *     checking one flips the toolbar into its selected state.
 *  4. The honest error state renders on the phone face too.
 *  5. Desktop (fine pointer / wide window): the MUI table face renders unchanged — the phone
 *     face is unreachable (desktop-invariance is structural, not incidental).
 *  6. Groups, as the list groups (`groupKey` + `renderGroupHeader`): one head before each run of rows sharing a key,
 *     on both faces, as a sibling of its rows keyed by its group; a head that is nothing draws nothing; the heads are
 *     made at every render, so a key that reads the clock is right at the next re-read.
 */
import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from 'react-query';
import { Table } from '../src/table/Table';
import type { TableLoader, RowWindow } from '../src/table/TableLoader';
import type { TableButton } from '../src/table/TableButton';
import { Delete } from '@mui/icons-material';

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// ── IntersectionObserver stub (jsdom has none). ──────────────────────────────────────────────
class FakeIntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as any).IntersectionObserver = FakeIntersectionObserver;

// ── Form-factor control: useFormFactor reads matchMedia; `phoneMode` flips every query match,
// which yields coarse-pointer + sub-600px (phone) or fine-pointer desktop. ───────────────────
let phoneMode = true;
beforeAll(() => {
  (window as any).matchMedia = (query: string) => ({
    matches: phoneMode,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  });
});

type Row = { name: string; status: string };
const rows: Row[] = [
  { name: 'roles backfill', status: 'success' },
  { name: 'session prune', status: 'failure' },
];

class StaticLoader implements TableLoader<Row> {
  reactQueryKeys = { dataKey: `phone-face-${Date.now()}-${Math.random()}`, dataQueryKey: 'all' };
  failLoads = false;
  async load(startIndex: number, endIndex: number): Promise<RowWindow<Row>> {
    if (this.failLoads) {
      throw new Error('permission denied: not visible to this account');
    }
    return { rows: rows.slice(startIndex, endIndex), totalCount: rows.length };
  }
}

/** A loader whose rows a case can change and then re-read, as a list re-reads by its query key. */
class RowsLoader implements TableLoader<Row> {
  reactQueryKeys = { dataKey: `phone-face-groups-${Date.now()}-${Math.random()}`, dataQueryKey: 'all' };
  constructor(public rows: Row[]) {}
  async load(startIndex: number, endIndex: number): Promise<RowWindow<Row>> {
    return { rows: this.rows.slice(startIndex, endIndex), totalCount: this.rows.length };
  }
}

const deleteButton: TableButton<Row> = {
  name: 'Delete selected rows',
  icon: Delete,
  visibility: { showWhenRowsSelected: true, showWhenNoRowsSelected: false },
  onClick: async () => undefined,
};

describe('Table phone card face', () => {
  let container: HTMLDivElement;
  let root: Root;
  let client: QueryClient;

  beforeEach(() => {
    phoneMode = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    client = new QueryClient({ defaultOptions: { queries: { retry: false, cacheTime: 0 } } });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const render = async (props: Partial<React.ComponentProps<typeof Table<Row>>> = {}, loader?: TableLoader<Row>) => {
    const tableLoader = loader ?? new StaticLoader();
    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <MemoryRouter>
            <Table<Row> title='Migration' columns={['name', 'status']} tableLoader={tableLoader} {...props} />
          </MemoryRouter>
        </QueryClientProvider>
      );
    });
    // let react-query resolve the first page
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  };

  it('renders rows as the card list, not a table (no <table> element; labels + values present)', async () => {
    await render();
    expect(container.querySelector('table')).toBeNull();
    const cards = container.querySelectorAll('[data-table-phone-row]');
    expect(cards.length).toBe(2);
    const first = cards[0] as HTMLElement;
    expect(first.textContent).toContain('Name');
    expect(first.textContent).toContain('roles backfill');
    expect(first.textContent).toContain('Status');
    expect(first.textContent).toContain('success');
  });

  it('tap on a card runs rowOnClick with the row', async () => {
    const rowOnClick = jest.fn();
    await render({ rowOnClick });
    const card = container.querySelectorAll('[data-table-phone-row]')[1] as HTMLElement;
    await act(async () => {
      card.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 10, clientY: 10 }));
    });
    expect(rowOnClick).toHaveBeenCalledTimes(1);
    expect(rowOnClick.mock.calls[0][0]).toEqual(rows[1]);
  });

  it('selection rides the card face: checking a card flips the toolbar into its selected state', async () => {
    await render({ buttons: [deleteButton] });
    const checkbox = container.querySelectorAll('[data-table-phone-row] input[type="checkbox"]')[0] as HTMLInputElement;
    expect(checkbox).toBeTruthy();
    await act(async () => {
      checkbox.click();
    });
    expect(container.textContent).toContain('1 rows selected');
  });

  it('renders the honest load-error state on the phone face', async () => {
    const loader = new StaticLoader();
    loader.failLoads = true;
    await render({}, loader);
    expect(container.textContent).toContain("Couldn't load rows.");
    expect(container.textContent).toContain('permission denied: not visible to this account');
  });

  it('desktop keeps the MUI table face (fine pointer never enters the phone face)', async () => {
    phoneMode = false;
    await render();
    expect(container.querySelector('table')).toBeTruthy();
    expect(container.querySelector('[data-table-phone-row]')).toBeNull();
  });
  describe('groups', () => {
    /** The list as a person reads it, top to bottom: heads and rows, on whichever face is drawn. */
    const sequence = (): string[] =>
      Array.from(
        container.querySelectorAll(phoneMode ? '[data-table-group-head], [data-table-phone-row]' : 'tbody tr')
      ).map((node) =>
        node.hasAttribute('data-table-group-head')
          ? `head:${node.textContent}`
          : `row:${(node.textContent ?? '').replace(/^Name/, '')}`
      );
    const rowNodes = (): Element[] =>
      Array.from(
        container.querySelectorAll(phoneMode ? '[data-table-phone-row]' : 'tbody tr:not([data-table-group-head])')
      );
    const headNodes = (): Element[] => Array.from(container.querySelectorAll('[data-table-group-head]'));
    const reRead = async (loader: RowsLoader) => {
      await act(async () => {
        await client.invalidateQueries([loader.reactQueryKeys.dataKey]);
      });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    };
    /** The face is read when the table mounts: a case that turns to the other face mounts a fresh table. */
    const turnTo = (face: 'phone' | 'desk') => {
      act(() => root.unmount());
      container.remove();
      phoneMode = face === 'phone';
      container = document.createElement('div');
      document.body.appendChild(container);
      root = createRoot(container);
      client = new QueryClient({ defaultOptions: { queries: { retry: false, cacheTime: 0 } } });
    };
    const keyed = (keys: string[]): Row[] => keys.map((status, index) => ({ name: `r${index}`, status }));
    const byStatus = (row: Row) => row.status;
    const head = (key: string) => <span>{key}</span>;

    it("a keyed table draws one head per run, before the run's first row, and never between two rows of one run; a key that comes back later draws its own head", async () => {
      const calls: Array<{ key: string; names: string[]; groupIndex: number }> = [];
      await render(
        {
          columns: ['name'],
          hideColumnHeaders: true,
          groupKey: byStatus,
          renderGroupHeader: (key, groupRows, groupIndex) => {
            calls.push({ key, names: groupRows.map((row) => row.name), groupIndex });
            return head(key);
          },
        },
        new RowsLoader(keyed(['A', 'A', 'B', 'A']))
      );
      expect(sequence()).toEqual(['head:A', 'row:r0', 'row:r1', 'head:B', 'row:r2', 'head:A', 'row:r3']);
      expect(calls.slice(-3)).toEqual([
        { key: 'A', names: ['r0', 'r1'], groupIndex: 0 },
        { key: 'B', names: ['r2'], groupIndex: 1 },
        { key: 'A', names: ['r3'], groupIndex: 2 },
      ]);
    });

    it('two runs that share a key draw their heads with no key given twice', async () => {
      const errors: string[] = [];
      const spy = jest.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
        errors.push(args.map(String).join(' '));
      });
      try {
        await render(
          { columns: ['name'], hideColumnHeaders: true, groupKey: byStatus, renderGroupHeader: head },
          new RowsLoader(keyed(['A', 'A', 'B', 'A']))
        );
      } finally {
        spy.mockRestore();
      }
      expect(headNodes()).toHaveLength(3);
      expect(errors.filter((line) => line.includes('same key'))).toEqual([]);
    });

    it('a head that is nothing draws nothing', async () => {
      const props = {
        columns: ['name'] as Array<keyof Row>,
        hideColumnHeaders: true,
        groupKey: byStatus,
        renderGroupHeader: (key: string) => (key === 'B' ? null : head(key)),
      };
      await render(props, new RowsLoader(keyed(['A', 'B', 'C'])));
      expect(sequence()).toEqual(['head:A', 'row:r0', 'row:r1', 'head:C', 'row:r2']);
      expect(headNodes()).toHaveLength(2);

      turnTo('desk');
      await render(props, new RowsLoader(keyed(['A', 'B', 'C'])));
      expect(sequence()).toEqual(['head:A', 'row:r0', 'row:r1', 'head:C', 'row:r2']);
      expect(container.querySelectorAll('tbody tr')).toHaveLength(5);
    });

    it('on the desk face a head is one cell spanning the columns before its run; a tap on a head runs nothing; a tap on the row under the second head runs rowOnClick with THAT row', async () => {
      phoneMode = false;
      const rowOnClick = jest.fn();
      const groupRows = keyed(['A', 'A', 'B']);
      await render(
        { rowOnClick, buttons: [deleteButton], groupKey: byStatus, renderGroupHeader: head },
        new RowsLoader(groupRows)
      );
      const heads = headNodes() as HTMLTableRowElement[];
      expect(heads).toHaveLength(2);
      // The checkbox column and both data columns: one cell spans all three.
      expect(heads[0].cells).toHaveLength(1);
      expect(heads[0].cells[0].colSpan).toBe(3);
      expect(sequence().map((line) => line.split(':')[0])).toEqual(['head', 'row', 'row', 'head', 'row']);

      await act(async () => {
        heads[1].dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 10, clientY: 10 }));
      });
      expect(rowOnClick).not.toHaveBeenCalled();

      const underSecondHead = heads[1].nextElementSibling as HTMLElement;
      await act(async () => {
        underSecondHead.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 10, clientY: 10 }));
      });
      expect(rowOnClick).toHaveBeenCalledTimes(1);
      expect(rowOnClick.mock.calls[0][0]).toEqual(groupRows[2]);
    });

    it('a row that moves to another group while the table is open moves nothing else', async () => {
      for (const face of ['phone', 'desk'] as const) {
        turnTo(face);
        const loader = new RowsLoader([
          { name: 'Menu', status: 'Today' },
          { name: 'Oven', status: 'Today' },
          { name: 'Quotes', status: 'Yesterday' },
          { name: 'Lease', status: 'Yesterday' },
        ]);
        await render(
          { columns: ['name'], hideColumnHeaders: true, groupKey: byStatus, renderGroupHeader: head },
          loader
        );
        const rowsBefore = rowNodes();
        const headsBefore = headNodes();
        expect(headsBefore).toHaveLength(2);

        // Lease gets a message: it comes back first, under Today.
        loader.rows = [
          { name: 'Lease', status: 'Today' },
          { name: 'Menu', status: 'Today' },
          { name: 'Oven', status: 'Today' },
          { name: 'Quotes', status: 'Yesterday' },
        ];
        await reRead(loader);

        const words = sequence();
        expect(words).toEqual(['head:Today', 'row:Lease', 'row:Menu', 'row:Oven', 'head:Yesterday', 'row:Quotes']);
        const rowsAfter = rowNodes();
        expect(rowsAfter).toHaveLength(rowsBefore.length);
        rowsAfter.forEach((node, index) => expect(node).toBe(rowsBefore[index]));
        const headsAfter = headNodes();
        expect(headsAfter[0]).toBe(headsBefore[0]);
        expect(headsAfter[1]).toBe(headsBefore[1]);
      }
    });

    it("a group key that reads like a row's index draws every row once", async () => {
      const errors: string[] = [];
      const spy = jest.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
        errors.push(args.map(String).join(' '));
      });
      try {
        await render(
          { columns: ['name'], hideColumnHeaders: true, groupKey: byStatus, renderGroupHeader: head },
          new RowsLoader(keyed(['0', '1', '1', '2']))
        );
      } finally {
        spy.mockRestore();
      }
      expect(rowNodes()).toHaveLength(4);
      expect(headNodes()).toHaveLength(3);
      expect(sequence()).toEqual(['head:0', 'row:r0', 'head:1', 'row:r1', 'row:r2', 'head:2', 'row:r3']);
      expect(errors.filter((line) => line.includes('same key'))).toEqual([]);
    });

    it("the heads follow the key at the table's own next render", async () => {
      // The key reads a clock when it is called, as a day's words do; the host hands it once and never renders again.
      let today = 'Nov 13';
      const stamps: { [name: string]: string } = { Menu: 'Nov 13', Oven: 'Nov 13', Quotes: 'Nov 12' };
      const dayKey = (row: Row) => (stamps[row.name] === today ? 'Today' : 'Earlier day');
      const loader = new RowsLoader([
        { name: 'Menu', status: '' },
        { name: 'Oven', status: '' },
        { name: 'Quotes', status: '' },
      ]);
      await render({ columns: ['name'], hideColumnHeaders: true, groupKey: dayKey, renderGroupHeader: head }, loader);
      expect(headNodes().map((node) => node.textContent)).toEqual(['Today', 'Earlier day']);

      // Midnight passes; the rows are equal; the list re-reads by its query key alone.
      today = 'Nov 14';
      await reRead(loader);
      expect(headNodes().map((node) => node.textContent)).toEqual(['Earlier day']);
    });
  });
});
