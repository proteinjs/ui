/**
 * @jest-environment jsdom
 *
 * `List`'s WINDOWED MODE (src/list/List.tsx, `windowed`) over the reservoir (src/list/PrependReservoir.ts) under a
 * MODELLED LAYOUT (the scroller suite's shape): jsdom lays nothing out, so the scroller's clientHeight, scrollHeight
 * and scrollTop and every box's rect are computed here from the document order, each row's declared height (`data-h`)
 * and the two spacers' inline styles. `scrollTop`'s setter is a spy — a write IS the outcome the laws forbid or allow —
 * and `getBoundingClientRect` is counted on the scroll path. The budgets the pins read: `LIST_WINDOW_SCREENS` (the
 * margin) and `PREPEND_SAFE_SCROLLER_LEAD_VIEWPORTS` (the lead — the library's one lead constant).
 *
 * The pins, as outcomes (the rows 3234 bar — a list that mounts every row is the class his finding names):
 *  1. THE MOUNTED DOM IS BOUNDED BY THE VIEWPORT: 1,000 loaded rows, at most the viewport plus a margin each side in
 *     the document (read from the DOM), the rows above as the reservoir, the rows below as the spacer; the scroll
 *     height is the whole list's; a jump to the middle mounts the middle.
 *  2. THE SCROLL PATH: a scroll event does no layout read and renders no row; the frame reads at most two rects and the
 *     offset; a scroll shorter than half the margin commits nothing; a longer one commits the moved window once.
 *  3. THE LEAD: the next window is asked while the loaded end is two viewports below the reader — never at the end, the
 *     sentinel untouched — once per read, re-judged at the landing; an under-filled lead chains at the opening.
 *  4. MEASURED ONCE: a row's height is measured on its mount and read from the map ever after — a scroll down and back
 *     through rows taller than the seed re-fetches nothing, re-measures nothing and writes nothing.
 *  5. THE LANDING LAW, RE-PINNED (the reservoir's laws 1–3 in the window's own words): rows mounting above the reader
 *     at heights other than their seeds hold the reader's row with no write in the commit; the correction lands at the
 *     engine's rest in ONE write, the row still holding.
 *  6. GROWTH ABOVE THE READER IS ABSORBED (law 4): a mounted row above the viewport that grows later moves nothing
 *     and writes nothing before the rest.
 *  7. GROUP HEADS: a group's head renders once; a group cut by the window keeps its container and its rows.
 *  8. NO GEOMETRY, EVERY ROW (the hidden pane; jsdom): without a box the list mounts every row as it always has, the
 *     sentinel still pulling; the window begins when the box arrives.
 */
import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { QueryClient, QueryClientProvider } from 'react-query';
import { CursorLoader, CursorValue, CursorWindow } from '../src/table/CursorLoader';
import { List, ListProps, LIST_WINDOW_SCREENS } from '../src/list/List';
import { PREPEND_SAFE_SCROLLER_LEAD_VIEWPORTS } from '../src/list/PrependSafeScroller';
import { ScrollRest } from '../src/list/ScrollRest';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// ── Frames: requestAnimationFrame as a manual pump. ──
const frameQueue: Array<{ id: number; cb: FrameRequestCallback }> = [];
let frameSeq = 0;
window.requestAnimationFrame = (cb: FrameRequestCallback) => {
  const id = ++frameSeq;
  frameQueue.push({ id, cb });
  return id;
};
window.cancelAnimationFrame = (id: number) => {
  const index = frameQueue.findIndex((frame) => frame.id === id);
  if (index >= 0) {
    frameQueue.splice(index, 1);
  }
};
const pumpFrames = (count: number) => {
  for (let k = 0; k < count; k++) {
    const batch = frameQueue.splice(0);
    batch.forEach((frame) => frame.cb(performance.now()));
  }
};

// ── IntersectionObserver stub: the sentinel's observer, never intersecting unless a case fires it. ──
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
    this.entry.callback([{ isIntersecting: false }]);
  }
  unobserve(target: Element) {
    this.entry.targets = this.entry.targets.filter((t) => t !== target);
  }
  disconnect() {
    this.entry.targets = [];
  }
}
(globalThis as any).IntersectionObserver = FakeIntersectionObserver;

