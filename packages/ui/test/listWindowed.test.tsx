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
 *  9. HIDDEN AFTER A WINDOW, THEN SHOWN (round 2 — the refuter's R1/R2): a pane whose box goes to 0 after a window
 *     stood mounts every row as 8 says, and the FIRST frame with the box back resumes the window, bounded — from the
 *     top and from the middle at the same offset; the reservoir is the rows above the window alone (no drift absorbed
 *     against the hidden layout) and nothing is written.
 * 10. THE HIDDEN INTERVAL (round 3 — the refuter's R4/R5/R6; the display:none shape in full: the box's observer AND the
 *     cells' zero report and re-report, in the spec's order): while the box is 0 and until the first frame after it
 *     returns, no judgment against layout — the anchors neither recorded nor read, a cell's report a measurement never
 *     growth, no reconcile step — so a show at the end, from the middle and at the top resumes the window on the first
 *     frame with the reservoir the rows above it, nothing absorbed (the paint the show's reports leave is the hidden
 *     one), nothing written, the reader's row held; a debt the hide interrupted stands through the interval and is
 *     paid at the first rest after the show, in one write.
 *     Round 4 (the refuter's R7/R17b), the scroller BELOW A BAR (the real Home: the greeting and the pins above the
 *     list — at viewport top 0 a hide whose cells report before its box absorbs nothing): a cell's ZERO under the box
 *     of 0 is no measurement — the map keeps its last real height, so a reveal staged over two commits (the box back
 *     and its first frame before the cells' re-report) derives that frame's window from the rows' heights (10e); and
 *     the box's observer is created before the cells', so the hide's one broadcast opens the interval before a cell
 *     reports under it (10f — red when the order is swapped).
 * 11. THE RETURN TO THE TOP (row 3435 — his finding on test, 2026-11-11: on his phone one press of Home's back-to-top
 *     ended short of the top). Under an engine that ANCHORS (WebKit on iOS 27 — the model below): several screens down,
 *     ONE press, the motion settled — the scroller at its top, the first row first in view, nothing written (11a);
 *     nothing is held through the return — a debt standing at the press is released, rows re-entering at heights other
 *     than the map's and a row above growing are layout, never growth to absorb — so the scroll's end IS the list's top
 *     (11b); the return ends at the top's rest and at the reader's own arm, and from there the list holds again and the
 *     engine's anchoring has its rows back (11c).
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

// ── ResizeObserver stub: records targets and counts observe() per element; the first report follows observe() — once the
//    element is rendered at a size (the spec: no initial observation under a pane of no box). ──
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
    if (clientHeight > 0) {
      this.entry.callback([entryFor(target)]);
    }
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

/** The pane's display flips (display: none ↔ its box): EVERY observer reports, in creation order — the scroller's box at
 *  `height`, each observed cell at 0 on the hide and at its height on the show (the ResizeObserver spec: an observation
 *  fires when the element's display is set to none, and again when it is rendered at a size). `part` stages the show
 *  over two broadcasts: 'box' the scroller's report alone (the caller pumps a frame between), then 'cells' the cells'. */
const paneDisplay = (scroller: Element, height: number, part: 'all' | 'box' | 'cells' = 'all') => {
  if (part !== 'cells') {
    clientHeight = height;
  }
  observers.forEach((observer) => {
    const entries = Array.from(observer.targets)
      .filter((target) => (part === 'all' ? true : part === 'box' ? target === scroller : target !== scroller))
      .map((target) =>
        target === scroller ? entryFor(target, height) : entryFor(target, height <= 0 ? 0 : heightOf(target))
      );
    if (entries.length > 0) {
      observer.callback(entries);
    }
  });
};

// ── The layout model: the document order of the reservoir, the cell boxes (`data-h`) and the spacer below. ──
const CLIENT_HEIGHT = 600;
const ROW_H = 52;
/** The bar above the scroller (the real Home: the greeting and the pins): the scroller's top in the viewport. */
const BAR_H = 56;
let clientHeight = CLIENT_HEIGHT;
/** The scroller's top in the viewport — 0, or `BAR_H` for a list mounted below the bar. */
let hostTop = 0;
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
    return rect(hostTop, hostTop + clientHeight);
  }
  if (clientHeight <= 0) {
    // A hidden pane (the box 0): nothing inside it has a rect either — the engine's own shape (display: none).
    return rect(0, 0);
  }
  const layout = layoutOf(scroller);
  let entry = layout.rects.get(this);
  if (!entry) {
    // A container (the list's root): its top is its first laid-out descendant's.
    const inner = this.querySelector('[data-list-reservoir], [data-h], [data-list-below]');
    entry = inner ? layout.rects.get(inner) : undefined;
  }
  return entry ? rect(hostTop + entry.top - scrollTopValue, hostTop + entry.bottom - scrollTopValue) : rect(0, 0);
};
// ── THE ENGINE'S ANIMATED SCROLL AND ITS ANCHORING (pin 11; the witnesses are the simulator on iOS 27.2 and WebKit
//    build 2359 over the real Home, 2026-11-11). `scrollTo({ behavior: 'smooth' })` starts an animation the engine steps
//    per tick — a scroll event each, never a write. A write to scrollTop ends it. So does the engine's own ANCHORING: at
//    a layout change inside the scroller while the animation runs (a window commit), an engine that anchors adjusts the
//    scroller on a candidate row, and that adjustment ends the animation where it stands — a `scrollend`, no write,
//    short of the target. A row is a candidate unless it, or an ancestor inside the scroller, declares
//    `overflow-anchor: none`. jsdom parses no `overflow-anchor` (a write of it is dropped), so the model keeps the
//    declaration itself, as the engine would. ──
let animation: { target: number } | null = null;
let layoutAtLastTick = '';
const anchorNone = new WeakSet<CSSStyleDeclaration>();
const realSetProperty = CSSStyleDeclaration.prototype.setProperty;
const realRemoveProperty = CSSStyleDeclaration.prototype.removeProperty;
CSSStyleDeclaration.prototype.setProperty = function (
  this: CSSStyleDeclaration,
  name: string,
  value: string | null,
  priority?: string
) {
  if (name !== 'overflow-anchor') {
    realSetProperty.call(this, name, value, priority);
  } else if (value === 'none') {
    anchorNone.add(this);
  } else {
    anchorNone.delete(this);
  }
};
CSSStyleDeclaration.prototype.removeProperty = function (this: CSSStyleDeclaration, name: string) {
  if (name !== 'overflow-anchor') {
    return realRemoveProperty.call(this, name);
  }
  return anchorNone.delete(this) ? 'none' : '';
};
/** Whether the engine's anchoring finds a row to hold: a mounted row with no `overflow-anchor: none` on its way up. */
const anchoringHasACandidate = (scroller: HTMLElement): boolean =>
  Array.from(scroller.querySelectorAll<HTMLElement>('[data-row]')).some((row) => {
    for (let el: HTMLElement | null = row; el && el !== scroller; el = el.parentElement) {
      if (anchorNone.has(el.style)) {
        return false;
      }
    }
    return true;
  });
