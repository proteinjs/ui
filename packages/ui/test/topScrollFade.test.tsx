/**
 * @jest-environment jsdom
 *
 * The top-edge scroll fade (founder ruling, admin round 3 — record scrollers adopt the house
 * scroll-container behavior). Contract under test, as OUTCOMES:
 *  1. SELF-WIRING: mounted as the first child of an overflow element, the band drives its own
 *     visibility from THAT element's scroll position — hidden at rest, shown once content is
 *     scrolled off above, hidden again back at the top.
 *  2. TABLE WIRING: `topScrollFade` is opt-in — absent by default; enabled, the band rides
 *     Table's own scroll container as its first child.
 */
import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from 'react-query';
import { TopScrollFade } from '../src/components/TopScrollFade';
import { Table } from '../src/table/Table';
import type { TableLoader, RowWindow } from '../src/table/TableLoader';

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

const band = (scope: ParentNode) => scope.querySelector<HTMLElement>('[data-top-scroll-fade]');
const isShown = (scope: ParentNode) => band(scope)?.getAttribute('data-shown') === 'true';

const scrollTo = async (el: HTMLElement, top: number) => {
  await act(async () => {
    el.scrollTop = top;
    el.dispatchEvent(new Event('scroll'));
  });
};

describe('TopScrollFade — self-wired visibility', () => {
  let scroller: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    scroller = document.createElement('div');
    document.body.appendChild(scroller);
    root = createRoot(scroller);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    scroller.remove();
  });

  const mount = async () => {
    await act(async () => {
      root.render(
        <>
          <TopScrollFade />
          <div>row content</div>
        </>
      );
    });
  };

  it('hidden at rest, shown once scrolled, hidden again at the top', async () => {
    await mount();
    expect(band(scroller)).toBeTruthy();
    expect(isShown(scroller)).toBe(false);

    await scrollTo(scroller, 1);
    expect(isShown(scroller)).toBe(true);

    await scrollTo(scroller, 0);
    expect(isShown(scroller)).toBe(false);
  });

  it('renders in the right state immediately when mounted over an already-scrolled container', async () => {
    scroller.scrollTop = 40;
    await mount();
    expect(isShown(scroller)).toBe(true);
  });
});

// ── Table integration: the opt-in prop mounts the band on Table's own scroller ────────────────

type Row = { description: string };
const allRows: Row[] = Array.from({ length: 30 }, (_, i) => ({ description: `Row ${i + 1}` }));

class StaticLoader implements TableLoader<Row> {
  reactQueryKeys = { dataKey: `top-fade-test-${Date.now()}-${Math.random()}`, dataQueryKey: 'all' };
  async load(startIndex: number, endIndex: number): Promise<RowWindow<Row>> {
    return { rows: allRows.slice(startIndex, endIndex), totalCount: allRows.length };
  }
}

describe('Table — topScrollFade prop', () => {
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

  const mount = async (topScrollFade?: boolean) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, cacheTime: 0 } } });
    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <MemoryRouter>
            <Table<Row>
              title='Rows'
              columns={['description']}
              tableLoader={new StaticLoader()}
              topScrollFade={topScrollFade}
            />
          </MemoryRouter>
        </QueryClientProvider>
      );
    });
    await act(async () => {
      await Promise.resolve();
    });
  };

  it('is opt-in: no fade band unless the prop is set', async () => {
    await mount();
    expect(band(container)).toBeNull();
  });

  it('when enabled, the band is the first child of the table scroller and flips with its scroll', async () => {
    await mount(true);
    const fade = band(container);
    expect(fade).toBeTruthy();

    // The band wires itself to its parent — Table's scroll container — and leads its content.
    const scroller = fade!.parentElement as HTMLElement;
    expect(scroller.getAttribute('data-table-scroll-container')).not.toBeNull();
    expect(scroller.firstElementChild).toBe(fade);

    expect(isShown(container)).toBe(false);
    await scrollTo(scroller, 120);
    expect(isShown(container)).toBe(true);
    await scrollTo(scroller, 0);
    expect(isShown(container)).toBe(false);
  });
});
