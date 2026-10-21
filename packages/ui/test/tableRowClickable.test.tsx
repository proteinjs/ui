/**
 * @jest-environment jsdom
 *
 * `Table.rowClickable` — per-row clickability beside `rowOnClick`. The Table alone owns a row's click
 * affordance (the pointer cursor, the `:active` wash, the click door), so a row the predicate judges
 * `false` renders at the disabled presence — `aria-disabled`, no pointer, reduced presence — and the
 * click door is NOT bound: a tap does nothing, and nothing on the row says it would. Absent, every row
 * of a clickable table is clickable as today. Both faces (the phone card list and the desktop table).
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

class FakeIntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as any).IntersectionObserver = FakeIntersectionObserver;

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

type Row = { name: string; kept: boolean };
const rows: Row[] = [
  { name: 'Kyoto trip', kept: true },
  { name: 'Book club', kept: false },
];

class StaticLoader implements TableLoader<Row> {
  reactQueryKeys = { dataKey: `row-clickable-${Date.now()}-${Math.random()}`, dataQueryKey: 'all' };
  async load(startIndex: number, endIndex: number): Promise<RowWindow<Row>> {
    return { rows: rows.slice(startIndex, endIndex), totalCount: rows.length };
  }
}

describe('Table.rowClickable', () => {
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

  const render = async (props: Partial<React.ComponentProps<typeof Table<Row>>> = {}) => {
    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <MemoryRouter>
            <Table<Row> title='Rail' columns={['name']} tableLoader={new StaticLoader()} {...props} />
          </MemoryRouter>
        </QueryClientProvider>
      );
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  };

  const click = (node: Element) => {
    act(() => {
      node.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }));
    });
  };

  const rowNodes = (): Element[] =>
    phoneMode
      ? Array.from(container.querySelectorAll('[data-table-phone-row]'))
      : Array.from(container.querySelectorAll('tbody tr'));

  describe.each([
    ['phone card face', true],
    ['desktop table face', false],
  ])('%s', (_face, phone) => {
    beforeEach(() => {
      phoneMode = phone;
    });

    it('a row judged false is aria-disabled, carries no pointer cursor, and a click on it runs nothing', async () => {
      const clicked: string[] = [];
      await render({ rowOnClick: (row) => void clicked.push(row.name), rowClickable: (row) => row.kept });
      const [kept, unkept] = rowNodes();
      expect(rowNodes()).toHaveLength(2);

      expect(unkept.getAttribute('aria-disabled')).toBe('true');
      expect(kept.getAttribute('aria-disabled')).toBeNull();
      expect(getComputedStyle(unkept).cursor).not.toBe('pointer');
      expect(getComputedStyle(kept).cursor).toBe('pointer');

      click(unkept);
      expect(clicked).toEqual([]);
      click(kept);
      expect(clicked).toEqual(['Kyoto trip']);
    });

    it('absent, every row of a clickable table is clickable as today (no aria-disabled anywhere)', async () => {
      const clicked: string[] = [];
      await render({ rowOnClick: (row) => void clicked.push(row.name) });
      const nodes = rowNodes();
      expect(nodes.every((node) => node.getAttribute('aria-disabled') === null)).toBe(true);
      expect(nodes.every((node) => getComputedStyle(node).cursor === 'pointer')).toBe(true);
      click(nodes[1]);
      expect(clicked).toEqual(['Book club']);
    });

    it('a table with no rowOnClick ignores the predicate: nothing is clickable and nothing is marked disabled', async () => {
      await render({ rowClickable: () => false });
      const nodes = rowNodes();
      expect(nodes).toHaveLength(2);
      expect(nodes.every((node) => node.getAttribute('aria-disabled') === null)).toBe(true);
      expect(nodes.every((node) => getComputedStyle(node).cursor !== 'pointer')).toBe(true);
    });
  });
});
