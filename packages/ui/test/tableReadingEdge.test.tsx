/**
 * @jest-environment jsdom
 *
 * ON THE PHONE POSTURE the table has one reading edge. Its title and its rows start at the same
 * distance from the table's side — a title that starts a few pixels inside its rows reads as a
 * misaligned header on a full-bleed phone page, where the table's side is the screen's. The
 * desktop posture is NOT part of that change: it renders exactly what it rendered before.
 *
 * Contracts as rendered OUTCOMES (the edge is measured from the emitted styles, `ReadingEdge`):
 *  1. Phone, a 390-wide container: the title starts at 16, and so does each row's first line.
 *  2. Phone, rows selected: the selection count takes the title's seat at the same 16.
 *  3. Phone held sideways (844 wide — past the framework toolbar's 600px re-padding): still 16.
 *  4. Desktop, light and dark, selected or not: the toolbar's face — every declaration it emits,
 *     the title cell's inline style, the measured edges at 1440, at the 600px line and in a
 *     narrow desktop window — equals the recording taken from the revision the phone change
 *     started from (`TableDesktopFace`, test/recordings/tableDesktopFace.json). The title sits
 *     at 28 at 1440, as it did.
 */
import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from 'react-query';
import { ThemeProvider, createTheme } from '@mui/material';
import { Delete } from '@mui/icons-material';
import { Table } from '../src/table/Table';
import type { TableLoader, RowWindow } from '../src/table/TableLoader';
import type { TableButton } from '../src/table/TableButton';
import { ReadingEdge } from './ReadingEdge';
import { TableDesktopFace, TableDesktopFaceRecording } from './TableDesktopFace';

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
const PHONE_SIDEWAYS_WIDTH = 844;
const DESKTOP_WIDTH = 1440;
const READING_EDGE = 16;
/** Where the desktop title sat before the phone change, and sits still. */
const DESKTOP_TITLE_EDGE = 28;

type PaletteMode = 'light' | 'dark';
const DESKTOP_STATES: { mode: PaletteMode; selected: boolean }[] = [
  { mode: 'light', selected: false },
  { mode: 'light', selected: true },
  { mode: 'dark', selected: false },
  { mode: 'dark', selected: true },
];
const stateKey = (state: { mode: PaletteMode; selected: boolean }) =>
  `${state.mode}/${state.selected ? 'selected' : 'unselected'}`;

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

  const render = async (
    width: number,
    props: Partial<React.ComponentProps<typeof Table<Row>>> = {},
    mode: PaletteMode = 'light'
  ) => {
    container.style.width = `${width}px`;
    await act(async () => {
      root.render(
        <ThemeProvider theme={createTheme({ palette: { mode } })}>
          <QueryClientProvider client={client}>
            <MemoryRouter>
              <Table<Row> title='Migration' columns={['name', 'status']} tableLoader={new StaticLoader()} {...props} />
            </MemoryRouter>
          </QueryClientProvider>
        </ThemeProvider>
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

  it('phone held sideways: past the 600px line the title, the count and the rows still start at 16', async () => {
    phoneMode = true;
    await render(PHONE_SIDEWAYS_WIDTH, { buttons: [deleteButton] });
    const edge = new ReadingEdge(PHONE_SIDEWAYS_WIDTH);

    expect(container.querySelectorAll('[data-table-phone-row]').length).toBe(2);
    expect(edge.of(textElement('roles backfill'), container)).toBe(READING_EDGE);
    expect(edge.of(textElement('Migration'), container)).toBe(READING_EDGE);

    const checkbox = container.querySelector('[data-table-phone-row] input[type="checkbox"]') as HTMLInputElement;
    await act(async () => {
      checkbox.click();
    });
    expect(edge.of(textElement('1 rows selected'), container)).toBe(READING_EDGE);
  });

  /** Renders the desktop posture in one state and reads its toolbar face. */
  const desktopFace = async (state: { mode: PaletteMode; selected: boolean }) => {
    phoneMode = false;
    await render(DESKTOP_WIDTH, { buttons: [deleteButton] }, state.mode);
    if (state.selected) {
      const checkbox = container.querySelector('tbody input[type="checkbox"]') as HTMLInputElement;
      await act(async () => {
        checkbox.click();
      });
    }

    return TableDesktopFace.of(container);
  };

  const recordingRevision = TableDesktopFace.recordingRevision();
  if (recordingRevision) {
    it(`records the desktop face from ${recordingRevision}`, async () => {
      const recording: TableDesktopFaceRecording = { recordedFrom: recordingRevision, states: {} };
      for (const state of DESKTOP_STATES) {
        recording.states[stateKey(state)] = await desktopFace(state);
        act(() => root.unmount());
        root = createRoot(container);
      }

      TableDesktopFace.write(recording);
    });

    return;
  }

  it.each(DESKTOP_STATES.map((state) => [stateKey(state), state] as const))(
    'desktop %s: the toolbar face is the recording — nothing the phone change touched moved',
    async (key, state) => {
      const recorded = TableDesktopFace.recording().states[key];
      const face = await desktopFace(state);

      expect(recorded.edges[String(DESKTOP_WIDTH)].seatText).toBe(DESKTOP_TITLE_EDGE);
      expect(face.edges[String(DESKTOP_WIDTH)].seatText).toBe(recorded.edges[String(DESKTOP_WIDTH)].seatText);
      expect(face).toEqual(recorded);
    }
  );
});
