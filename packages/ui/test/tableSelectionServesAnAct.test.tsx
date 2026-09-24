/**
 * @jest-environment jsdom
 *
 * Row selection exists to serve an act on the selected rows: the selection column (the row
 * checkboxes and select-all, on the desktop table and the phone card face) renders only when one
 * of the table's acts works on a selection (`visibility.showWhenRowsSelected`). A table whose only
 * act is a create — a ledger that keeps its rows, say — draws no checkboxes: selecting a row could
 * only hide the create act and offer nothing in its place.
 */
import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from 'react-query';
import { Add, Delete } from '@mui/icons-material';
import { Table } from '../src/table/Table';
import type { TableLoader, RowWindow } from '../src/table/TableLoader';
import type { TableButton } from '../src/table/TableButton';

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

type Row = { name: string };
const rows: Row[] = [{ name: 'first run' }, { name: 'second run' }];

class StaticLoader implements TableLoader<Row> {
  reactQueryKeys = { dataKey: `selection-${Date.now()}-${Math.random()}`, dataQueryKey: 'all' };
  async load(startIndex: number, endIndex: number): Promise<RowWindow<Row>> {
    return { rows: rows.slice(startIndex, endIndex), totalCount: rows.length };
  }
}

const createAct: TableButton<Row> = {
  name: 'Create run',
  icon: Add,
  visibility: { showWhenRowsSelected: false, showWhenNoRowsSelected: true },
  onClick: async () => undefined,
};

const deleteAct: TableButton<Row> = {
  name: 'Delete selected rows',
  icon: Delete,
  visibility: { showWhenRowsSelected: true, showWhenNoRowsSelected: false },
  onClick: async () => undefined,
};

describe('Table — row selection serves an act', () => {
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

  const render = async (buttons: TableButton<Row>[]) => {
    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <MemoryRouter>
            <Table<Row> title='Runs' columns={['name']} tableLoader={new StaticLoader()} buttons={buttons} />
          </MemoryRouter>
        </QueryClientProvider>
      );
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(container.textContent).toContain('first run');
  };

  const selectionControls = () =>
    container.querySelectorAll('input[aria-label="Select row"], input[aria-label="Select all"]');

  for (const phone of [false, true]) {
    const face = phone ? 'the phone card face' : 'the desktop table';

    it(`${face}: a create-only table draws no selection; its create act stays`, async () => {
      phoneMode = phone;
      await render([createAct]);

      expect(selectionControls().length).toBe(0);
      expect(container.querySelector('button[aria-label="Create run"]')).not.toBeNull();
    });

    it(`${face}: an act on the selection brings the selection column`, async () => {
      phoneMode = phone;
      await render([deleteAct, createAct]);

      expect(container.querySelectorAll('input[aria-label="Select row"]').length).toBe(rows.length);
    });
  }
});