// ── ResizeObserver stub: records targets and counts observe() per element; the first report follows observe(). ──
type ROCallback = (entries: ResizeObserverEntry[]) => void;
const observers: Array<{ callback: ROCallback; targets: Set<Element> }> = [];
const observeCounts = new Map<Element, number>();
class FakeResizeObserver {
  private readonly entry: { callback: ROCallback; targets: Set<Element> };
  constructor(callback: ROCallback) {
    this.entry = { callback, targets: new Set() };
    observers.push(this.entry);
  }
  observe(target: Element) {
    this.entry.targets.add(target);
    observeCounts.set(target, (observeCounts.get(target) ?? 0) + 1);
    this.entry.callback([entryFor(target)]);
  }
  unobserve(target: Element) {
    this.entry.targets.delete(target);
  }
  disconnect() {
    this.entry.targets.clear();
  }
}
const heightOf = (el: Element) => Number(el.getAttribute('data-h') ?? 0);
const entryFor = (target: Element, height = heightOf(target)): ResizeObserverEntry =>
  ({
    target,
    contentRect: { height, width: 390, top: 0, left: 0, bottom: height, right: 390, x: 0, y: 0, toJSON() {} },
    borderBoxSize: [{ blockSize: height, inlineSize: 390 }],
    contentBoxSize: [{ blockSize: height, inlineSize: 390 }],
    devicePixelContentBoxSize: [{ blockSize: height, inlineSize: 390 }],
  }) as unknown as ResizeObserverEntry;
(globalThis as any).ResizeObserver = FakeResizeObserver;
/** A row's box changes height: the attribute moves, then the observer reports it (the engine's order). */
const resize = (box: Element, height: number) => {
  box.setAttribute('data-h', String(height));
  observers.forEach((observer) => {
    if (observer.targets.has(box)) {
      observer.callback([entryFor(box)]);
    }
  });
};
/** The scroller's OWN box changes height (a pane laid out): reported to whoever observes the scroller. */
const boxResizes = (scroller: Element, height: number) => {
  clientHeight = height;
  observers.forEach((observer) => {
    if (observer.targets.has(scroller)) {
      observer.callback([entryFor(scroller, height)]);
    }
  });
};

// ── The layout model: the document order of the reservoir, the cell boxes (`data-h`) and the spacer below. ──
const CLIENT_HEIGHT = 600;
const ROW_H = 52;
let clientHeight = CLIENT_HEIGHT;
let scrollTopValue = 0;
const writes: number[] = [];
const layoutOf = (scroller: Element) => {
  const rects = new Map<Element, { top: number; bottom: number }>();
  let y = 0;
  scroller.querySelectorAll('[data-h], [data-list-reservoir], [data-list-below]').forEach((el) => {
    const style = (el as HTMLElement).style;
    let h = 0;
    let margin = 0;
    if (el.hasAttribute('data-list-reservoir')) {
      h = parseFloat(style.height) || 0;
      margin = parseFloat(style.marginBottom) || 0;
    } else if (el.hasAttribute('data-list-below')) {
      h = parseFloat(style.height) || 0;
    } else {
      h = heightOf(el);
    }
    rects.set(el, { top: y, bottom: y + h });
    y += h + margin;
  });
  return { rects, contentHeight: y };
};
const rect = (top: number, bottom: number): DOMRect =>
  ({ top, bottom, height: bottom - top, left: 0, right: 390, width: 390, x: 0, y: top, toJSON() {} }) as DOMRect;
