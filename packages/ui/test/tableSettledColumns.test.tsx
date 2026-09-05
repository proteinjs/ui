/**
 * @jest-environment jsdom
 *
 * SETTLED COLUMN WIDTHS (founder, R7 round 3: "when you scroll down in record tables and the
 * tables continue to have different sizes of data, it shifts around the data in the existing
 * rows (like a name column that originally had its whole name on one line … may end up taking
 * up multiple lines as you keep scrolling)"): an auto-layout table re-derives every column from
 * ALL its rows, so each page that lands re-distributes the widths under the rows already read.
 *
 * Contract, at the cause layer (the base Table's desktop face):
 *  1. The first page of rows SETTLES the columns: the cells' measured widths become a fixed
 *     layout (`<colgroup>` pins + `table-layout: fixed`) in the same layout pass.
 *  2. THE REPRO SHAPE: a second page with longer values changes NO settled width — the later
 *     rows wrap inside the columns the first page fixed. (Red at the auto-layout table: the
 *     widths follow the widest content in the DOM.)
 *  3. The pins release for a NEW DATA SET (the loader's keys) and settle again from ITS first
 *     page; a resized scroller releases them too and the next paint settles at the new width.
 *  4. Without geometry (a non-visual environment) the table stays auto — nothing is pinned to 0.
 *
 * jsdom has no layout, so the geometry here is a FAKE AUTO LAYOUT: a cell is as wide as the
 * longest text in its column among the rows in the DOM (8 px a character) — exactly the
 * behaviour that moves the rows — and the scroller has a settable width.
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

// ── IntersectionObserver stub: the sentinel's intersection is fired by hand (a scroll). ──────
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
  }
  unobserve(target: Element) {
    this.entry.targets = this.entry.targets.filter((t) => t !== target);
  }
  disconnect() {
    this.entry.targets = [];
  }
}
(globalThis as any).IntersectionObserver = FakeIntersectionObserver;

// ── ResizeObserver stub: records the observed scroller; a resize is fired by hand. ───────────
const roInstances: Array<{ callback: () => void; targets: Element[] }> = [];
class FakeResizeObserver {
  private entry: { callback: () => void; targets: Element[] };
  constructor(callback: () => void) {
    this.entry = { callback, targets: [] };
    roInstances.push(this.entry);
  }
  observe(target: Element) {
    this.entry.targets.push(target);
  }
  disconnect() {
    this.entry.targets = [];
  }
}
(globalThis as any).ResizeObserver = FakeResizeObserver;

// ── The fake layout: auto when unpinned (a cell is as wide as its column's longest text);
//    FIXED when pinned (a cell renders its pin — times `stretch`, the browser's redistribution
//    when the pins no longer sum to the table's width, i.e. a measure taken across a moving
//    layout). ─────────────────────────────────────────────────────────────────────────────────
const CHAR_PX = 8;
let scrollerWidth = 800;
let geometry = true;
let stretch = 1;
const originalRect = HTMLElement.prototype.getBoundingClientRect;
beforeAll(() => {
  HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement): DOMRect {
    const rect = { x: 0, y: 0, top: 0, left: 0, bottom: 0, right: 0, width: 0, height: 0, toJSON: () => ({}) };
    if (!geometry) {
      return rect as DOMRect;
    }
    if (this.hasAttribute('data-table-scroll-container')) {
      return { ...rect, width: scrollerWidth } as DOMRect;
    }
    if (this instanceof HTMLTableCellElement) {
      const table = this.closest('table');
      const index = this.cellIndex;
      const pin = table?.querySelectorAll('colgroup col')[index] as HTMLElement | undefined;
      if (pin) {
        return { ...rect, width: parseFloat(pin.style.width) * stretch } as DOMRect;
      }
      let longest = 1;
      for (const row of Array.from(table?.tBodies[0]?.rows ?? [])) {
        longest = Math.max(longest, (row.cells[index]?.textContent ?? '').length);
      }
      return { ...rect, width: longest * CHAR_PX } as DOMRect;
    }
    return rect as DOMRect;
  };
});
afterAll(() => {
  HTMLElement.prototype.getBoundingClientRect = originalRect;
});

type Row = { name: string; status: string };
const SHORT_NAME = 'Ada'; // 3 chars → 24 px
const LONG_NAME = 'Augusta Ada King, Countess of Lovelace'; // 38 chars → 304 px in auto layout
const pageOne: Row[] = Array.from({ length: 10 }, (_, i) => ({ name: SHORT_NAME, status: i % 2 ? 'ok' : 'on' }));
const pageTwo: Row[] = Array.from({ length: 10 }, () => ({ name: LONG_NAME, status: 'needs attention now' }));

class PagedLoader implements TableLoader<Row> {
  reactQueryKeys: { dataKey: string; dataQueryKey: string };
  constructor(
    private pages: Row[][],
    key = `settled-${Date.now()}-${Math.random()}`
  ) {
    this.reactQueryKeys = { dataKey: key, dataQueryKey: 'all' };
  }
  async load(startIndex: number, endIndex: number): Promise<RowWindow<Row>> {
    const all = ([] as Row[]).concat(...this.pages);
    return { rows: all.slice(startIndex, endIndex), totalCount: all.length };
  }
}

const fireSentinel = async () => {
  await act(async () => {
    const live = [...ioInstances].reverse().find((entry) => entry.targets.length > 0);
    live?.callback([{ isIntersecting: true }]);
  });
};

const fireResize = async (width: number) => {
  scrollerWidth = width;
  await act(async () => {
    const live = [...roInstances].reverse().find((entry) => entry.targets.length > 0);
    live?.callback();
  });
};

describe('Table — column widths settle on the first page and hold', () => {
  let container: HTMLDivElement;
  let root: Root;
  let client: QueryClient;

  beforeEach(() => {
    ioInstances.length = 0;
    roInstances.length = 0;
    scrollerWidth = 800;
    stretch = 1;
    geometry = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    client = new QueryClient({ defaultOptions: { queries: { retry: false, cacheTime: 0 } } });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  const render = async (loader: TableLoader<Row>) => {
    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <MemoryRouter>
            <Table<Row> columns={['name', 'status']} tableLoader={loader} />
          </MemoryRouter>
        </QueryClientProvider>
      );
    });
    await act(async () => {
      await Promise.resolve();
    });
  };

  const table = () => container.querySelector('table') as HTMLTableElement;
  const mode = () => table().getAttribute('data-table-columns');
  const pins = () =>
    Array.from(container.querySelectorAll('colgroup col')).map((col) => (col as HTMLElement).style.width);
  const rowCount = () => container.querySelectorAll('tbody tr').length;

  it('the first page settles the columns from its own cells, as a fixed layout', async () => {
    await render(new PagedLoader([pageOne, pageTwo]));
    expect(rowCount()).toBe(10);
    expect(mode()).toBe('settled');
    // name 'Ada' → 24 px; status 'on'/'ok' → 16 px: the first page's widths, and nothing else's
    expect(pins()).toEqual(['24px', '16px']);
    expect(getComputedStyle(table()).tableLayout).toBe('fixed');
  });

  it('THE REPRO SHAPE: page two carries longer values — no settled width changes', async () => {
    await render(new PagedLoader([pageOne, pageTwo]));
    expect(pins()).toEqual(['24px', '16px']);

    await fireSentinel();
    expect(rowCount()).toBe(20);
    // The auto layout would now size name to 304 px and status to 152 px (the fake measures the
    // longest text in the DOM); the settled columns are exactly what they were.
    expect(mode()).toBe('settled');
    expect(pins()).toEqual(['24px', '16px']);
  });

  it('a new data set releases the pins and settles again from ITS first page', async () => {
    await render(new PagedLoader([pageOne, pageTwo]));
    expect(pins()).toEqual(['24px', '16px']);

    await render(new PagedLoader([pageTwo], `other-${Math.random()}`));
    expect(rowCount()).toBe(10);
    expect(mode()).toBe('settled');
    expect(pins()).toEqual(['304px', '152px']);
  });

  it('a resized scroller releases the pins; the next paint settles at the new width', async () => {
    await render(new PagedLoader([pageOne, pageTwo]));
    await fireSentinel();
    expect(pins()).toEqual(['24px', '16px']);

    await fireResize(600);
    // Re-settled from the rows now in the DOM (both pages): the widths follow the new layout.
    expect(mode()).toBe('settled');
    expect(pins()).toEqual(['304px', '152px']);
  });

  it('without geometry the table stays auto — nothing is pinned to zero', async () => {
    geometry = false;
    await render(new PagedLoader([pageOne, pageTwo]));
    expect(rowCount()).toBe(10);
    expect(mode()).toBe('auto');
    expect(pins()).toEqual([]);
  });

  it('pins the browser no longer renders as such (a measure across a moving layout) are re-settled, before paint', async () => {
    await render(new PagedLoader([pageOne, pageTwo]));
    expect(pins()).toEqual(['24px', '16px']);

    // The fixed layout now stretches the pinned columns (the pins stopped summing to the table's
    // width): the next rows-paint reads a row that differs from its pins → release → settle
    // again from what the layout renders now.
    stretch = 1.5;
    await fireSentinel();
    expect(rowCount()).toBe(20);
    expect(mode()).toBe('settled');
    // Re-measured unpinned (auto) with both pages in the DOM, then pinned: 304 / 152.
    expect(pins()).toEqual(['304px', '152px']);
  });
});