/** The layout as the engine's anchoring sees it change: the reservoir's size and the mounted rows. */
const layoutSignature = (scroller: HTMLElement): string => {
  const reservoir = scroller.querySelector<HTMLElement>('[data-list-reservoir]');
  const rows = scroller.querySelectorAll('[data-row]');
  return `${reservoir ? reservoir.style.height : ''}|${rows.length}|${rows.length > 0 ? rows[0].getAttribute('data-row') : ''}`;
};
/**
 * One tick of the engine's animated scroll: `stepPx` toward the target as a scroll event (never a write), the
 * `scrollend` at the target — unless the layout changed since the last tick under a candidate row: the anchoring's
 * adjustment ends the animation where it stands. False once no animation runs.
 */
const engineTick = (scroller: HTMLElement, stepPx: number): boolean => {
  if (!animation) {
    return false;
  }
  const signature = layoutSignature(scroller);
  if (signature !== layoutAtLastTick && anchoringHasACandidate(scroller)) {
    animation = null;
    scroller.dispatchEvent(new Event('scroll'));
    scroller.dispatchEvent(new Event('scrollend'));
    return false;
  }
  layoutAtLastTick = signature;
  scrollTopValue = Math.max(animation.target, scrollTopValue - stepPx);
  scroller.dispatchEvent(new Event('scroll'));
  if (scrollTopValue === animation.target) {
    animation = null;
    scroller.dispatchEvent(new Event('scrollend'));
  }
  return true;
};