const realRect = Element.prototype.getBoundingClientRect;
let rectReads = 0;
Element.prototype.getBoundingClientRect = function (this: Element): DOMRect {
  rectReads++;
  const scroller = this.closest('[data-model-scroller]');
  if (!scroller) {
    return realRect.call(this);
  }
  if (this === scroller) {
    return rect(0, clientHeight);
  }
  const layout = layoutOf(scroller);
  let entry = layout.rects.get(this);
  if (!entry) {
    // A container (the list's root): its top is its first laid-out descendant's.
    const inner = this.querySelector('[data-list-reservoir], [data-h], [data-list-below]');
    entry = inner ? layout.rects.get(inner) : undefined;
  }
  return entry ? rect(entry.top - scrollTopValue, entry.bottom - scrollTopValue) : rect(0, 0);
};
/** The scroller element takes the model's scroll geometry; its scrollTop setter is the write spy. */
const modelScroller = (el: HTMLElement) => {
  el.setAttribute('data-model-scroller', '');
  el.style.overflowY = 'auto';
  Object.defineProperty(el, 'clientHeight', { get: () => clientHeight, configurable: true });
  Object.defineProperty(el, 'scrollHeight', {
    get: () => Math.max(clientHeight, layoutOf(el).contentHeight),
    configurable: true,
  });
  Object.defineProperty(el, 'scrollTop', {
    get: () => scrollTopValue,
    set: (value: number) => {
      writes.push(value);
      scrollTopValue = Math.max(0, Math.min(value, Math.max(0, layoutOf(el).contentHeight - clientHeight)));
      el.dispatchEvent(new Event('scroll'));
    },
    configurable: true,
  });
};
/** The reader moves the view: the engine's own scroll, never a write. */
const readerScrollsTo = (scroller: HTMLElement, top: number) => {
  scrollTopValue = top;
  scroller.dispatchEvent(new Event('scroll'));
};

// ── The list under test: an in-memory corpus paged by offset cursors; each row's box declares its height. ──
type Row = { id: number; h: number };
const corpusOf = (count: number, h = ROW_H, tall: { from: number; to: number; h: number } | null = null): Row[] =>
  Array.from({ length: count }, (unused, id) => ({
    id,
    h: tall && id >= tall.from && id <= tall.to ? tall.h : h,
  }));
class CorpusLoader implements CursorLoader<Row> {
  loads: (CursorValue | null)[] = [];
  hold = false;
  private pending: Array<() => void> = [];
  constructor(
    public reactQueryKeys: { dataKey: string; dataQueryKey: string },
    private corpus: Row[]
  ) {}
  async loadWindow(cursor: CursorValue | null, windowSize: number): Promise<CursorWindow<Row>> {
    this.loads.push(cursor);
    if (this.hold) {
      await new Promise<void>((resolve) => this.pending.push(resolve));
    }
    const start = cursor === null ? 0 : (cursor as number);
    const rows = this.corpus.slice(start, start + windowSize);
    const end = start + rows.length;
    return { rows, nextCursor: end < this.corpus.length ? end : null };
  }
  release() {
    this.pending.splice(0).forEach((resolve) => resolve());
  }
}
let keySequence = 0;
const keys = () => ({ dataKey: `list-windowed-${Date.now()}-${keySequence++}`, dataQueryKey: 'list' });
const rowId = (r: Row) => r.id;
let renderCount = 0;
const renderRow = (r: Row) => {
  renderCount++;
  return <div data-h={r.h} data-row={r.id} />;
};
/** The margin's bound, in rows: the viewport plus a margin each side, plus the two cut rows at the edges. */
const BOUND = Math.ceil((CLIENT_HEIGHT * (1 + 2 * LIST_WINDOW_SCREENS)) / ROW_H) + 2;
/** The windowed option as the component takes it (cast: the pin's red run is against a List without the prop). */
const windowedProps = (options: object): Partial<ListProps<Row>> =>
  ({ windowed: options }) as unknown as Partial<ListProps<Row>>;

