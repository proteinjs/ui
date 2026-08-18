/**
 * @jest-environment jsdom
 *
 * Table's phone card face (task #53: admin surfaces work on mobile). Below the phone line the
 * Table presents rows as a stacked card list — the house list-row idiom — instead of a
 * horizontally-overflowing MUI table. Same machinery both faces: one loader pipeline, one
 * toolbar, one selection model, one row-click intent guard. Contracts as rendered OUTCOMES:
 *  1. Phone: NO <table> element renders; the card face renders one card per row, each showing
 *     the column labels (humanized) and values — nothing requires horizontal scroll.
 *  2. Tap on a card runs rowOnClick with the row (the record-form door).
 *  3. Selection survives the face swap: with buttons configured, each card carries a checkbox;
 *     checking one flips the toolbar into its selected state.
 *  4. The honest error state (#117) renders on the phone face too.
 *  5. Desktop (fine pointer / wide window): the MUI table face renders unchanged — the phone
 *     face is unreachable (desktop-invariance is structural, not incidental).
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

  const render = async (props: Partial<React.ComponentProps<typeof Table<Row>>> = {}, loader?: StaticLoader) => {
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

  it('renders the honest load-error state on the phone face (#117 pin)', async () => {
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
});