/** The scroller element takes the model's scroll geometry; its scrollTop setter is the write spy. */
const modelScroller = (el: HTMLElement) => {
  el.setAttribute('data-model-scroller', '');
  el.style.overflowY = 'auto';
  (el as unknown as { scrollTo: (options: { top: number }) => void }).scrollTo = ({ top }) => {
    animation = { target: top };
    layoutAtLastTick = layoutSignature(el);
  };
  Object.defineProperty(el, 'clientHeight', { get: () => clientHeight, configurable: true });
  Object.defineProperty(el, 'scrollHeight', {
    get: () => Math.max(clientHeight, layoutOf(el).contentHeight),
    configurable: true,
  });
  Object.defineProperty(el, 'scrollTop', {
    get: () => scrollTopValue,
    set: (value: number) => {
      writes.push(value);
      animation = null; // a write ends the engine's animated scroll
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
  const readerRow = () => mountedIds().find((id) => boxOf(id).getBoundingClientRect().bottom > hostTop + 0.5) as number;

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
  const button = () => scroller.querySelector('button[aria-label="Back to top"]') as HTMLButtonElement;
  /** The engine's rest: QUIET_FRAMES quiet frames, and one more. */
  const rest = async () => {
    await act(async () => {
      pumpFrames(ScrollRest.QUIET_FRAMES + 1);
    });
  };
  /**
   * THE PRESS, as a finger makes it: the touch lands on the button (inside the scroller), lifts, the click follows in
   * the same task — and the lift's watch reaches its rest BEFORE the animation's first scroll event (a 120 Hz phone:
   * three frames are 25 ms, the first event of an animated scroll is later than that).
   */
  const press = async () => {
    await act(async () => {
      const target = button();
      target.dispatchEvent(new Event('touchstart', { bubbles: true }));
      target.dispatchEvent(new Event('touchend', { bubbles: true }));
      target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await rest();
  };
  /** The engine's animation run to its end — or to where it is ended — a frame per tick; then the rest. */
  const settle = async (stepPx = 400) => {
    for (let k = 0; k < 200 && animation; k++) {
      engineTick(scroller, stepPx);
      await frame();
    }
    await rest();
    await flush();
  };
  /** The reader scrolls down by hand, a frame per step — every row on the way mounted and measured — then rests. */
  const readerScrollsDownTo = async (top: number) => {
    for (let at = 400; at <= top; at += 400) {
      readerScrollsTo(scroller, at);
      await frame();
    }
    await rest();
  };
  /** The list mounted in a scroller below the bar (the real Home) — where a hide's judgment against layout bites. */
  const mountBelowABar = async (loader: CorpusLoader, windowSize: number) => {
    hostTop = BAR_H;
    await mountList(loader, windowSize);
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
    hostTop = 0;
    scrollTopValue = 0;
    animation = null;
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

  test('9a. hidden after a window, then shown at the top (round 2, the refuter’s R1): every row mounts while the box is 0, and the first frame with the box back resumes the window, bounded', async () => {
    const loader = new CorpusLoader(keys(), corpusOf(1000));
    await mountList(loader, 1000);
    await frame();
    expect(mountedIds().length).toBeLessThanOrEqual(BOUND);

    // The pane hides: the box reports 0 — every row mounts, as case 8 says (the documented road).
    boxResizes(scroller, 0);
    await frame();
    await flush();
    expect(mountedIds().length).toBe(1000);

    // The pane shows again at the same offset: the first frame resumes the window — the window that stood before the
    // hide is no reference for it (the stale range "still covers" the viewport and would resume nothing).
    boxResizes(scroller, CLIENT_HEIGHT);
    await frame();
    await flush();
    const shown = mountedIds();
    expect(shown.length).toBeLessThanOrEqual(BOUND);
    expect(shown[0]).toBe(0);
    expect(reservoirPx()).toBe(0);
    expect(belowPx()).toBe((1000 - shown.length) * ROW_H);
    expect(writes).toEqual([]);
  });

  test('9b. the same from the middle, shown at the same offset (the refuter’s R2): the window resumes bounded on the first frame and the reservoir is the rows above it alone — no drift absorbed against the hidden layout, nothing written', async () => {
    const loader = new CorpusLoader(keys(), corpusOf(1000));
    await mountList(loader, 1000);
    await frame();
    readerScrollsTo(scroller, 26_000);
    await frame();
    expect(mountedIds().length).toBeLessThanOrEqual(BOUND);

    // Hidden from the middle: every row mounts. The anchors the window recorded are no measure of this layout — read
    // against it they are a drift of the whole reservoir, and the rest would pay it as a write that throws the reader
    // from row 488 to row 12 (the red: the window resumes at 0, scrollTop written to 624).
    boxResizes(scroller, 0);
    await frame();
    await flush();
    expect(mountedIds().length).toBe(1000);

    // Shown at the same offset: the middle mounts on the first frame, the rows above it as the reservoir, exactly.
    boxResizes(scroller, CLIENT_HEIGHT);
    await frame();
    await flush();
    const shown = mountedIds();
    expect(shown.length).toBeLessThanOrEqual(BOUND);
    expect(shown[0]).toBe(Math.floor((26_000 - CLIENT_HEIGHT * LIST_WINDOW_SCREENS) / ROW_H));
    expect(reservoirPx()).toBe(shown[0] * ROW_H);
    expect(belowPx()).toBe((1000 - shown[0] - shown.length) * ROW_H);
    expect(scroller.scrollHeight).toBe(1000 * ROW_H);
    expect(writes).toEqual([]);
  });

  /** The pane hidden under the display:none shape, through the frame that mounts every row. */
  const hidden = async () => {
    paneDisplay(scroller, 0);
    await frame();
    await flush();
  };
  /**
   * The pane shown, as one outcome: the paint the show's reports leave before any frame (the reservoir, the writes), the
   * window at the first frame with the box, and the reader's row at the rest.
   */
  const shown = async () => {
    paneDisplay(scroller, CLIENT_HEIGHT);
    const atReports = { reservoir: reservoirPx(), writes: [...writes] };
    await frame();
    await flush();
    const atFrame = {
      first: mountedIds()[0],
      bounded: mountedIds().length <= BOUND,
      reservoir: reservoirPx(),
      writes: [...writes],
    };
    await act(async () => {
      pumpFrames(ScrollRest.QUIET_FRAMES + 1);
    });
    const atRest = {
      first: mountedIds()[0],
      reservoir: reservoirPx(),
      writes: [...writes],
      reader: readerRow(),
      scrollTop: scrollTopValue,
    };
    return { atReports, atFrame, atRest };
  };

  test('10a. hidden with the reader at the END, then shown (round 3, the refuter’s R4): no anchor is recorded against the hidden layout — the window resumes at the end on the first frame, the reservoir the rows above it, nothing absorbed, nothing written, the reader’s row held', async () => {
    const loader = new CorpusLoader(keys(), corpusOf(1000));
    await mountList(loader, 1000);
    await frame();
    const END = 1000 * ROW_H - CLIENT_HEIGHT;
    readerScrollsTo(scroller, END);
    await frame();
    const before = mountedIds();
    expect(before.length).toBeLessThanOrEqual(BOUND);
    expect(before[before.length - 1]).toBe(999);
    const reader = readerRow();

    // Hidden: every row in the document, the reservoir nothing. The red: the anchors recorded here (the first and the
    // last cell, tops 0 under the hidden layout) — at the show the first is unmounted and the last, read against the
    // live layout, is a drift of the whole reservoir (−1,196: the content collapses to a row, the reader thrown to 0).
    await hidden();
    expect(mountedIds().length).toBe(1000);
    expect(reservoirPx()).toBe(0);
    expect(await shown()).toEqual({
      atReports: { reservoir: 0, writes: [] },
      atFrame: { first: before[0], bounded: true, reservoir: before[0] * ROW_H, writes: [] },
      atRest: { first: before[0], reservoir: before[0] * ROW_H, writes: [], reader, scrollTop: END },
    });
  });

  test('10b. hidden from the MIDDLE, then shown (the refuter’s R5): the cells’ re-reports are measurements, not growth above the reader — nothing absorbed, nothing written at the rest, the reader’s row held', async () => {
    const loader = new CorpusLoader(keys(), corpusOf(1000));
    await mountList(loader, 1000);
    await frame();
    readerScrollsTo(scroller, 26_000);
    await frame();
    const before = mountedIds();
    expect(before.length).toBeLessThanOrEqual(BOUND);
    const reader = readerRow();

    // The red: the re-report of every cell mounted before the hide, judged as growth (+52 against its zero), is absorbed
    // for the 13 whose bottom sits at or above the edge (676) and paid at the rest as a write of 26,676 — the window at
    // 501, the reader on row 513 instead of 500.
    await hidden();
    expect(mountedIds().length).toBe(1000);
    expect(reservoirPx()).toBe(0);
    expect(await shown()).toEqual({
      atReports: { reservoir: 0, writes: [] },
      atFrame: { first: before[0], bounded: true, reservoir: before[0] * ROW_H, writes: [] },
      atRest: { first: before[0], reservoir: before[0] * ROW_H, writes: [], reader, scrollTop: 26_000 },
    });
  });

  test('10c. hidden at the TOP, then shown (the refuter’s R6): the first row’s re-report is not absorbed — the paint the show’s reports leave is the hidden one, not a row cut by its own height; nothing written, the reader on row 0', async () => {
    const loader = new CorpusLoader(keys(), corpusOf(1000));
    await mountList(loader, 1000);
    await frame();
    expect(mountedIds().length).toBeLessThanOrEqual(BOUND);

    // The red: row 0’s re-report (+52, its bottom-before exactly at the edge) is absorbed — the reservoir −52 in the paint
    // between the show’s reports and the frame; with the anchors alone fixed, a write of 52 at the rest, the reader on row 1.
    await hidden();
    expect(mountedIds().length).toBe(1000);
    expect(reservoirPx()).toBe(0);
    expect(await shown()).toEqual({
      atReports: { reservoir: 0, writes: [] },
      atFrame: { first: 0, bounded: true, reservoir: 0, writes: [] },
      atRest: { first: 0, reservoir: 0, writes: [], reader: 0, scrollTop: 0 },
    });
  });

  test('10d. a debt at the hide — growth absorbed above the reader, the rest not yet reached — stands through the hidden interval (no step against a box of 0) and is paid at the first rest after the show in ONE write, the reader’s row held', async () => {
    const loader = new CorpusLoader(keys(), corpusOf(1000));
    await mountList(loader, 1000);
    await frame();
    readerScrollsTo(scroller, 26_000);
    await frame();
    const before = mountedIds();
    const reader = readerRow();
    const offset = topOf(reader);
    // The window’s first row, above the viewport, grows: absorbed into the reservoir (law 4), the rest owed.
    await act(async () => {
      resize(boxOf(before[0]), ROW_H + 40);
    });
    expect(reservoirPx()).toBe(before[0] * ROW_H - 40);
    expect(topOf(reader)).toBe(offset);
    expect(writes).toEqual([]);

    // Hidden through QUIET_FRAMES frames: the rest arrives under the box of 0 and steps nothing — the debt stands. The
    // red: a step here measures a drift of 0 against the hidden rects and zeroes the reserve, the hold silently dropped
    // (the reservoir 0 while hidden; the reader on row 499 at the show, 40 px off, and no write to pay it).
    await hidden();
    await act(async () => {
      pumpFrames(ScrollRest.QUIET_FRAMES);
    });
    expect(mountedIds().length).toBe(1000);
    expect(reservoirPx()).toBe(-40);
    expect(writes).toEqual([]);

    expect(await shown()).toEqual({
      atReports: { reservoir: -40, writes: [] },
      atFrame: { first: before[0], bounded: true, reservoir: before[0] * ROW_H - 40, writes: [] },
      atRest: { first: before[0], reservoir: before[0] * ROW_H, writes: [26_040], reader, scrollTop: 26_040 },
    });
    expect(topOf(reader)).toBe(offset);
  });

  test('10e. the show STAGED over two commits — the box back and its first frame BEFORE the cells’ re-report (round 4, the refuter’s R7): a cell’s zero under the hidden box is no measurement — the frame derives the window from the rows’ heights, the whole height counting every row; the re-reports measure, absorb nothing, write nothing', async () => {
    const loader = new CorpusLoader(keys(), corpusOf(1000));
    await mountBelowABar(loader, 1000);
    await frame();
    readerScrollsTo(scroller, 26_000);
    await frame();
    const before = mountedIds();
    const reader = readerRow();

    // The red: the hide’s zero report of every mounted cell lands in the map, so the frame after the box’s return — the
    // re-report not yet delivered — derives the window against 36 rows of 0: first 524 instead of 488, the reader on
    // row 536, the whole height 36 rows short; nothing is owed, so nothing ever pays it, and the zeros stand in the map
    // until those rows re-mount.
    await hidden();
    expect(mountedIds().length).toBe(1000);
    paneDisplay(scroller, CLIENT_HEIGHT, 'box');
    await frame();
    await flush();
    const atFrame = {
      first: mountedIds()[0],
      bounded: mountedIds().length <= BOUND,
      reservoir: reservoirPx(),
      scrollHeight: scroller.scrollHeight,
      writes: [...writes],
    };
    paneDisplay(scroller, CLIENT_HEIGHT, 'cells');
    const atReports = { first: mountedIds()[0], reservoir: reservoirPx(), writes: [...writes] };
    await act(async () => {
      pumpFrames(ScrollRest.QUIET_FRAMES + 1);
    });
    const atRest = {
      first: mountedIds()[0],
      reservoir: reservoirPx(),
      writes: [...writes],
      reader: readerRow(),
      scrollTop: scrollTopValue,
    };
    expect({ atFrame, atReports, atRest }).toEqual({
      atFrame: {
        first: before[0],
        bounded: true,
        reservoir: before[0] * ROW_H,
        scrollHeight: 1000 * ROW_H,
        writes: [],
      },
      atReports: { first: before[0], reservoir: before[0] * ROW_H, writes: [] },
      atRest: { first: before[0], reservoir: before[0] * ROW_H, writes: [], reader, scrollTop: 26_000 },
    });
  });

  test('10f. the observers’ order, the scroller below a bar (round 4, the refuter’s R17b): the box’s observer is created before the cells’, so the hide’s one broadcast opens the interval before a cell reports under it — the reservoir untouched while hidden, nothing written at the rest, the reader’s row held', async () => {
    const loader = new CorpusLoader(keys(), corpusOf(1000));
    await mountBelowABar(loader, 1000);
    await frame();
    readerScrollsTo(scroller, 26_000);
    await frame();
    const before = mountedIds();
    const reader = readerRow();

    // The red (the creation order swapped): the cells’ zeros reach the list before the box’s 0 does, under the standing
    // layout — each mounted row whose bottom-before sits above the bar’s edge is “growth” of −52, absorbed: the reservoir
    // 1,872 while hidden; the rest after the show pays it as a write of 24,128, the reader thrown from row 500 to 464.
    // At viewport top 0 (10b) that bottom-before, 52, clears the edge and the swap absorbs nothing — the bar is the pin.
    await hidden();
    expect(mountedIds().length).toBe(1000);
    expect(reservoirPx()).toBe(0);
    expect(await shown()).toEqual({
      atReports: { reservoir: 0, writes: [] },
      atFrame: { first: before[0], bounded: true, reservoir: before[0] * ROW_H, writes: [] },
      atRest: { first: before[0], reservoir: before[0] * ROW_H, writes: [], reader, scrollTop: 26_000 },
    });
  });

  test('11a. the return to the top under an engine that anchors (row 3435 — his phone on iOS 27: one press ended short): several screens down, ONE press, the motion settled — the scroller at its top, the first row first in view, nothing written', async () => {
    const loader = new CorpusLoader(keys(), corpusOf(300));
    await mountList(loader, 300, { scrollTopButton: true });
    await frame();
    await readerScrollsDownTo(6_000);
    expect(mountedIds()[0]).toBeGreaterThan(50);
    expect(button().getAttribute('data-shown')).toBe('true');
    expect(writes).toEqual([]);

    // The red: the button's default action is the engine's animated scroll and nothing more — the first window commit
    // under it is a layout change with the rows as the anchoring's candidates, the adjustment ends the animation, and
    // the scroller rests where that left it (5,600 of 6,000), the button still up: his "it takes two taps".
    await press();
    await settle();
    expect(scrollTopValue).toBe(0);
    expect(mountedIds()[0]).toBe(0);
    expect(topOf(0)).toBe(0);
    expect(reservoirPx()).toBe(0);
    expect(writes).toEqual([]);
    expect(button().getAttribute('data-shown')).toBe('false');
  });

  test('11b. nothing is held through the return: a debt standing at the press is released — never paid by a write under the animation — and rows re-entering at heights other than the map’s, a row above the reader growing, are layout, never growth to absorb; the scroll’s end IS the list’s top', async () => {
    const corpus = corpusOf(300);
    const loader = new CorpusLoader(keys(), corpus);
    await mountList(loader, 300, { scrollTopButton: true });
    await frame();
    await readerScrollsDownTo(3_200);
    // While they are out of the window the first ten rows change: they will re-enter at 80 where the map holds 52.
    for (let id = 0; id <= 9; id++) {
      corpus[id].h = 80;
    }
    // A DEBT AT THE PRESS: the window's first row, above the viewport, grows — absorbed (law 4), its rest not yet reached.
    const first = mountedIds()[0];
    expect(boxOf(first).getBoundingClientRect().bottom).toBeLessThan(0);
    await act(async () => {
      resize(boxOf(first), ROW_H + 40);
    });
    expect(reservoirPx()).toBe(first * ROW_H - 40);
    expect(writes).toEqual([]);

    // The press, the lift's rest before the first scroll event: the debt is released, not paid — a payment here is a
    // write under the animation, which ends it (the red without the release: the scroller left at 3,240).
    await press();
    expect(writes).toEqual([]);
    expect(reservoirPx()).toBe(first * ROW_H);
    // Mid-return ANOTHER mounted row above the viewport grows: layout, not growth to absorb.
    engineTick(scroller, 300);
    await frame();
    const above = mountedIds().find((id) => id !== first) as number;
    expect(boxOf(above).getBoundingClientRect().bottom).toBeLessThan(0);
    await act(async () => {
      resize(boxOf(above), ROW_H + 24);
    });
    await settle();
    // The red without the hold released: the ten rows' 280 px (and the 24) stand as a debt above the scroll origin at
    // the animation's end, and the rest pays it holding the reader's row — one write, the scroller 280 px (304) short.
    expect(scrollTopValue).toBe(0);
    expect(mountedIds()[0]).toBe(0);
    expect(topOf(0)).toBe(0);
    expect(reservoirPx()).toBe(0);
    expect(writes).toEqual([]);
  });

  test('11c. the return ends at the top’s rest and at the reader’s own arm: from there the list holds again (law 4) and the engine’s anchoring has its rows back', async () => {
    const loader = new CorpusLoader(keys(), corpusOf(300));
    await mountList(loader, 300, { scrollTopButton: true });
    await frame();
    await readerScrollsDownTo(6_000);
    await press();
    await settle();
    expect(scrollTopValue).toBe(0);
    // AT THE TOP'S REST the return is over: the rows are the engine's candidates again, and growth above the reader is
    // absorbed as ever (the red with the return never ended: the reader's row thrown 40 px by the growth).
    expect(anchoringHasACandidate(scroller)).toBe(true);
    await readerScrollsDownTo(2_000);
    let above = mountedIds()[0];
    let reader = readerRow();
    let offset = topOf(reader);
    await act(async () => {
      resize(boxOf(above), ROW_H + 40);
    });
    expect(Math.abs(topOf(reader) - offset)).toBeLessThanOrEqual(0.5);
    await rest();
    expect(writes.length).toBe(1);
    expect(Math.abs(topOf(reader) - offset)).toBeLessThanOrEqual(0.5);

    // THE READER'S OWN ARM mid-return: a second press, two ticks of the animation, then a finger on a row — the engine
    // ends its animation under a touch, and the return ends with it.
    await press();
    engineTick(scroller, 300);
    await frame();
    engineTick(scroller, 300);
    await frame();
    expect(animation).not.toBeNull();
    expect(anchoringHasACandidate(scroller)).toBe(false);
    await act(async () => {
      animation = null;
      boxOf(readerRow()).dispatchEvent(new Event('touchstart', { bubbles: true }));
    });
    expect(anchoringHasACandidate(scroller)).toBe(true);
    above = mountedIds()[0];
    reader = readerRow();
    offset = topOf(reader);
    expect(boxOf(above).getBoundingClientRect().bottom).toBeLessThan(0);
    await act(async () => {
      resize(boxOf(above), ROW_H + 40);
    });
    expect(Math.abs(topOf(reader) - offset)).toBeLessThanOrEqual(0.5);
  });
});
