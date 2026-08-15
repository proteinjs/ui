/**
 * @jest-environment jsdom
 *
 * The shared back-to-top affordance (Task #60): one visual/behavioral system for long lists,
 * consumed by Table behind an opt-in prop. Contract under test, as OUTCOMES:
 *  1. THRESHOLD: the button is inert until the scroller passes `showAfterPx`, active after,
 *     and inert again when the user returns to the top.
 *  2. CLICK: activating the button returns the scroller to position 0 (the outcome is the
 *     scroller's position, not "a handler was called").
 *  3. TABLE WIRING: `scrollTopButton` is opt-in — absent by default, and when enabled it is
 *     wired to Table's own scroll container.
 *  4. CONTROLLED MODE: surfaces with their own trigger/action (chat's jump-to-bottom, the
 *     thought editor's tour-yielding back-to-top) drive `visible`/`onClick` — the controlled
 *     value wins over any internal threshold watching, and the override action runs on click.
 */
import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from 'react-query';
import { ScrollTopButton } from '../src/components/ScrollTopButton';
import { Table } from '../src/table/Table';
import type { TableLoader, RowWindow } from '../src/table/TableLoader';
import { List } from '../src/list/List';
import type { CursorLoader, CursorValue, CursorWindow } from '../src/table/CursorLoader';

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// IntersectionObserver stub (jsdom has none) — Table's InfiniteScroll constructs one.
class FakeIntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as any).IntersectionObserver = FakeIntersectionObserver;

/** jsdom's HTMLElement has no scrollTo — model it as "jump to the requested position". */
const stubScrollTo = (el: HTMLElement) => {
  (el as any).scrollTo = ({ top }: { top: number }) => {
    el.scrollTop = top;
  };
};

const scrollTo = async (el: HTMLElement, top: number) => {
  await act(async () => {
    el.scrollTop = top;
    el.dispatchEvent(new Event('scroll'));
  });
};

const button = (container: HTMLElement) =>
  container.querySelector<HTMLButtonElement>('button[aria-label="Back to top"]');
const isActive = (container: HTMLElement) => button(container)?.getAttribute('data-shown') === 'true';
const click = async (container: HTMLElement) => {
  await act(async () => {
    button(container)!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
};

describe('ScrollTopButton — threshold and click outcomes', () => {
  let container: HTMLDivElement;
  let scroller: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    scroller = document.createElement('div');
    document.body.appendChild(scroller);
    stubScrollTo(scroller);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    scroller.remove();
  });

  const mount = async () => {
    await act(async () => {
      root.render(<ScrollTopButton scrollContainer={scroller} />);
    });
  };

  it('stays inert until the scroller passes the threshold, activates after, retires back at the top', async () => {
    await mount();
    expect(isActive(container)).toBe(false);

    // At the threshold exactly: still inert (the contract is "past" the threshold).
    await scrollTo(scroller, 36);
    expect(isActive(container)).toBe(false);

    // Past it: active.
    await scrollTo(scroller, 37);
    expect(isActive(container)).toBe(true);

    // Back at the top: inert again.
    await scrollTo(scroller, 0);
    expect(isActive(container)).toBe(false);
  });

  it('renders in the right state immediately when mounted over an already-scrolled container', async () => {
    scroller.scrollTop = 500;
    await mount();
    expect(isActive(container)).toBe(true);
  });

  it('click returns the scroller to the top', async () => {
    await mount();
    await scrollTo(scroller, 500);
    expect(isActive(container)).toBe(true);

    await click(container);
    // The OUTCOME: the scroller is back at position 0.
    expect(scroller.scrollTop).toBe(0);
  });

  it('controlled mode: `visible` wins over the threshold, `onClick` replaces the default action', async () => {
    // The chat shape: shown while away from the bottom (even at scrollTop 0), and activation
    // runs the surface's own scroll behavior instead of scroll-to-top.
    let scrolledByOverride = false;
    await act(async () => {
      root.render(
        <ScrollTopButton
          scrollContainer={scroller}
          visible={true}
          onClick={() => {
            scrolledByOverride = true;
            scroller.scrollTop = 999;
          }}
        />
      );
    });
    // scrollTop is 0 — the internal threshold would hide it; the controlled value shows it.
    expect(scroller.scrollTop).toBe(0);
    expect(isActive(container)).toBe(true);

    await click(container);
    // The OUTCOME: the override ran (and the default scroll-to-top did NOT reset the position).
    expect(scrolledByOverride).toBe(true);
    expect(scroller.scrollTop).toBe(999);

    // And controlled-hidden stays hidden regardless of scroll depth.
    await act(async () => {
      root.render(<ScrollTopButton scrollContainer={scroller} visible={false} />);
    });
    await scrollTo(scroller, 500);
    expect(isActive(container)).toBe(false);
  });
});