describe('List — the windowed mode over the reservoir', () => {
  let scroller: HTMLDivElement;
  let root: Root;
  let queryClient: QueryClient;

  const flush = async () => {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  };
  const waitFor = async (predicate: () => boolean, what: string) => {
    const deadline = Date.now() + 3000;
    while (!predicate()) {
      if (Date.now() > deadline) {
        throw new Error(
          `waitFor timed out: ${what} — mounted ${mountedIds().length} (${mountedIds()[0]}…${mountedIds()[mountedIds().length - 1]}), scrollHeight ${scroller.scrollHeight}, reservoir ${reservoirPx()}, below ${belowPx()}, scrollTop ${scrollTopValue}`
        );
      }
      await flush();
    }
  };
  /** One animation frame, its commits flushed. */
  const frame = async () => {
    await act(async () => {
      pumpFrames(1);
    });
  };
  const mountedIds = () =>
    Array.from(scroller.querySelectorAll('[data-row]')).map((el) => Number(el.getAttribute('data-row')));
  const reservoir = () => scroller.querySelector('[data-list-reservoir]') as HTMLElement;
  const below = () => scroller.querySelector('[data-list-below]') as HTMLElement;
  const reservoirPx = () =>
    (parseFloat(reservoir().style.height) || 0) + (parseFloat(reservoir().style.marginBottom) || 0);
  const belowPx = () => parseFloat(below().style.height) || 0;
  const boxOf = (id: number) => scroller.querySelector(`[data-row="${id}"]`) as HTMLElement;
  const topOf = (id: number) => boxOf(id).getBoundingClientRect().top;
  /** The reader's row: the first mounted row at least partly below the scroller's top edge. */
  const readerRow = () => mountedIds().find((id) => boxOf(id).getBoundingClientRect().bottom > 0.5) as number;

  const render = (element: React.ReactElement) => {
    act(() => {
      root.render(<QueryClientProvider client={queryClient}>{element}</QueryClientProvider>);
    });
  };
  const mountList = async (loader: CorpusLoader, windowSize: number, extra: Partial<ListProps<Row>> = {}) => {
    render(
      <List<Row>
        loader={loader}
        windowSize={windowSize}
        rowId={rowId}
        renderRow={renderRow}
        {...windowedProps({ estimatedRowHeight: ROW_H })}
        {...extra}
      />
    );
    await waitFor(() => loader.loads.length >= 1 && scroller.querySelector('[data-row]') !== null, 'the first window');
  };

  beforeEach(() => {
    ioInstances.length = 0;
    observers.length = 0;
    observeCounts.clear();
    frameQueue.length = 0;
    writes.length = 0;
    renderCount = 0;
    rectReads = 0;
    clientHeight = CLIENT_HEIGHT;
    scrollTopValue = 0;
    scroller = document.createElement('div');
    modelScroller(scroller);
    document.body.appendChild(scroller);
    root = createRoot(scroller);
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    queryClient.clear();
    scroller.remove();
  });

  test('1. the mounted DOM is bounded by the viewport: 1,000 rows loaded, at most the viewport plus a margin each side in the document; the rest as the two spacers', async () => {
    const loader = new CorpusLoader(keys(), corpusOf(1000));
    await mountList(loader, 1000);
    await frame();
    const atTop = mountedIds();
    expect(atTop.length).toBeLessThanOrEqual(BOUND);
    expect(atTop[0]).toBe(0);
    expect(reservoirPx()).toBe(0);
    expect(belowPx()).toBe((1000 - atTop.length) * ROW_H);
    expect(scroller.scrollHeight).toBe(1000 * ROW_H);
    // The viewport covered, with the margin beyond it.
    expect(boxOf(atTop[atTop.length - 1]).getBoundingClientRect().bottom).toBeGreaterThanOrEqual(CLIENT_HEIGHT);

    // A jump to the middle: the middle mounts, the rows above stand as the reservoir, the whole height unchanged.
    readerScrollsTo(scroller, 26_000);
    await frame();
    const middle = mountedIds();
    expect(middle.length).toBeLessThanOrEqual(BOUND);
    expect(middle[0]).toBe(Math.floor((26_000 - CLIENT_HEIGHT * LIST_WINDOW_SCREENS) / ROW_H));
    expect(reservoirPx()).toBe(middle[0] * ROW_H);
    expect(belowPx()).toBe((1000 - middle[0] - middle.length) * ROW_H);
    expect(scroller.scrollHeight).toBe(1000 * ROW_H);
    expect(topOf(middle[0])).toBeLessThanOrEqual(0);
    expect(boxOf(middle[middle.length - 1]).getBoundingClientRect().bottom).toBeGreaterThanOrEqual(CLIENT_HEIGHT);
    expect(writes).toEqual([]);
  });

  test('2. the scroll path: a scroll event reads no layout and renders no row; the frame reads at most two rects; a scroll under half the margin commits nothing, a longer one commits the window once', async () => {
    const loader = new CorpusLoader(keys(), corpusOf(1000));
    await mountList(loader, 1000);
    await frame();
    const before = mountedIds();
    const rendersBefore = renderCount;

    // Twenty scroll events, no frame between them: nothing read, nothing rendered.
    rectReads = 0;
    for (let k = 1; k <= 20; k++) {
      readerScrollsTo(scroller, k * 10);
    }
    expect(rectReads).toBe(0);
    expect(renderCount).toBe(rendersBefore);
    expect(mountedIds()).toEqual(before);

    // The frame: at most two rects (the list's offset in its scroller) and no commit — 200 px is under half the margin.
    rectReads = 0;
    await frame();
    expect(rectReads).toBeLessThanOrEqual(2);
    expect(renderCount).toBe(rendersBefore);
    expect(mountedIds()).toEqual(before);

    // Past half the margin: one commit moves the window; the rows that stayed render nothing, the new ones once each.
    readerScrollsTo(scroller, CLIENT_HEIGHT * LIST_WINDOW_SCREENS * 0.5 + 200);
    await frame();
    const after = mountedIds();
    expect(after).not.toEqual(before);
    expect(after.length).toBeLessThanOrEqual(BOUND);
    const newRows = after.filter((id) => !before.includes(id));
    expect(renderCount - rendersBefore).toBe(newRows.length);
    expect(reservoirPx()).toBe(after[0] * ROW_H);
    expect(writes).toEqual([]);
  });

  test('3. the lead: the next window is asked two viewports before the loaded end — not at the end, the sentinel untouched — once per read, re-judged at the landing; an under-filled lead chains at the opening', async () => {
    const loader = new CorpusLoader(keys(), corpusOf(100));
    await mountList(loader, 30);
    expect(loader.loads).toEqual([null]);
    // The opening frame: 30 rows (1560 px) leave the loaded end 960 px below the viewport — inside the lead of
    // 2 × 600 — so the second window is asked at once, with no sentinel intersection.
    await frame();
    await waitFor(() => loader.loads.length === 2, 'the opening ask (loads 2)');
    await waitFor(
      () => mountedIds().length > 0 && scroller.scrollHeight === 60 * ROW_H,
      'the second window landed (60 rows)'
    );
    expect(loader.loads).toEqual([null, 30]);
    // Re-judged at the landing: 3120 − 600 = 2520 ≥ the lead — no third ask, however many frames pass.
    await frame();
    await frame();
    await flush();
    expect(loader.loads).toEqual([null, 30]);

    // The reader at 1400: the end is 1120 px below the viewport's bottom (the sentinel nowhere near) — asked.
    loader.hold = true;
    readerScrollsTo(scroller, 1400);
    await frame();
    await waitFor(() => loader.loads.length === 3, 'the ask at 1400 (loads 3)');
    expect(loader.loads).toEqual([null, 30, 60]);
    const lead = PREPEND_SAFE_SCROLLER_LEAD_VIEWPORTS * CLIENT_HEIGHT;
    expect(scroller.scrollHeight - (1400 + CLIENT_HEIGHT)).toBeLessThan(lead);
    expect(scroller.scrollHeight - (1400 + CLIENT_HEIGHT)).toBeGreaterThan(0);
    // In flight: scroll events and frames ask nothing more.
    readerScrollsTo(scroller, 1500);
    await frame();
    readerScrollsTo(scroller, 1600);
    await frame();
    expect(loader.loads.length).toBe(3);
    // The landing reopens the gate and re-judges: 4680 − 2200 = 2480 ≥ the lead — nothing asked.
    loader.hold = false;
    await act(async () => {
      loader.release();
    });
    await waitFor(() => scroller.scrollHeight === 90 * ROW_H, 'the third window landed (90 rows)');
    await frame();
    await flush();
    expect(loader.loads.length).toBe(3);
    // Near the end the last (short) window lands and the list is exhausted: no further ask.
    readerScrollsTo(scroller, 90 * ROW_H - CLIENT_HEIGHT - 100);
    await frame();
    await waitFor(() => loader.loads.length === 4, 'the ask near the end (loads 4)');
    await waitFor(() => scroller.scrollHeight === 100 * ROW_H, 'the last window landed (100 rows)');
    readerScrollsTo(scroller, 100 * ROW_H - CLIENT_HEIGHT);
    await frame();
    await flush();
    expect(loader.loads).toEqual([null, 30, 60, 90]);
    expect(scroller.querySelector('[data-list-sentinel]')).toBeNull();
  });

  test('4. measured once: rows taller than the seed, scrolled past and back, re-fetch nothing, re-measure nothing from the seed and write nothing; the reservoir sizes them by their measure', async () => {
    const tall = { from: 0, to: 9, h: 80 };
    const loader = new CorpusLoader(keys(), corpusOf(300, ROW_H, tall));
    await mountList(loader, 300);
    await frame();
    expect(scroller.scrollHeight).toBe(10 * 80 + 290 * ROW_H);
    const firstMountBoxes = mountedIds().map((id) => boxOf(id));
    firstMountBoxes.forEach((box) => expect(observeCounts.get(box)).toBe(1));

    readerScrollsTo(scroller, 10_000);
    await frame();
    const deep = mountedIds();
    expect(deep[0]).toBeGreaterThan(10);
    // The rows above by their MEASURED heights: the ten tall ones at 80, the rest at the seed.
    expect(reservoirPx()).toBe(10 * 80 + (deep[0] - 10) * ROW_H);

    for (let top = 9_000; top >= 0; top -= 400) {
      readerScrollsTo(scroller, top);
      await frame();
    }
    await frame();
    const backAtTop = mountedIds();
    expect(backAtTop[0]).toBe(0);
    expect(reservoirPx()).toBe(0);
    expect(loader.loads).toEqual([null]);
    expect(writes).toEqual([]);
    expect(scroller.scrollHeight).toBe(10 * 80 + 290 * ROW_H);
    // Every mounted element was observed exactly once — a measure per mount, never per scroll event.
    backAtTop.forEach((id) => expect(observeCounts.get(boxOf(id))).toBe(1));
  });

  test('5. the landing law: rows mounting above the reader at heights other than the map’s hold the reader’s row with no write in the commit; the correction lands at the rest in ONE write, the row still holding', async () => {
    const corpus = corpusOf(300);
    const loader = new CorpusLoader(keys(), corpus);
    await mountList(loader, 300);
    await frame();
    readerScrollsTo(scroller, 3_000);
    await frame();
    expect(mountedIds()[0]).toBeGreaterThan(10);
    expect(reservoirPx()).toBe(mountedIds()[0] * ROW_H);
    // While they are out of the window the first ten rows change: they will mount at 80 where the map holds 52 — the
    // shape of a row re-entering the window at a height the map does not know (a row that changed, a seed after a jump).
    for (let id = 0; id <= 9; id++) {
      corpus[id].h = 80;
    }

    // The reader scrolls up toward the top, a frame per step: at every commit the reader's row keeps its offset.
    for (let top = 2_600; top >= 0; top -= 300) {
      readerScrollsTo(scroller, top);
      const anchor = readerRow();
      const offset = topOf(anchor);
      await frame();
      expect(mountedIds()).toContain(anchor);
      expect(Math.abs(topOf(anchor) - offset)).toBeLessThanOrEqual(0.5);
      expect(writes).toEqual([]);
    }
    // At the top the tall rows are in the document at 80 and the reservoir carries the debt — the held geometry.
    expect(mountedIds()[0]).toBe(0);
    const anchor = readerRow();
    const offset = topOf(anchor);
    expect(reservoirPx()).toBeLessThan(0);

    // The rest: QUIET_FRAMES quiet frames — ONE write, the reader's row still at its offset, the debt paid.
    await act(async () => {
      pumpFrames(ScrollRest.QUIET_FRAMES + 1);
    });
    expect(writes.length).toBe(1);
    expect(Math.abs(topOf(anchor) - offset)).toBeLessThanOrEqual(0.5);
    expect(reservoirPx()).toBe(0);
    expect(scroller.scrollHeight).toBe(10 * 80 + 290 * ROW_H);
  });

  test('6. growth above the reader is absorbed: a mounted row above the viewport that grows later moves nothing and writes nothing; the rest pays it with one write, the row holding', async () => {
    const loader = new CorpusLoader(keys(), corpusOf(300));
    await mountList(loader, 300);
    await frame();
    readerScrollsTo(scroller, 2_000);
    await frame();
    await act(async () => {
      pumpFrames(ScrollRest.QUIET_FRAMES + 1); // at rest, nothing owed
    });
    expect(writes).toEqual([]);
    const above = mountedIds()[0];
    expect(boxOf(above).getBoundingClientRect().bottom).toBeLessThan(0);
    const anchor = readerRow();
    const offset = topOf(anchor);

    await act(async () => {
      resize(boxOf(above), ROW_H + 40);
    });
    expect(Math.abs(topOf(anchor) - offset)).toBeLessThanOrEqual(0.5);
    expect(writes).toEqual([]);
    // A row BELOW the reader growing does nothing to the reservoir.
    const last = mountedIds()[mountedIds().length - 1];
    await act(async () => {
      resize(boxOf(last), ROW_H + 40);
    });
    expect(Math.abs(topOf(anchor) - offset)).toBeLessThanOrEqual(0.5);
    expect(writes).toEqual([]);

    await act(async () => {
      pumpFrames(ScrollRest.QUIET_FRAMES + 1);
    });
    expect(writes.length).toBe(1);
    expect(Math.abs(topOf(anchor) - offset)).toBeLessThanOrEqual(0.5);
    // The measure stands: once the grown row leaves the window, the reservoir counts it at its new height.
    readerScrollsTo(scroller, 4_000);
    await frame();
    const first = mountedIds()[0];
    expect(first).toBeGreaterThan(last);
    expect(reservoirPx()).toBe((first - 2) * ROW_H + 2 * (ROW_H + 40));
  });

  test('7. group heads: a group’s head renders once per commit; a group cut by the window keeps its container and its mounted rows', async () => {
    const loader = new CorpusLoader(keys(), corpusOf(1000));
    const HEAD_H = 40;
    const headRenders = new Map<string, number>();
    await mountList(loader, 1000, {
      groupKey: (r: Row) => `g${Math.floor(r.id / 50)}`,
      renderGroupHeader: (key: string) => {
        headRenders.set(key, (headRenders.get(key) ?? 0) + 1);
        return <div data-h={HEAD_H} data-head={key} />;
      },
      ...windowedProps({ estimatedRowHeight: ROW_H, estimatedGroupHeaderHeight: HEAD_H }),
    });
    await frame();
    readerScrollsTo(scroller, 3_000);
    await frame();
    headRenders.clear();
    readerScrollsTo(scroller, 6_000);
    await frame();
    const heads = Array.from(scroller.querySelectorAll('[data-head]')).map((el) => el.getAttribute('data-head'));
    expect(new Set(heads).size).toBe(heads.length);
    heads.forEach((key) => expect(headRenders.get(key as string)).toBe(1));
    // The window's first group is cut: its rows are mounted without its head, inside their own container.
    const ids = mountedIds();
    const firstGroupIndex = Math.floor(ids[0] / 50);
    expect(ids[0] % 50).not.toBe(0);
    expect(heads).not.toContain(`g${firstGroupIndex}`);
    // cell wrapper > the rows box > the group box: the cut group's container holds exactly its mounted rows, no head.
    const container = boxOf(ids[0]).parentElement?.parentElement?.parentElement as HTMLElement;
    expect(container.querySelector('[data-head]')).toBeNull();
    expect(container.querySelectorAll('[data-row]').length).toBe(
      ids.filter((id) => Math.floor(id / 50) === firstGroupIndex).length
    );
    // The whole height counts every head and every row.
    expect(scroller.scrollHeight).toBe(1000 * ROW_H + 20 * HEAD_H);
    expect(writes).toEqual([]);
  });

  test('8. no geometry, every row: without a box the list mounts every row as it always has and the sentinel still pulls; the window begins when the box arrives', async () => {
    clientHeight = 0;
    const loader = new CorpusLoader(keys(), corpusOf(100));
    await mountList(loader, 30);
    await frame();
    expect(mountedIds().length).toBe(30);
    expect(reservoirPx()).toBe(0);
    expect(belowPx()).toBe(0);
    // The sentinel's pull — the as-built road — still lands the next window.
    await act(async () => {
      const live = [...ioInstances].reverse().find((entry) => entry.targets.length > 0);
      live?.callback([{ isIntersecting: true }]);
    });
    await waitFor(() => mountedIds().length === 60, 'the sentinel pull (60 rows)');
    expect(loader.loads).toEqual([null, 30]);

    // The box arrives: the window begins, bounded.
    boxResizes(scroller, CLIENT_HEIGHT);
    await frame();
    expect(mountedIds().length).toBeLessThanOrEqual(BOUND);
    expect(mountedIds()[0]).toBe(0);
    expect(belowPx()).toBe((60 - mountedIds().length) * ROW_H);
  });
});
