/**
 * @jest-environment jsdom
 *
 * The table has ONE reading edge. Its title, its column labels and its rows start at the same
 * distance from the table's side — a title that starts a few pixels inside its rows reads as a
 * misaligned header on a full-bleed phone page, where the table's side is the screen's.
 *
 * Contracts as rendered OUTCOMES (the edge is measured from the emitted styles, `ReadingEdge`):
 *  1. Phone, a 390-wide container: the title starts at 16, and so does each row's first line.
 *  2. Phone, rows selected: the selection count takes the title's seat at the same 16.
 *  3. Desktop: the title starts where the first column's label and values start, and selecting
 *     rows does not move it.
 */
import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from 'react-query';
import { Delete } from '@mui/icons-material';
import { Table } from '../src/table/Table';
import type { TableLoader, RowWindow } from '../src/table/TableLoader';
import type { TableButton } from '../src/table/TableButton';
import { ReadingEdge } from './ReadingEdge';

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

class FakeIntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as any).IntersectionObserver = FakeIntersectionObserver;

// useFormFactor reads matchMedia; `phoneMode` flips every query match, which yields
// coarse-pointer + sub-600px (phone) or fine-pointer desktop.
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

const PHONE_WIDTH = 390;
const DESKTOP_WIDTH = 1280;
const READING_EDGE = 16;

type Row = { name: string; status: string };
const rows: Row[] = [
  { name: 'roles backfill', status: 'success' },
  { name: 'session prune', status: 'failure' },
];

class StaticLoader implements TableLoader<Row> {
  reactQueryKeys = { dataKey: `reading-edge-${Date.now()}-${Math.random()}`, dataQueryKey: 'all' };
  async load(startIndex: number, endIndex: number): Promise<RowWindow<Row>> {
    return { rows: rows.slice(startIndex, endIndex), totalCount: rows.length };
  }
}

const deleteButton: TableButton<Row> = {
  name: 'Delete selected rows',
  icon: Delete,
  visibility: { showWhenRowsSelected: true, showWhenNoRowsSelected: false },
  onClick: async () => undefined,
};

describe('Table reading edge', () => {
  let container: HTMLDivElement;
  let root: Root;
  let client: QueryClient;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    client = new QueryClient({ defaultOptions: { queries: { retry: false, cacheTime: 0 } } });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const render = async (width: number, props: Partial<React.ComponentProps<typeof Table<Row>>> = {}) => {
    container.style.width = `${width}px`;
    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <MemoryRouter>
            <Table<Row> title='Migration' columns={['name', 'status']} tableLoader={new StaticLoader()} {...props} />
          </MemoryRouter>
        </QueryClientProvider>
      );
    });
    // let react-query resolve the first page
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  };

  const textElement = (text: string): HTMLElement => {
    const found = Array.from(container.querySelectorAll<HTMLElement>('h6, p, th, td')).find(
      (element) => element.textContent === text
    );
    if (!found) {
      throw new Error(`No element renders the text '${text}'`);
    }

    return found;
  };

  it('phone: the title and the rows start at 16 on a 390-wide container', async () => {
    phoneMode = true;
    await render(PHONE_WIDTH);
    const edge = new ReadingEdge(PHONE_WIDTH);

    expect(container.querySelectorAll('[data-table-phone-row]').length).toBe(2);
    expect(edge.of(textElement('roles backfill'), container)).toBe(READING_EDGE);
    expect(edge.of(textElement('session prune'), container)).toBe(READING_EDGE);
    expect(edge.of(textElement('Migration'), container)).toBe(READING_EDGE);
  });

  it('phone: the selection count takes the title seat at the same 16', async () => {
    phoneMode = true;
    await render(PHONE_WIDTH, { buttons: [deleteButton] });
    const checkbox = container.querySelector('[data-table-phone-row] input[type="checkbox"]') as HTMLInputElement;
    await act(async () => {
      checkbox.click();
    });

    const edge = new ReadingEdge(PHONE_WIDTH);
    expect(edge.of(textElement('1 rows selected'), container)).toBe(READING_EDGE);
  });

  it('desktop: the title starts where the first column starts, selected or not', async () => {
    phoneMode = false;
    await render(DESKTOP_WIDTH, { buttons: [deleteButton] });
    const edge = new ReadingEdge(DESKTOP_WIDTH);

    // The first DATA column: with row actions the grid leads with a checkbox cell, so the title
    // is compared with the cells' own inset — the distance every column's text keeps from its
    // cell's side, which is the table's side for the leading column of a table without actions.
    const headCell = textElement('Name');
    const bodyCell = textElement('roles backfill');
    expect(edge.of(headCell, headCell.parentElement!)).toBe(READING_EDGE);
    expect(edge.of(bodyCell, bodyCell.parentElement!)).toBe(READING_EDGE);
    expect(edge.of(textElement('Migration'), container)).toBe(READING_EDGE);

    const checkbox = container.querySelector('tbody input[type="checkbox"]') as HTMLInputElement;
    await act(async () => {
      checkbox.click();
    });
    expect(edge.of(textElement('1 rows selected'), container)).toBe(READING_EDGE);
  });
});
