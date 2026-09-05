/**
 * @jest-environment jsdom
 *
 * The base Table's DEFAULT cell presentations (the admin-surface polish rev). Contracts as
 * rendered OUTCOMES:
 *  1. Booleans render the check/dash grammar — never 'True'/'False' strings (true → a Check
 *     svg, false → a dash).
 *  2. Null/empty values render the quiet dash on the desktop grid.
 *  3. Moments render humanized (formatRelativeDate) with the precise absolute on the hover
 *     title — never the raw verbose format.
 *  4. Column headers are quiet labels (no h6 heading in the header row).
 *  5. Phone card face: a default-rendered EMPTY field renders nothing at all — no dangling
 *     label; non-empty fields keep label + value.
 *  6. Objects render as one ellipsized mono snippet (title carries the JSON).
 */
import React from 'react';
import moment from 'moment';
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

type Row = {
  name: string;
  verified: boolean;
  retired: boolean;
  token: string | null;
  updated: moment.Moment;
  payload: { a: number };
};

const updated = moment('2026-05-04 14:30:00', 'YYYY-MM-DD HH:mm:ss');
const rows: Row[] = [{ name: 'brent+test', verified: true, retired: false, token: null, updated, payload: { a: 1 } }];

class StaticLoader implements TableLoader<Row> {
  reactQueryKeys = { dataKey: `default-cells-${Date.now()}-${Math.random()}`, dataQueryKey: 'all' };
  async load(startIndex: number, endIndex: number): Promise<RowWindow<Row>> {
    return { rows: rows.slice(startIndex, endIndex), totalCount: rows.length };
  }
}

describe('Table default cell values', () => {
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
            <Table<Row>
              title='Users'
              columns={['name', 'verified', 'retired', 'token', 'updated', 'payload']}
              tableLoader={new StaticLoader()}
              {...props}
            />
          </MemoryRouter>
        </QueryClientProvider>
      );
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  };

  const bodyCells = () => Array.from(container.querySelectorAll('tbody td')) as HTMLElement[];

  it('booleans render the check/dash grammar, never True/False strings', async () => {
    await render();
    const cells = bodyCells();
    // columns: [name, verified, retired, token, updated, payload]
    const verifiedCell = cells[1];
    const retiredCell = cells[2];
    expect(verifiedCell.querySelector('svg')).not.toBeNull();
    expect(verifiedCell.textContent).not.toContain('True');
    expect(retiredCell.textContent).toBe('—');
    expect(retiredCell.textContent).not.toContain('False');
  });

  it('null values render the quiet dash', async () => {
    await render();
    expect(bodyCells()[3].textContent).toBe('—');
  });

  it('moments render humanized with the precise absolute on the hover title', async () => {
    await render();
    const cell = bodyCells()[4];
    expect(cell.textContent).toBe('May 4, 2026');
    const titled = cell.querySelector('[title]') as HTMLElement;
    expect(titled).not.toBeNull();
    expect(titled.getAttribute('title')).toBe(updated.format('ddd, MMM D YYYY, h:mm:ss A'));
  });

  it('objects render as content — one line per key — with the JSON on the title', async () => {
    await render();
    const cell = bodyCells()[5];
    const entries = Array.from(cell.querySelectorAll('[data-structured-cell-entry]'));
    expect(entries.map((entry) => entry.textContent)).toEqual(['a1']);
    expect(cell.querySelector('[data-structured-cell-key]')?.textContent).toBe('a');
    const structured = cell.querySelector('[title]') as HTMLElement;
    expect(structured.getAttribute('title')).toBe('{"a":1}');
  });

  it('column headers are quiet labels — no h6 heading in the header row', async () => {
    await render();
    const head = container.querySelector('thead') as HTMLElement;
    expect(head.querySelector('h6')).toBeNull();
    const label = Array.from(head.querySelectorAll('th'))
      .map((th) => th.textContent)
      .join(' ');
    expect(label).toContain('Name');
  });

  it('omitEmptyOnCard: a value-driven custom renderer omits its field on the card when the raw value is empty', async () => {
    phoneMode = true;
    await render({
      columnConfig: {
        token: { omitEmptyOnCard: true, renderer: (value) => <span>{value == null ? '—' : String(value)}</span> },
        payload: { renderer: () => <span>always-rendered</span> },
      },
    });
    const card = container.querySelector('[data-table-phone-row]') as HTMLElement;
    // token is null and declared value-driven: label + value both gone
    expect(card.textContent).not.toContain('Token');
    // payload's renderer is row-driven (no flag): it renders even though the config is custom
    expect(card.textContent).toContain('always-rendered');
  });

  it('phone card face omits default-rendered empty fields entirely (no dangling label)', async () => {
    phoneMode = true;
    await render();
    const card = container.querySelector('[data-table-phone-row]') as HTMLElement;
    expect(card).not.toBeNull();
    expect(card.textContent).toContain('Name');
    expect(card.textContent).not.toContain('Token');
    // non-empty fields keep the label + value pairing
    expect(card.textContent).toContain('Verified');
  });
});