// ── Table integration: the opt-in prop wires the button to Table's own scroller ───────────────

type Row = { description: string };
const allRows: Row[] = Array.from({ length: 30 }, (_, i) => ({ description: `Row ${i + 1}` }));

class StaticLoader implements TableLoader<Row> {
  reactQueryKeys = { dataKey: `scroll-top-test-${Date.now()}-${Math.random()}`, dataQueryKey: 'all' };
  async load(startIndex: number, endIndex: number): Promise<RowWindow<Row>> {
    return { rows: allRows.slice(startIndex, endIndex), totalCount: allRows.length };
  }
}

describe('Table — scrollTopButton prop', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  const mount = async (scrollTopButton?: boolean) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, cacheTime: 0 } } });
    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <MemoryRouter>
            <Table<Row>
              title='Rows'
              columns={['description']}
              tableLoader={new StaticLoader()}
              scrollTopButton={scrollTopButton}
            />
          </MemoryRouter>
        </QueryClientProvider>
      );
    });
    await act(async () => {
      await Promise.resolve();
    });
  };

  it('is opt-in: no back-to-top button unless the prop is set', async () => {
    await mount();
    expect(button(container)).toBeNull();
  });

  it('when enabled, the button watches and scrolls the TABLE scroller', async () => {
    await mount(true);
    const btn = button(container);
    expect(btn).toBeTruthy();

    // The button's host strip is rendered as the sibling immediately after Table's scroll
    // container — resolve the scroller structurally and drive it.
    const scroller = btn!.parentElement!.previousElementSibling as HTMLElement;
    expect(scroller).toBeTruthy();
    stubScrollTo(scroller);

    await scrollTo(scroller, 200);
    expect(isActive(container)).toBe(true);

    await click(container);
    // The OUTCOME: Table's scroller is back at the top, and the button retires on the next scroll.
    expect(scroller.scrollTop).toBe(0);
    await scrollTo(scroller, 0);
    expect(isActive(container)).toBe(false);
  });
});

// ── List integration: the opt-in prop discovers the CONSUMER'S scroller ───────────────────────
// Unlike Table, List renders inside the consumer's scroll container rather than owning one, so
// the wiring finds the nearest scrollable ancestor in the DOM and drives that element.

type ListRow = { id: string };
const listRows: ListRow[] = Array.from({ length: 12 }, (_, i) => ({ id: `row-${i + 1}` }));

/** One exhausted window — the button wiring under test needs rows, not windowing. */
class OneWindowLoader implements CursorLoader<ListRow> {
  reactQueryKeys = { dataKey: `list-scroll-top-test-${Date.now()}-${Math.random()}`, dataQueryKey: 'all' };
  async loadWindow(_cursor: CursorValue | null, _windowSize: number): Promise<CursorWindow<ListRow>> {
    return { rows: listRows, nextCursor: null };
  }
}

describe('List — scrollTopButton prop', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  const mount = async (scrollTopButton?: boolean) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, cacheTime: 0 } } });
    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          {/* The consumer's scroller, with a non-scrollable layer between it and List — the
              wiring must walk UP to the real scroll container, not grab the direct parent. */}
          <div data-test-scroller style={{ overflowY: 'auto' }}>
            <div>
              <List<ListRow>
                loader={new OneWindowLoader()}
                windowSize={20}
                rowId={(row) => row.id}
                renderRow={(row) => <div data-test-row>{row.id}</div>}
                scrollTopButton={scrollTopButton}
              />
            </div>
          </div>
        </QueryClientProvider>
      );
    });
    await act(async () => {
      await Promise.resolve();
    });
  };

  it('is opt-in: no back-to-top button unless the prop is set', async () => {
    await mount();
    expect(container.querySelectorAll('[data-test-row]').length).toBe(listRows.length);
    expect(button(container)).toBeNull();
  });

  it('when enabled, the button watches and scrolls the discovered ancestor scroller', async () => {
    await mount(true);
    expect(container.querySelectorAll('[data-test-row]').length).toBe(listRows.length);
    expect(button(container)).toBeTruthy();

    const scroller = container.querySelector<HTMLElement>('[data-test-scroller]')!;
    stubScrollTo(scroller);

    // Inert at the top, active once the CONSUMER'S scroller passes the threshold.
    expect(isActive(container)).toBe(false);
    await scrollTo(scroller, 200);
    expect(isActive(container)).toBe(true);

    await click(container);
    // The OUTCOME: the consumer's scroller is back at the top, and the button retires.
    expect(scroller.scrollTop).toBe(0);
    await scrollTo(scroller, 0);
    expect(isActive(container)).toBe(false);
  });
});
