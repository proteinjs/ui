/**
 * @jest-environment jsdom
 *
 * Sticky column headers on the Table's desktop face. The Table has always passed `stickyHeader`
 * to the MUI table, but MUI's TableContainer defaults to `overflow-x: auto` — that made the
 * container itself the sticky cells' containing scrollport, and since it never scrolls
 * vertically (the outer scroll Box owns scrolling), headers scrolled away with the rows.
 * Contracts as rendered OUTCOMES:
 *  1. Header cells are sticky: computed `position: sticky; top: 0`, with an opaque background
 *     (rows must not show through) and a z-index above the body rows.
 *  2. Root-cause pin: NO element between the header cell and the Table's scroll container
 *     (`[data-table-scroll-container]`) establishes its own scroll context — every
 *     intermediate computes `overflow: visible` on both axes, so the sticky cells stick to the
 *     scroll Box that actually scrolls.
 *  3. The phone card face is untouched: no table container renders at all below the phone line.
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

// ── IntersectionObserver stub (jsdom has none). ──────────────────────────────────────────────
class FakeIntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as any).IntersectionObserver = FakeIntersectionObserver;

// ── Form-factor control: useFormFactor reads matchMedia; `phoneMode` flips every query match,
// which yields coarse-pointer + sub-600px (phone) or fine-pointer desktop. ───────────────────
let phoneMode = false;
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
  reactQueryKeys = { dataKey: `sticky-header-${Date.now()}-${Math.random()}`, dataQueryKey: 'all' };
  async load(startIndex: number, endIndex: number): Promise<RowWindow<Row>> {
    return { rows: rows.slice(startIndex, endIndex), totalCount: rows.length };
  }
}

const SCROLLING_OVERFLOWS = ['auto', 'scroll', 'hidden', 'overlay'];

describe('Table sticky column headers (desktop face)', () => {
  let container: HTMLDivElement;
  let root: Root;
  let client: QueryClient;

  beforeEach(() => {
    phoneMode = false;
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

  it('header cells are sticky at the top with an opaque background above the rows', async () => {
    await render();
    const headerCells = container.querySelectorAll('thead th');
    expect(headerCells.length).toBe(2);
    for (const cell of Array.from(headerCells)) {
      const cs = window.getComputedStyle(cell);
      expect(cs.position).toBe('sticky');
      expect(cs.top).toBe('0px');
      // Opaque header: rows must not show through while stuck.
      expect(cs.backgroundColor).not.toBe('');
      expect(cs.backgroundColor).not.toBe('transparent');
      expect(cs.backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
      // Above the body rows (which never set a z-index).
      expect(parseInt(cs.zIndex, 10)).toBeGreaterThanOrEqual(1);
    }
  });

  it('nothing between the header cells and the scroll container hijacks the sticky scrollport', async () => {
    await render();
    const scrollContainer = container.querySelector('[data-table-scroll-container]') as HTMLElement;
    expect(scrollContainer).toBeTruthy();
    const headerCell = container.querySelector('thead th') as HTMLElement;
    expect(headerCell).toBeTruthy();
    expect(scrollContainer.contains(headerCell)).toBe(true);

    // position: sticky sticks to the nearest ancestor scroll context. The scroll Box is the one
    // owner of scrolling — any intermediate with non-visible overflow (MUI TableContainer's
    // `overflow-x: auto` default was the bug) silently swallows the sticky behavior.
    let node = headerCell.parentElement;
    while (node && node !== scrollContainer) {
      const cs = window.getComputedStyle(node);
      expect(`${node.className}: ${cs.overflowX}`).not.toMatch(new RegExp(`: (${SCROLLING_OVERFLOWS.join('|')})$`));
      expect(`${node.className}: ${cs.overflowY}`).not.toMatch(new RegExp(`: (${SCROLLING_OVERFLOWS.join('|')})$`));
      node = node.parentElement;
    }
    // The walk must actually have reached the scroll container (not bailed at the root).
    expect(node).toBe(scrollContainer);
  });

  it('phone card face renders no table container at all (fix cannot leak below the phone line)', async () => {
    phoneMode = true;
    await render();
    expect(container.querySelector('.MuiTableContainer-root')).toBeNull();
    expect(container.querySelectorAll('[data-table-phone-row]').length).toBe(2);
  });
});
