/**
 * @jest-environment jsdom
 *
 * PrependSafeScroller (src/list/PrependSafeScroller.tsx) with its reservoir (PrependReservoir) and the one rest
 * definition (ScrollRest), under a MODELED LAYOUT: jsdom lays nothing out, so the scroller's clientHeight,
 * scrollHeight and scrollTop, and every box's rect, are computed here from the DOM order, each row's declared
 * height (`data-h`) and the reservoir's own inline style — the geometry a real engine would give. `scrollTop`'s
 * setter is a spy: every programmatic write is counted, and a write IS the outcome these laws forbid or allow.
 * Two things a real engine has, the model has too: A DRAWN SCALE (`drawnScale` — a host that draws the pane small,
 * a card growing back: every rect is scaled about the pane's center, while the layout's own lengths — clientHeight,
 * scrollTop, scrollHeight, the observers' sizes, the block's inline size — are untouched) and A PANE WITH NO BOX
 * (`paneLosesItsBox` — a kept pane hidden with display: none: nothing in it has a rect, the scroller has no height,
 * and every observed box reports a size of 0; `paneGetsItsBox` and the engine's next reports bring them back).
 * Three more, each an engine's own: EVERY EDGE IN SINGLE PRECISION under a transform that scales nothing
 * (`heldInFloats` — a slide: an engine maps a rect through any transform in floats, so an edge two million px away is
 * held to an eighth or a quarter of a px); THE RULER PLACED BY ITS SEAT (a sticky holder stands at the scroller's top
 * edge while the block holds the edge, at the block's foot once the block is above it; any other at the block's top);
 * and THE SCROLLER'S OWN DRAWN HEIGHT apart from its layout height (`scrollerDrawnHeight` — a layout height is a whole
 * number, the height a pane is drawn at is not). A SCROLLER OF NO HEIGHT WHOSE ROWS KEEP THEIR BOXES is the model's
 * `clientHeight = 0` with the pane's box standing: every rect is there, the ruler's among them. A LAYOUT THAT DRAWS NO
 * RULER (`rulerIsDrawn = false`) is a consumer's own modeled layout: the ruler reads nothing there, box or no box.
 *
 * The laws, asserted as outcomes:
 *  1. A landing of K rows at the start changes the scroller's scrollHeight by 0 and writes scrollTop never — the
 *     reservoir shrinks by exactly the landed height in the rows' own commit; the reader's row keeps its offset.
 *     Under a held finger the same, and the rows land at once (no hold).
 *  2. A landing taller than the reservoir is still height-neutral (the shortfall is a debt — a negative margin);
 *     the debt is paid at the engine's REST only (QUIET_FRAMES quiet frames, no finger), with ONE write, the row
 *     holding — never while a finger is down.
 *  3. When nothing remains above, the whole gap — a leftover reservoir or a debt — goes at the rest only, in ONE
 *     step with ONE write, the reader's row holding its identity and offset while a write can hold it (the first
 *     row arrives at the edge in that same step when none can); nothing while scroll events keep arriving. While
 *     rows remain above (a refill, an overestimate corrected) a step is still bounded by a viewport.
 *  4. A row above the reader that grows later is absorbed with no write (the resize observation).
 *  5. THE OPEN: a list filled from empty (or replaced) with a count of rows above in the SAME commit sizes the
 *     reservoir to count × estimate in the rows' own layout pass — before the first paint, with no write of its
 *     own and no step at any later rest.
 *  The gate: `onNeedMore` leaves when the viewport enters the lead, once per read, re-asked after a landing that
 *  leaves the viewport inside the lead, never with nothing remaining; a settled promise or `loading` false reopens
 *  it. THE SCROLLER'S OWN BOX: rows that landed while the scroller had no geometry (a pane mounted hidden, laid out
 *  later) were judged against no viewport — the box gaining height re-judges the lead, by the same rule, once.
 *  The loading row renders at the reservoir's foot only while loading with rows remaining, height-neutrally.
 *  `onRest` fires at the rest and not before; `scrollend` short-circuits it. `apiRef` reads the geometry.
 *  TRUE LENGTHS: every length the scroller and its reservoir hold, compare or write is the layout's own, whatever
 *  scale the pane is drawn at — a refill step, a landing, a sizing, the judgment of growth above the reader and the
 *  distance from the loaded start are the same at 0.95 as at 1; with nothing drawn to a scale every number is, bit
 *  for bit, the one the rects give.
 *  A PANE SHOWN AGAIN IS NOT ROWS GROWING: a size report from a pane with no box, and a row's first after the box
 *  returns, is the size as mounted — the block is the one it was and no step is owed.
 *  NO BOX HAS ONE OWNER, AND EVERY READ PASSES IT: with no box nothing is recorded, compared, absorbed, stepped or
 *  owed — a commit while hidden leaves no record to throw the next landing by, rows that land hidden take nothing out
 *  of the block unread, a rest pending at the hide fires once and asks for no frame after it — and what could not be
 *  paid is paid at the first rests after the box returns, with no scroll of the consumer's. The word is the engine's
 *  (the ruler has no drawn length), never the scroller's own height: a scroller of no height whose rows keep their
 *  boxes is read as any other.
 *  THE RULER READS ITS OWN LENGTH AT ANY DEPTH (a block two million px tall, every edge in single precision), and the
 *  scale is never the scroller's drawn height over its layout height. A CONSUMER'S OWN LENGTHS go through the api's
 *  `trueLength`, the same conversion.
 */
import React, { forwardRef, useImperativeHandle, useState } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { PrependSafeScroller, PrependSafeScrollerApi } from '../src/list/PrependSafeScroller';
import { PrependReservoir } from '../src/list/PrependReservoir';
import { ScrollRest } from '../src/list/ScrollRest';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// ── Frames: requestAnimationFrame as a manual pump, so the rest is counted in frames the test advances. ──
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

// ── ResizeObserver stub: records targets; `resize` delivers an entry the way the engine would, after layout. ──
type ROCallback = (entries: ResizeObserverEntry[]) => void;
const observers: Array<{ callback: ROCallback; targets: Set<Element> }> = [];
class FakeResizeObserver {
  private readonly entry: { callback: ROCallback; targets: Set<Element> };
  constructor(callback: ROCallback) {
    this.entry = { callback, targets: new Set() };
    observers.push(this.entry);
  }
  observe(target: Element) {
    this.entry.targets.add(target);
    // The observation's first report: the size as mounted — none in a pane with no box (a size of 0 is no report).
    if (paneHasBox) {
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
const entryFor = (target: Element, height = heightOf(target)): ResizeObserverEntry => {
  return {
    target,
    contentRect: { height, width: 390, top: 0, left: 0, bottom: height, right: 390, x: 0, y: 0, toJSON() {} },
    borderBoxSize: [{ blockSize: height, inlineSize: 390 }],
    contentBoxSize: [{ blockSize: height, inlineSize: 390 }],
    devicePixelContentBoxSize: [{ blockSize: height, inlineSize: 390 }],
  } as unknown as ResizeObserverEntry;
};
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
/**
 * The engine's size reports, to every observer once, in the order the observers were made: each observed box at the
 * size it has now — 0 in a pane with no box.
 */
const engineReportsSizes = () => {
  observers.forEach((observer) => {
    const entries = Array.from(observer.targets).map((target) => {
      const height = target.hasAttribute('data-model-scroller') ? target.clientHeight : heightOf(target);
      return entryFor(target, paneHasBox ? height : 0);
    });
    if (entries.length > 0) {
      observer.callback(entries);
    }
  });
};
/** The pane is hidden (display: none): nothing in it has a box from here, and the engine says so to every observer. */
const paneLosesItsBox = () => {
  paneHasBox = false;
  engineReportsSizes();
};
/** The pane is shown again: its boxes are back. The engine's reports follow the consumer's own layout work (`engineReportsSizes`). */
const paneGetsItsBox = () => {
  paneHasBox = true;
};
/** The scroller's OWN box changes height (a pane laid out, grown or shrunk): the engine reports it to whoever observes the scroller. */
const boxResizes = (scroller: Element, height: number) => {
  clientHeight = height;
  observers.forEach((observer) => {
    if (observer.targets.has(scroller)) {
      observer.callback([entryFor(scroller, height)]);
    }
  });
};

// ── The layout model ──
const CLIENT_HEIGHT = 600;
/** The scroller's own box height as the engine reports it — the cases move it (a pane laid out after its rows landed). */
let clientHeight = CLIENT_HEIGHT;
let scrollTopValue = 0;
/** The scale the host draws the pane at: every rect is drawn at it; the layout's own lengths are untouched. */
let drawnScale = 1;
/** How far off its own length the engine reads the reservoir's ruler alone — its rounding of a long box on a zoomed page. */
let rulerReadsOffBy = 0;
/** Whether the pane has a box: without one (display: none) nothing in it has a rect, a height or a scroll offset. */
let paneHasBox = true;
/** The pane is drawn through a transform that scales nothing (a slide): the engine holds every edge in single precision. */
let heldInFloats = false;
/** The scroller's own DRAWN height where it differs from its whole-number layout height (a pane 599.67 px tall reads 600). */
let scrollerDrawnHeight: number | null = null;
/** Whether the layout draws the reservoir's ruler: a consumer's own modeled layout knows no ruler, and reads nothing of it. */
let rulerIsDrawn = true;
const writes: number[] = [];
const heightOf = (el: Element) => Number(el.getAttribute('data-h') ?? 0);
const layoutOf = (scroller: Element) => {
  const reservoir = scroller.querySelector('[data-prepend-reservoir]') as HTMLElement;
  const reservoirHeight = parseFloat(reservoir.style.height) || 0;
  const reservoirMargin = parseFloat(reservoir.style.marginBottom) || 0;
  const rects = new Map<Element, { top: number; bottom: number }>();
  let y = 0;
  rects.set(reservoir, { top: y, bottom: y + reservoirHeight });
  y += reservoirHeight + reservoirMargin;
  Array.from(scroller.children).forEach((child) => {
    if (child === reservoir) {
      return;
    }
    const box = child.hasAttribute('data-prepend-row') ? child.firstElementChild : child;
    if (!box) {
      return;
    }
    const height = heightOf(box);
    rects.set(box, { top: y, bottom: y + height });
    y += height;
  });
  return { rects, contentHeight: y };
};
const rect = (top: number, bottom: number): DOMRect =>
  ({ top, bottom, height: bottom - top, left: 0, right: 390, width: 390, x: 0, y: top, toJSON() {} }) as DOMRect;
/**
 * A box as the host draws it: scaled about the pane's center, its edges held in single precision — an engine maps a
 * rect through a transform in floats, so a length read back from two drawn edges is a hair off the layout's own.
 * Drawn as laid out, it is the layout's own rect.
 */
const drawnRect = (top: number, bottom: number): DOMRect => {
  if (drawnScale === 1) {
    return heldInFloats ? rect(Math.fround(top), Math.fround(bottom)) : rect(top, bottom);
  }
  const center = clientHeight / 2;
  return rect(Math.fround(center + (top - center) * drawnScale), Math.fround(center + (bottom - center) * drawnScale));
};
const realRect = Element.prototype.getBoundingClientRect;
Element.prototype.getBoundingClientRect = function (this: Element): DOMRect {
  const scroller = this.closest('[data-model-scroller]');
  if (!scroller) {
    return realRect.call(this);
  }
  if (!paneHasBox) {
    return rect(0, 0); // no box: nothing in the pane has a rect either (the engine's own shape under display: none)
  }
  if (this === scroller) {
    return drawnRect(0, scrollerDrawnHeight ?? clientHeight);
  }
  const layout = layoutOf(scroller);
  if (this.parentElement?.hasAttribute('data-prepend-ruler')) {
    if (!rulerIsDrawn) {
      return rect(0, 0);
    }
    // The reservoir's ruler: a box of its own declared height, clipped out of the scroll extent (it adds nothing to
    // `contentHeight`) and drawn as every box is — placed by its holder's seat: a sticky holder at the scroller's top
    // edge while the block holds the edge, at the block's foot once the block is above it; any other at the block's top.
    const block = layout.rects.get(reservoirOf(scroller as HTMLElement))!;
    const blockTop = block.top - scrollTopValue;
    const sticky = (this.parentElement as HTMLElement).style.position === 'sticky';
    const top = sticky ? Math.min(Math.max(blockTop, 0), block.bottom - scrollTopValue) : blockTop;
    const drawn = drawnRect(top, top + (parseFloat((this as HTMLElement).style.height) || 0));
    return rect(drawn.top, drawn.bottom + rulerReadsOffBy);
  }
  const entry = layout.rects.get(this);
  return entry ? drawnRect(entry.top - scrollTopValue, entry.bottom - scrollTopValue) : rect(0, 0);
};
/** The scroller element takes the model's scroll geometry; its scrollTop setter is the write spy. */
const modelScroller = (el: HTMLElement) => {
  el.setAttribute('data-model-scroller', '');
  Object.defineProperty(el, 'clientHeight', { get: () => (paneHasBox ? clientHeight : 0), configurable: true });
  Object.defineProperty(el, 'scrollHeight', {
    get: () => (paneHasBox ? Math.max(clientHeight, layoutOf(el).contentHeight) : 0),
    configurable: true,
  });
  Object.defineProperty(el, 'scrollTop', {
    get: () => (paneHasBox ? scrollTopValue : 0),
    set: (value: number) => {
      writes.push(value);
      scrollTopValue = Math.max(0, Math.min(value, Math.max(0, layoutOf(el).contentHeight - clientHeight)));
      el.dispatchEvent(new Event('scroll')); // the write's own echo, as the engine fires it
    },
    configurable: true,
  });
};
/** The reader moves the view: the engine's own scroll, never a write. */
const readerScrollsTo = (scroller: HTMLElement, top: number) => {
  scrollTopValue = top;
  scroller.dispatchEvent(new Event('scroll'));
};
const fingerDown = (scroller: HTMLElement) => scroller.dispatchEvent(new Event('touchstart'));
const fingerUp = (scroller: HTMLElement) => scroller.dispatchEvent(new Event('touchend'));
const rowBox = (scroller: HTMLElement, id: number) =>
  scroller.querySelector(`[data-prepend-row="${id}"] > [data-h]`) as HTMLElement;
const offsetOf = (scroller: HTMLElement, id: number) => rowBox(scroller, id).getBoundingClientRect().top;
/** A row's TRUE offset below the scroller's top edge — the layout's own length, whatever scale the pane is drawn at. */
const trueOffsetOf = (scroller: HTMLElement, id: number) =>
  layoutOf(scroller).rects.get(rowBox(scroller, id))!.top - scrollTopValue;
const reservoirOf = (scroller: HTMLElement) => scroller.querySelector('[data-prepend-reservoir]') as HTMLElement;

// ── The harness: a consumer with its own items, count and loading state. ──
type Row = { id: number; h: number };
const rows = (from: number, to: number, h: number): Row[] => {
  const out: Row[] = [];
  for (let id = from; id <= to; id++) {
    out.push({ id, h });
  }
  return out;
};
type HarnessApi = {
  prepend: (added: Row[]) => void;
  setRemaining: (remaining: number) => void;
  setLoading: (loading: boolean) => void;
  replace: (items: Row[]) => void;
};
type HarnessProps = {
  initial: Row[];
  remaining: number;
  onNeedMore?: () => void | Promise<unknown>;
  onRest?: () => void;
  apiRef?: React.MutableRefObject<PrependSafeScrollerApi | null>;
  scrollerRef: React.MutableRefObject<HTMLDivElement | null>;
  loadingRow?: React.ReactNode;
  tail?: number;
};
const Harness = forwardRef<HarnessApi, HarnessProps>(function Harness(props, ref) {
  const [items, setItems] = useState(props.initial);
  const [remaining, setRemaining] = useState(props.remaining);
  const [loading, setLoading] = useState(false);
  useImperativeHandle(ref, () => ({
    // A consumer lands older rows at the start and counts them off what remains above.
    prepend: (added) => {
      setItems((previous) => [...added, ...previous]);
      setRemaining((previous) => Math.max(0, previous - added.length));
    },
    setRemaining,
    setLoading,
    replace: setItems,
  }));
  return (
    <PrependSafeScroller
      items={items}
      itemKey={(row) => row.id}
      renderItem={(row) => <div data-h={row.h} data-id={row.id} />}
      remainingAbove={remaining}
      estimatedRowHeight={100}
      onNeedMore={props.onNeedMore}
      onRest={props.onRest}
      loading={loading}
      loadingRow={props.loadingRow}
      apiRef={props.apiRef}
      scrollerRef={(node) => {
        if (node && !node.hasAttribute('data-model-scroller')) {
          modelScroller(node);
        }
        props.scrollerRef.current = node;
      }}
    >
      {props.tail ? <div data-h={props.tail} data-tail /> : null}
    </PrependSafeScroller>
  );
});

let container: HTMLDivElement;
let root: Root;
const mount = (props: Omit<HarnessProps, 'scrollerRef'>) => {
  const harness = React.createRef<HarnessApi>();
  const scrollerRef: React.MutableRefObject<HTMLDivElement | null> = { current: null };
  act(() => {
    root.render(<Harness ref={harness} scrollerRef={scrollerRef} {...props} />);
  });
  return { harness: harness.current!, scroller: scrollerRef.current! };
};

const setUp = () => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  scrollTopValue = 0;
  clientHeight = CLIENT_HEIGHT;
  drawnScale = 1;
  rulerReadsOffBy = 0;
  paneHasBox = true;
  heldInFloats = false;
  scrollerDrawnHeight = null;
  rulerIsDrawn = true;
  writes.length = 0;
  frameQueue.length = 0;
  observers.length = 0;
};
const tearDown = () => {
  act(() => {
    root.unmount();
  });
  container.remove();
};
beforeEach(setUp);
afterEach(tearDown);

describe('law 1 — the landing is height-neutral and writes nothing', () => {
  test('K rows at the start: scrollHeight unchanged, scrollTop never written, the reservoir shrunk by the landed height, the reader’s row holding', () => {
    const { harness, scroller } = mount({ initial: rows(1, 10, 100), remaining: 20 });
    // The mounted rows measure a mean of 100: 20 remaining → a 2000 px reservoir above 1000 px of rows.
    expect(reservoirOf(scroller).style.height).toBe('2000px');
    expect(scroller.scrollHeight).toBe(3000);
    readerScrollsTo(scroller, 2350); // row 4 (top 2300) is the first visible, 50 px above the edge
    expect(offsetOf(scroller, 4)).toBe(-50);
    const writesBefore = writes.length;

    act(() => {
      harness.prepend(rows(101, 105, 120)); // 600 px land above the reader
    });

    expect(scroller.scrollHeight).toBe(3000);
    expect(writes.length).toBe(writesBefore);
    expect(reservoirOf(scroller).style.height).toBe('1400px');
    expect(offsetOf(scroller, 4)).toBe(-50);
    expect(scroller.scrollTop).toBe(2350);
  });

  test('under a held finger the rows land at once, neutrally, with no write', () => {
    const { harness, scroller } = mount({ initial: rows(1, 10, 100), remaining: 20 });
    readerScrollsTo(scroller, 2350);
    fingerDown(scroller);
    act(() => {
      harness.prepend(rows(101, 103, 100));
    });
    expect(scroller.querySelectorAll('[data-prepend-row]').length).toBe(13); // in the document now, no hold
    expect(scroller.scrollHeight).toBe(3000);
    expect(writes.length).toBe(0);
    expect(offsetOf(scroller, 4)).toBe(-50);
    expect(reservoirOf(scroller).style.height).toBe('1700px');
    pumpFrames(10);
    expect(writes.length).toBe(0); // the reservoir sits on its target: nothing owed, nothing written, finger or no finger
    fingerUp(scroller);
    pumpFrames(10);
    expect(writes.length).toBe(0);
  });

  test('two landings in a row and a tail below the rows: each neutral, the tail unmoved relative to the reader', () => {
    const { harness, scroller } = mount({ initial: rows(1, 10, 100), remaining: 30, tail: 400 });
    expect(scroller.scrollHeight).toBe(3000 + 1400);
    readerScrollsTo(scroller, 3800); // the end: the last row (top 3900) and the tail below it in view
    expect(offsetOf(scroller, 10)).toBe(100);
    act(() => {
      harness.prepend(rows(101, 110, 150));
    });
    act(() => {
      harness.prepend(rows(201, 205, 80));
    });
    expect(scroller.scrollHeight).toBe(4400);
    expect(writes.length).toBe(0);
    expect(offsetOf(scroller, 10)).toBe(100);
    expect(reservoirOf(scroller).style.height).toBe(`${3000 - 1500 - 400}px`);
  });
});

describe('law 2 — a landing taller than the reservoir: neutral at the landing, the debt paid at the rest only', () => {
  test('the shortfall becomes a negative margin, the row holds; the debt is paid with ONE write at the rest, never under a finger', () => {
    const { harness, scroller } = mount({ initial: rows(1, 10, 100), remaining: 3 });
    expect(reservoirOf(scroller).style.height).toBe('300px');
    readerScrollsTo(scroller, 500); // row 3 (top 500) is first visible at offset 0
    expect(offsetOf(scroller, 3)).toBe(0);
    fingerDown(scroller);
    act(() => {
      harness.prepend(rows(101, 103, 200)); // 600 px into 300 px of room
      harness.setRemaining(0);
    });
    const reservoir = reservoirOf(scroller);
    expect(reservoir.style.height).toBe('0px');
    expect(reservoir.style.marginBottom).toBe('-300px');
    expect(scroller.scrollHeight).toBe(1300);
    expect(offsetOf(scroller, 3)).toBe(0);
    expect(writes.length).toBe(0);
    // The finger stays down: no rest, no write, however many frames pass.
    pumpFrames(12);
    expect(writes.length).toBe(0);
    // The lift, then the rest: QUIET_FRAMES quiet frames, and the one write that pays the debt.
    fingerUp(scroller);
    pumpFrames(ScrollRest.QUIET_FRAMES - 1);
    expect(writes.length).toBe(0);
    pumpFrames(1);
    expect(writes.length).toBe(1);
    expect(reservoir.style.marginBottom).toBe('0px');
    expect(scroller.scrollTop).toBe(800);
    expect(offsetOf(scroller, 3)).toBe(0); // the write was neutral: the row is where it was
    expect(scroller.scrollHeight).toBe(1600);
    pumpFrames(12);
    expect(writes.length).toBe(1); // nothing more owed
  });
});

describe('law 3 — the end: the whole gap at the rest only, in one step with one write; the viewport bound stays while rows remain', () => {
  test('remaining 0 with a leftover over four viewports, the reader far below the loaded start: nothing while the reader moves; at the rest ONE step to zero with ONE write, the row holding its offset', () => {
    const { harness, scroller } = mount({ initial: rows(1, 20, 100), remaining: 25 });
    expect(reservoirOf(scroller).style.height).toBe('2500px');
    readerScrollsTo(scroller, 3900); // the end: row 15 (top 3900) first visible at offset 0, 1400 px below the loaded start
    act(() => {
      harness.setRemaining(0);
    });
    // The reader keeps moving: a scroll event each frame holds the rest off.
    for (let k = 0; k < 6; k++) {
      readerScrollsTo(scroller, 3900);
      pumpFrames(1);
    }
    expect(writes.length).toBe(0);
    // At rest: the whole 2500 px in ONE step — one write, row 15 where it was — never a viewport per rest.
    pumpFrames(ScrollRest.QUIET_FRAMES);
    expect(writes.length).toBe(1);
    expect(reservoirOf(scroller).style.height).toBe('0px');
    expect(offsetOf(scroller, 15)).toBe(0);
    expect(scroller.scrollTop).toBe(1400);
    expect(scroller.scrollHeight).toBe(2000);
    pumpFrames(12);
    expect(writes.length).toBe(1); // nothing more owed: no further rest, no further write
  });

  test('a reader NEAR the loaded start (100 px below it): the same ONE step, the row holding — never a step per rest of that distance', () => {
    const { harness, scroller } = mount({ initial: rows(1, 10, 100), remaining: 25 });
    expect(reservoirOf(scroller).style.height).toBe('2500px');
    readerScrollsTo(scroller, 2600); // row 2 (top 2600) first visible at offset 0: 100 px below the loaded start
    act(() => {
      harness.setRemaining(0);
    });
    pumpFrames(ScrollRest.QUIET_FRAMES);
    expect(writes.length).toBe(1);
    expect(reservoirOf(scroller).style.height).toBe('0px');
    expect(offsetOf(scroller, 2)).toBe(0);
    expect(scroller.scrollTop).toBe(100);
    pumpFrames(12);
    expect(writes.length).toBe(1);
  });

  test('a reader whose edge sits INSIDE the leftover room (scrolled up past the loaded start): the room goes in ONE step with ONE write of 0 — row 1 arrives at the edge, never held at its offset a step per rest', () => {
    const { harness, scroller } = mount({ initial: rows(1, 10, 100), remaining: 25 });
    readerScrollsTo(scroller, 2300); // the edge 200 px above the loaded start; row 1 at offset 200
    act(() => {
      harness.setRemaining(0);
    });
    pumpFrames(ScrollRest.QUIET_FRAMES);
    expect(writes.length).toBe(1);
    expect(writes[0]).toBe(0); // the one write: the offset no write can hold is the edge
    expect(reservoirOf(scroller).style.height).toBe('0px');
    expect(offsetOf(scroller, 1)).toBe(0);
    expect(scroller.scrollTop).toBe(0);
    pumpFrames(12);
    expect(writes.length).toBe(1);
  });

  test('a reader at the very top: the room goes in one step with NO write (the offset is already the edge)', () => {
    const { harness, scroller } = mount({ initial: rows(1, 10, 100), remaining: 25 });
    readerScrollsTo(scroller, 0); // row 1 at offset 2500, the whole room above the edge
    act(() => {
      harness.setRemaining(0);
    });
    pumpFrames(ScrollRest.QUIET_FRAMES);
    expect(reservoirOf(scroller).style.height).toBe('0px');
    expect(offsetOf(scroller, 1)).toBe(0);
    expect(scroller.scrollTop).toBe(0);
    expect(writes.length).toBe(0);
    pumpFrames(12);
    expect(writes.length).toBe(0);
  });

  test('a DEBT over a viewport at the end: paid in ONE step with ONE write, the row holding — never a viewport per rest', () => {
    const { harness, scroller } = mount({ initial: rows(1, 10, 100), remaining: 3 });
    expect(reservoirOf(scroller).style.height).toBe('300px');
    readerScrollsTo(scroller, 500); // row 3 (top 500) first visible at offset 0
    act(() => {
      harness.prepend(rows(101, 110, 100)); // 1000 px into 300 px of room: a 700 px debt, over the 600 px viewport
      harness.setRemaining(0);
    });
    const reservoir = reservoirOf(scroller);
    expect(reservoir.style.marginBottom).toBe('-700px');
    expect(scroller.scrollHeight).toBe(1300);
    expect(offsetOf(scroller, 3)).toBe(0);
    expect(writes.length).toBe(0);
    pumpFrames(ScrollRest.QUIET_FRAMES);
    expect(writes.length).toBe(1);
    expect(reservoir.style.marginBottom).toBe('0px');
    expect(scroller.scrollTop).toBe(1200);
    expect(offsetOf(scroller, 3)).toBe(0);
    expect(scroller.scrollHeight).toBe(2000);
    pumpFrames(12);
    expect(writes.length).toBe(1);
  });

  test('while rows REMAIN above (an overestimate corrected: the count drops without a landing) a shrink is still bounded by a viewport per rest, the row holding after each', () => {
    const { harness, scroller } = mount({ initial: rows(1, 20, 100), remaining: 25 });
    expect(reservoirOf(scroller).style.height).toBe('2500px');
    readerScrollsTo(scroller, 3900); // row 15 first visible at offset 0, 1400 px below the loaded start
    act(() => {
      harness.setRemaining(5); // the target is now 500: a 2000 px overestimate, rows still above
    });
    // Viewport-sized steps, one per rest, until the reservoir is within the refill band of its target.
    [1900, 1300, 700].forEach((expected, index) => {
      pumpFrames(ScrollRest.QUIET_FRAMES);
      expect(writes.length).toBe(index + 1);
      expect(reservoirOf(scroller).style.height).toBe(`${expected}px`);
      expect(offsetOf(scroller, 15)).toBe(0);
    });
    pumpFrames(12);
    expect(writes.length).toBe(3); // 700 is within a viewport of 500: nothing more owed
    expect(scroller.scrollTop).toBe(2100);
  });
});

describe('law 4 — growth above the reader is absorbed without a write', () => {
  test('a row above the first visible row grows: the reservoir shrinks by the growth, the row holds; a row below does nothing', () => {
    const { scroller } = mount({ initial: rows(1, 10, 100), remaining: 20 });
    readerScrollsTo(scroller, 2350); // row 4 first visible at −50; rows 1–3 are above
    resize(rowBox(scroller, 1), 160);
    expect(reservoirOf(scroller).style.height).toBe('1940px');
    expect(offsetOf(scroller, 4)).toBe(-50);
    expect(scroller.scrollHeight).toBe(3000);
    expect(writes.length).toBe(0);
    resize(rowBox(scroller, 6), 300); // below the reader's row: nothing to absorb
    expect(reservoirOf(scroller).style.height).toBe('1940px');
    expect(offsetOf(scroller, 4)).toBe(-50);
    expect(writes.length).toBe(0);
  });
});

describe('law 5 — the open: a list filled from empty takes the count in the rows’ own layout pass', () => {
  test('rows and remainingAbove landing in ONE commit: the reservoir is count × estimate at the commit, the scroller writes nothing, and no rest step follows', () => {
    const { harness, scroller } = mount({ initial: [], remaining: 0 });
    expect(reservoirOf(scroller).style.height).toBe('0px');
    act(() => {
      harness.replace(rows(1, 10, 100)); // the head page lands …
      harness.setRemaining(40); // … with the consumer's count of rows above, in the same commit (a chat's own shape)
    });
    // AT THE COMMIT: the room for 40 rows at the seed estimate (no row was measured while the list was empty), the
    // scroller's height with it, and nothing written — the consumer's own park is the one write of an open.
    expect(reservoirOf(scroller).style.height).toBe('4000px');
    expect(scroller.scrollHeight).toBe(5000);
    expect(writes.length).toBe(0);
    readerScrollsTo(scroller, 4400); // the consumer parks at the end
    // Rest after rest, nothing is owed: no step, no write, the room as sized.
    pumpFrames(ScrollRest.QUIET_FRAMES * 4);
    expect(writes.length).toBe(0);
    expect(reservoirOf(scroller).style.height).toBe('4000px');
    expect(scroller.scrollTop).toBe(4400);
    expect(scroller.scrollHeight).toBe(5000);
  });

  test('the rows that land with the count ARE measured rows: the room is count × their mean at the commit, never count × the seed — so a consumer’s exact count makes an exact room, and the first landing owes nothing at the rest', () => {
    const { harness, scroller } = mount({ initial: [], remaining: 0 });
    act(() => {
      harness.replace(rows(1, 10, 150)); // the head page: ten rows of 150 (the seed says 100)
      harness.setRemaining(14); // the consumer's exact count of rows above (a server's count)
    });
    // AT THE COMMIT: 14 × the mounted rows' mean (150) = 2100 — not 14 × the seed (1400).
    expect(reservoirOf(scroller).style.height).toBe('2100px');
    expect(writes.length).toBe(0);
    readerScrollsTo(scroller, 2600); // the consumer parks at the end
    pumpFrames(ScrollRest.QUIET_FRAMES * 4);
    expect(writes.length).toBe(0);
    expect(reservoirOf(scroller).style.height).toBe('2100px');
    // THE FIRST LANDING of ten rows of 150 shrinks the room by exactly what landed: 600 left for the 4 remaining, the
    // estimate unchanged, nothing owed — no refill, no debt, no collapse at any rest.
    act(() => {
      harness.prepend(rows(-9, 0, 150));
    });
    expect(reservoirOf(scroller).style.height).toBe('600px');
    expect(reservoirOf(scroller).style.marginBottom).toBe('0px');
    expect(scroller.scrollHeight).toBe(3600); // 600 + 20 × 150: the same total as before the landing (2100 + 10 × 150)
    pumpFrames(ScrollRest.QUIET_FRAMES * 4);
    expect(writes.length).toBe(0);
    expect(reservoirOf(scroller).style.height).toBe('600px');
  });

  test('the list REPLACED (another chat’s rows and count in one commit): sized at the commit the same way, no step', () => {
    const { harness, scroller } = mount({ initial: rows(1, 10, 100), remaining: 0 });
    expect(reservoirOf(scroller).style.height).toBe('0px');
    act(() => {
      harness.replace(rows(201, 210, 100));
      harness.setRemaining(20);
    });
    expect(reservoirOf(scroller).style.height).toBe('2000px');
    expect(writes.length).toBe(0);
    readerScrollsTo(scroller, 2400);
    pumpFrames(ScrollRest.QUIET_FRAMES * 4);
    expect(writes.length).toBe(0);
    expect(reservoirOf(scroller).style.height).toBe('2000px');
  });
});

describe('the gate — onNeedMore', () => {
  test('asked once when the viewport enters the lead, not again in flight, re-asked after a landing that leaves it inside the lead, never with nothing remaining', () => {
    const asks: number[] = [];
    const { harness, scroller } = mount({
      initial: rows(1, 30, 100),
      remaining: 50,
      onNeedMore: () => {
        asks.push(1);
      },
    });
    // Reservoir 5000 above 3000 px of rows; the lead is 2 × 600 = 1200 px from the loaded start.
    readerScrollsTo(scroller, 7400); // the consumer's opening view: the end, 2400 from the start
    pumpFrames(1); // the opening ask's frame: outside the lead, nothing asked
    expect(asks.length).toBe(0);
    readerScrollsTo(scroller, 6100); // 1100 from the start: inside
    expect(asks.length).toBe(1);
    readerScrollsTo(scroller, 6000);
    readerScrollsTo(scroller, 5900);
    expect(asks.length).toBe(1); // in flight: once
    act(() => {
      harness.prepend(rows(101, 110, 100)); // lands: reservoir 4000; the reader is 1900 from the start — outside
    });
    expect(asks.length).toBe(1);
    readerScrollsTo(scroller, 4500); // 500 from the start
    expect(asks.length).toBe(2);
    act(() => {
      harness.prepend(rows(111, 115, 100)); // lands: reservoir 3500; the reader is 1000 from the start — inside: the chain asks
    });
    expect(asks.length).toBe(3);
    act(() => {
      harness.setRemaining(0);
    });
    readerScrollsTo(scroller, 3600);
    readerScrollsTo(scroller, 3500);
    expect(asks.length).toBe(3);
  });

  test('the ask’s own promise never reopens the gate, settled or failed; `loading` turning false does', async () => {
    let fail = true;
    const asks: number[] = [];
    const { harness, scroller } = mount({
      initial: rows(1, 30, 100),
      remaining: 50,
      onNeedMore: () => {
        asks.push(1);
        if (!fail) {
          return Promise.resolve();
        }
        // A failed read: the consumer owns its promise's rejection (the scroller never looks at the result).
        const failed = Promise.reject(new Error('the read failed'));
        failed.catch(() => undefined);
        return failed;
      },
    });
    pumpFrames(1);
    expect(asks.length).toBe(1);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    readerScrollsTo(scroller, 4000); // inside the lead; the failed read's settle reopens nothing
    pumpFrames(6);
    readerScrollsTo(scroller, 3900);
    expect(asks.length).toBe(1);
    act(() => {
      harness.setLoading(true);
    });
    act(() => {
      harness.setLoading(false); // the consumer's read ended with nothing to land: reopened, asked (#2)
    });
    expect(asks.length).toBe(2);
    fail = false;
    act(() => {
      harness.setLoading(true);
    });
    act(() => {
      harness.setLoading(false); // #3
    });
    expect(asks.length).toBe(3);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    readerScrollsTo(scroller, 3800); // #3 resolved with nothing landed: still in flight until `loading` says otherwise
    pumpFrames(6);
    expect(asks.length).toBe(3);
  });
});

describe('the gate — the settle precedes the commit', () => {
  test('a scroll event between a read’s settle and its rows’ commit never asks again; the commit reopens the gate', async () => {
    const asks: number[] = [];
    const resolvers: Array<() => void> = [];
    const { harness, scroller } = mount({
      initial: rows(1, 30, 100),
      remaining: 50,
      onNeedMore: () => {
        asks.push(1);
        return new Promise<void>((resolve) => resolvers.push(resolve));
      },
    });
    readerScrollsTo(scroller, 7400);
    pumpFrames(1);
    readerScrollsTo(scroller, 6100); // inside the lead: ask #1
    expect(asks.length).toBe(1);
    // The read settles (the consumer's continuation ran; React has not committed the rows yet).
    resolvers.shift()!();
    await Promise.resolve();
    await Promise.resolve();
    readerScrollsTo(scroller, 6000); // a scroll event in the gap — the engine pans on
    readerScrollsTo(scroller, 5950);
    pumpFrames(6); // however long the commit takes
    expect(asks.length).toBe(1);
    // The rows' commit: the gate reopens, and the chain asks only if still inside the lead.
    act(() => {
      harness.prepend(rows(101, 110, 100)); // reservoir 4000; the reader is 1950 from the start — outside
    });
    pumpFrames(4);
    expect(asks.length).toBe(1);
    readerScrollsTo(scroller, 4500); // 500 from the start: ask #2
    expect(asks.length).toBe(2);
  });
});

describe('the gate — one reopen per commit', () => {
  test('rows landing and `loading` turning false in the same commit ask once, not twice; a `loading` turn that arrives after the chain’s next ask closes the old read, never the new one', () => {
    const asks: number[] = [];
    const { harness, scroller } = mount({
      initial: rows(1, 30, 100),
      remaining: 50,
      onNeedMore: () => {
        asks.push(1);
      },
    });
    readerScrollsTo(scroller, 7400);
    pumpFrames(1);
    readerScrollsTo(scroller, 6100); // inside the lead: ask #1
    expect(asks.length).toBe(1);
    act(() => {
      harness.setLoading(true); // the consumer answers #1
    });
    readerScrollsTo(scroller, 5100);
    act(() => {
      harness.prepend(rows(101, 110, 100)); // the rows land AND the read ends in ONE commit
      harness.setLoading(false);
    });
    // Reservoir 4000; the reader is 1100 from the start — inside the lead: the chain asks ONCE (#2).
    expect(asks.length).toBe(2);
    act(() => {
      harness.setLoading(true); // the consumer answers #2
    });
    readerScrollsTo(scroller, 4100); // 100 from the start, #2 in flight: no ask
    act(() => {
      harness.prepend(rows(111, 120, 100)); // #2's rows land: reservoir 3000, the reader 1100 from the start — the chain asks #3
    });
    expect(asks.length).toBe(3);
    act(() => {
      harness.setLoading(false); // #2's read ends in a LATER commit: it belongs to #2, not to #3 in flight — no reopen
    });
    readerScrollsTo(scroller, 3100);
    expect(asks.length).toBe(3);
  });
});

describe('the gate — the scroller’s own box', () => {
  test('rows that landed while the scroller had no box: the box arriving re-judges the lead — asked once, not at the mount, not at the landing, not again in flight, never on a shrink; the landing re-judges as ever', () => {
    clientHeight = 0; // the pane has no geometry yet: a chat pane mounted display:none and laid out later
    const asks: number[] = [];
    const { harness, scroller } = mount({
      initial: rows(1, 10, 100),
      remaining: 20,
      onNeedMore: () => {
        asks.push(1);
      },
    });
    pumpFrames(1); // the opening ask's frame: no viewport, nothing to judge
    expect(asks.length).toBe(0);
    act(() => {
      harness.replace(rows(1, 10, 100)); // the live head lands over the copy's rows — the same keys, still no box
    });
    expect(asks.length).toBe(0);
    boxResizes(scroller, 600); // the pane gains its size: 2000 px of room above the reader, inside the lead of 1200
    expect(asks.length).toBe(1);
    boxResizes(scroller, 600); // the same box reported again
    boxResizes(scroller, 300); // a shrink
    boxResizes(scroller, 900); // growth while the ask is out
    expect(asks.length).toBe(1);
    act(() => {
      harness.prepend(rows(11, 20, 100)); // the landing reopens the gate and re-judges: 1000 px of room remain, inside the lead of 1800
    });
    expect(asks.length).toBe(2);
  });

  test('a box that grows is judged by the lead rule: nothing while the reader sits beyond the grown lead, the ask once the lead reaches the reader', () => {
    const asks: number[] = [];
    const { scroller } = mount({
      initial: rows(1, 30, 100),
      remaining: 50,
      onNeedMore: () => {
        asks.push(1);
      },
    });
    readerScrollsTo(scroller, 7400); // 2400 px below the loaded start; the lead is 2 × 600 = 1200
    pumpFrames(1);
    expect(asks.length).toBe(0);
    boxResizes(scroller, 900); // the lead 1800: the reader is still beyond it
    expect(asks.length).toBe(0);
    boxResizes(scroller, 1300); // the lead 2600 reaches the reader
    expect(asks.length).toBe(1);
  });
});

describe('the loading row', () => {
  test('renders at the reservoir’s foot only while loading with rows remaining, and changes scrollHeight by 0', () => {
    const { harness, scroller } = mount({
      initial: rows(1, 10, 100),
      remaining: 20,
      loadingRow: <div data-h={48} data-loading-face />,
    });
    const before = scroller.scrollHeight;
    expect(scroller.querySelector('[data-prepend-loading]')).toBeNull();
    act(() => {
      harness.setLoading(true);
    });
    const slot = scroller.querySelector('[data-prepend-loading]') as HTMLElement;
    expect(slot).not.toBeNull();
    expect(slot.parentElement).toBe(reservoirOf(scroller));
    expect(slot.querySelector('[data-loading-face]')).not.toBeNull();
    expect(scroller.scrollHeight).toBe(before);
    act(() => {
      harness.setRemaining(0);
    });
    expect(scroller.querySelector('[data-prepend-loading]')).toBeNull();
  });
});

describe('onRest — the one rest definition', () => {
  test('fires QUIET_FRAMES quiet frames after the last scroll event, not before, not under a finger; scrollend short-circuits', () => {
    const rests: number[] = [];
    const { scroller } = mount({ initial: rows(1, 10, 100), remaining: 0, onRest: () => rests.push(1) });
    readerScrollsTo(scroller, 100);
    pumpFrames(ScrollRest.QUIET_FRAMES - 1);
    expect(rests.length).toBe(0);
    pumpFrames(1);
    expect(rests.length).toBe(1);
    fingerDown(scroller);
    readerScrollsTo(scroller, 200);
    pumpFrames(10);
    expect(rests.length).toBe(1);
    fingerUp(scroller);
    pumpFrames(ScrollRest.QUIET_FRAMES);
    expect(rests.length).toBe(2);
    readerScrollsTo(scroller, 300);
    scroller.dispatchEvent(new Event('scrollend'));
    expect(rests.length).toBe(3);
  });

  test('ScrollRest: a scrollbar press is an arm; request() lands QUIET_FRAMES frames later, never in the asking task', () => {
    const scroller = document.createElement('div');
    Object.defineProperty(scroller, 'clientWidth', { get: () => 390 });
    Object.defineProperty(scroller, 'clientHeight', { get: () => 600 });
    Object.defineProperty(scroller, 'scrollHeight', { get: () => 2000 });
    let rests = 0;
    const rest = new ScrollRest(() => rests++);
    rest.attach(scroller);
    expect(rest.atRest).toBe(true);
    rest.request();
    expect(rests).toBe(0);
    pumpFrames(ScrollRest.QUIET_FRAMES);
    expect(rests).toBe(1);
    const press = new MouseEvent('pointerdown');
    Object.defineProperty(press, 'offsetX', { get: () => 395 }); // on the vertical scrollbar, right of the client box
    Object.defineProperty(press, 'offsetY', { get: () => 100 });
    scroller.dispatchEvent(press);
    expect(rest.armDown).toBe(true);
    rest.request();
    pumpFrames(10);
    expect(rests).toBe(1);
    scroller.dispatchEvent(new MouseEvent('pointerup'));
    expect(rest.armDown).toBe(false);
    pumpFrames(ScrollRest.QUIET_FRAMES);
    expect(rests).toBe(2);
    rest.detach();
  });
});

describe('apiRef', () => {
  test('distanceFromLoadedStart and reservePx read the geometry', () => {
    const apiRef: React.MutableRefObject<PrependSafeScrollerApi | null> = { current: null };
    const { scroller } = mount({ initial: rows(1, 10, 100), remaining: 20, apiRef });
    readerScrollsTo(scroller, 2350);
    expect(apiRef.current!.scroller).toBe(scroller);
    expect(apiRef.current!.reservePx()).toBe(2000);
    expect(apiRef.current!.distanceFromLoadedStart()).toBe(350);
    expect(PrependReservoir.STEP_VIEWPORTS).toBe(1);
  });
});

describe('true lengths — a pane drawn at a scale: every length is the layout’s own', () => {
  test('a refill step with the pane drawn at 0.95 leaves the reader’s row at its true offset — the write is the step, never the step as drawn', () => {
    const { harness, scroller } = mount({ initial: rows(1, 20, 100), remaining: 25 });
    expect(reservoirOf(scroller).style.height).toBe('2500px');
    readerScrollsTo(scroller, 3900); // row 15 (top 3900) first visible at offset 0
    drawnScale = 0.95; // the host draws the pane small: every rect at 0.95, the layout untouched
    act(() => {
      harness.setRemaining(40); // the target is now 4000: the block trails it by 1500 with rows still above — a refill
    });
    // A viewport per rest: the block grows by 600 TRUE px and the reader's row is held by a write of 600 — the drift
    // as the rects draw it (570) written instead leaves the row 30 px lower at every step.
    [3100, 3700].forEach((expected, index) => {
      pumpFrames(ScrollRest.QUIET_FRAMES);
      expect(reservoirOf(scroller).style.height).toBe(`${expected}px`);
      expect(trueOffsetOf(scroller, 15)).toBe(0);
      expect(scroller.scrollTop).toBe(3900 + 600 * (index + 1));
      expect(writes.length).toBe(index + 1);
    });
    pumpFrames(12);
    expect(writes.length).toBe(2); // 3700 is within a viewport of 4000: nothing more owed
  });

  test('a landing of older rows after a record taken with the pane drawn at 0.95 shrinks the block by the landed height and no more — and a landing read at 0.95 after a record at 1 the same', () => {
    const { harness, scroller } = mount({ initial: rows(1, 10, 100), remaining: 20 });
    expect(reservoirOf(scroller).style.height).toBe('2000px');
    readerScrollsTo(scroller, 2350); // row 4 first visible, 50 px above the edge
    drawnScale = 0.95;
    act(() => {
      harness.replace(rows(1, 10, 100)); // a commit that keeps the first row: its place is recorded under the scale
    });
    drawnScale = 1; // the host draws the pane at its size again
    act(() => {
      harness.prepend(rows(101, 105, 120)); // 600 px land above the reader
    });
    // The block gives up the 600 that landed — a place recorded as drawn (1900 for 2000) would take 100 more.
    expect(reservoirOf(scroller).style.height).toBe('1400px');
    expect(scroller.scrollHeight).toBe(3000);
    expect(trueOffsetOf(scroller, 4)).toBe(-50);
    drawnScale = 0.95; // and the other way: recorded at its size, landed under the scale
    act(() => {
      harness.prepend(rows(201, 205, 80)); // 400 px
    });
    expect(reservoirOf(scroller).style.height).toBe('1000px');
    expect(scroller.scrollHeight).toBe(3000);
    expect(trueOffsetOf(scroller, 4)).toBe(-50);
    expect(writes.length).toBe(0);
    pumpFrames(ScrollRest.QUIET_FRAMES * 4);
    expect(writes.length).toBe(0); // the block sits on its target: nothing owed
  });

  test('a block sized with the pane drawn at 0.95 is the size it is at 1', () => {
    drawnScale = 0.95;
    const { scroller } = mount({ initial: rows(1, 10, 100), remaining: 20 });
    // The mounted rows measure a mean of 100 whatever they are drawn at: 20 remaining → 2000, never 20 × 95.
    expect(reservoirOf(scroller).style.height).toBe('2000px');
    expect(scroller.scrollHeight).toBe(3000);
  });

  test('growth above the reader is judged in the layout’s own lengths at 0.95: the reader’s own row growing is not absorbed, a row wholly above is', () => {
    const { scroller } = mount({ initial: rows(1, 10, 100), remaining: 20 });
    readerScrollsTo(scroller, 2390); // row 4 is the reader's row: its top 90 px above the edge, its bottom 10 px below
    drawnScale = 0.95;
    resize(rowBox(scroller, 4), 500); // the reader's own row grows by 400 below the edge: nothing above the reader changed
    expect(reservoirOf(scroller).style.height).toBe('2000px');
    expect(trueOffsetOf(scroller, 4)).toBe(-90);
    resize(rowBox(scroller, 3), 40); // row 3, wholly above the edge, shrinks by 60: the block takes it
    expect(reservoirOf(scroller).style.height).toBe('2060px');
    expect(trueOffsetOf(scroller, 4)).toBe(-90);
    expect(writes.length).toBe(0);
  });

  test('the distance from the loaded start is the true one at 0.95 — the api reads it and the gate asks by it', () => {
    const asks: number[] = [];
    const apiRef: React.MutableRefObject<PrependSafeScrollerApi | null> = { current: null };
    const { scroller } = mount({
      initial: rows(1, 30, 100),
      remaining: 50,
      apiRef,
      onNeedMore: () => {
        asks.push(1);
      },
    });
    // Reservoir 5000 above 3000 px of rows; the lead is 2 × 600 = 1200 px from the loaded start.
    readerScrollsTo(scroller, 7400);
    pumpFrames(1); // the opening ask's frame: outside the lead
    expect(asks.length).toBe(0);
    drawnScale = 0.95;
    readerScrollsTo(scroller, 6250); // 1250 from the start: outside the lead (as drawn, 937.5 — inside it)
    expect(apiRef.current!.distanceFromLoadedStart()).toBe(1250);
    expect(asks.length).toBe(0);
    readerScrollsTo(scroller, 6100); // 1100 from the start: inside
    expect(apiRef.current!.distanceFromLoadedStart()).toBe(1100);
    expect(asks.length).toBe(1);
  });

  test('a consumer’s own length — a row’s edge below the scroller’s top, a row’s own height — read through the api’s trueLength is the layout’s own at 0.95; with nothing drawn to a scale it is the length as read', () => {
    const apiRef: React.MutableRefObject<PrependSafeScrollerApi | null> = { current: null };
    const { scroller } = mount({ initial: rows(1, 10, 100), remaining: 20, apiRef });
    readerScrollsTo(scroller, 2350); // row 4 first visible, 50 px above the edge; row 9 450 px below it
    const edgeBelowTheTop = (id: number) =>
      rowBox(scroller, id).getBoundingClientRect().top - scroller.getBoundingClientRect().top;
    const asRead = edgeBelowTheTop(9) + 0.123456789; // a length no grid holds
    expect(Object.is(apiRef.current!.trueLength(asRead), asRead)).toBe(true);
    drawnScale = 0.95;
    expect(edgeBelowTheTop(9)).not.toBe(450); // as drawn: 427.5
    expect(apiRef.current!.trueLength(edgeBelowTheTop(9))).toBe(450);
    expect(apiRef.current!.trueLength(edgeBelowTheTop(4))).toBe(-50);
    expect(apiRef.current!.trueLength(rowBox(scroller, 9).getBoundingClientRect().height)).toBe(100);
  });
});

describe('true lengths — with nothing drawn to a scale every number is the one the rects give, bit for bit', () => {
  /**
   * Lengths no grid holds, through every length the scroller reads: a sizing, a landing, growth above the reader, a
   * refill step with its write, and the distance from the loaded start.
   */
  const everyLength = (): Array<string | number> => {
    const apiRef: React.MutableRefObject<PrependSafeScrollerApi | null> = { current: null };
    const { harness, scroller } = mount({ initial: rows(1, 20, 33.3), remaining: 25, apiRef });
    const read: Array<string | number> = [reservoirOf(scroller).style.height];
    readerScrollsTo(scroller, 877.3);
    act(() => {
      harness.prepend(rows(101, 107, 41.9));
    });
    read.push(reservoirOf(scroller).style.height);
    resize(rowBox(scroller, 103), 57.3);
    read.push(reservoirOf(scroller).style.height);
    act(() => {
      harness.setRemaining(60);
    });
    pumpFrames(ScrollRest.QUIET_FRAMES);
    read.push(reservoirOf(scroller).style.height, scroller.scrollTop, apiRef.current!.distanceFromLoadedStart());
    read.push(writes.length);
    return read;
  };
  /** What the rects give with no ruler at all (read at the scroller as it was before it had one). */
  const AS_THE_RECTS_GIVE: Array<string | number> = [
    '832.4999999999999px', // the block sized: 25 × the mounted rows' mean
    '539.1999999999998px', // seven rows landed
    '523.7999999999998px', // a row above the reader grew
    '1123.7999999999997px', // one refill step …
    1477.3000000000006, // … its write …
    353.5000000000009, // … and the distance from the loaded start after it
    1, // one write in all
  ];

  test('a pane drawn as laid out', () => {
    expect(everyLength()).toEqual(AS_THE_RECTS_GIVE);
  });

  test('the ruler read a rounding off its own length (the engine’s arithmetic on a long box, a zoomed page): nothing is drawn to a scale, and nothing is converted', () => {
    rulerReadsOffBy = 1 / 128;
    expect(everyLength()).toEqual(AS_THE_RECTS_GIVE);
  });

  test('never a drawn length over the scroller’s layout height: a pane drawn 599.67 px tall where the layout says 600, nothing scaled — every number is the one it is at a whole height', () => {
    scrollerDrawnHeight = 599.67;
    expect(everyLength()).toEqual(AS_THE_RECTS_GIVE);
  });

  test('far down a long list: a block of 2,130,000 px drawn through a transform that scales nothing (every edge in single precision) — the ruler reads its own length where the reader is, and the distance from the loaded start is the rects’ own, bit for bit, at sixteen places of the reader', () => {
    const apiRef: React.MutableRefObject<PrependSafeScrollerApi | null> = { current: null };
    const { scroller } = mount({ initial: rows(1, 20, 100), remaining: 21300, apiRef });
    expect(reservoirOf(scroller).style.height).toBe('2130000px');
    heldInFloats = true;
    const offTheRects: number[] = [];
    for (const back of [0, 137, 700, 1400]) {
      for (const fraction of [0.4, 0.1, 0.6, 0.9]) {
        readerScrollsTo(scroller, 2130000 - back + fraction); // the reader at, and just above, the loaded start
        const asTheRectsGive =
          scroller.getBoundingClientRect().top - reservoirOf(scroller).getBoundingClientRect().top - 2130000;
        offTheRects.push(apiRef.current!.distanceFromLoadedStart() - asTheRectsGive);
      }
    }
    // A ruler read from the block's top there has its two edges either side of 2^21 px, held to a quarter and an
    // eighth of a px: it reads an eighth off its own length, is taken for a scale, and every length is converted.
    expect(offTheRects).toEqual(offTheRects.map(() => 0));
  });
});

describe('a pane shown again is not rows growing', () => {
  test('a scroller hidden and shown again with the reader mid-list has the block it had and owes no step at the next rest; a row that changed while the pane had no box is its size as mounted; growth above the reader is absorbed again from there', () => {
    const apiRef: React.MutableRefObject<PrependSafeScrollerApi | null> = { current: null };
    const { scroller } = mount({ initial: rows(1, 20, 100), remaining: 25, apiRef });
    expect(reservoirOf(scroller).style.height).toBe('2500px');
    readerScrollsTo(scroller, 3700); // mid-list: row 13 (top 3700) at the edge, rows 1–12 above it
    paneLosesItsBox(); // the pane is kept and hidden: every observed box reports a size of 0
    // With no box no rect holds a length and the ruler none to read a scale from: the distance is the room alone.
    expect(apiRef.current!.distanceFromLoadedStart()).toBe(-2500);
    paneGetsItsBox(); // shown again …
    readerScrollsTo(scroller, 3700); // … the view where it was (the consumer's own park; the engine's kept offset) …
    engineReportsSizes(); // … and every row reports its size: as mounted — not twelve rows growing above the reader
    expect(reservoirOf(scroller).style.height).toBe('2500px');
    expect(scroller.scrollHeight).toBe(4500);
    expect(trueOffsetOf(scroller, 13)).toBe(0);
    pumpFrames(ScrollRest.QUIET_FRAMES * 4);
    expect(writes.length).toBe(0); // no refill is owed: no step, no write
    expect(reservoirOf(scroller).style.height).toBe('2500px');

    paneLosesItsBox();
    rowBox(scroller, 2).setAttribute('data-h', '160'); // a row above the reader changes while the pane has no box
    paneGetsItsBox();
    readerScrollsTo(scroller, 3760); // the consumer parks on the same row
    engineReportsSizes(); // row 2's first report after the box returned is its size as mounted, never growth
    expect(reservoirOf(scroller).style.height).toBe('2500px');
    expect(scroller.scrollHeight).toBe(4560);
    expect(trueOffsetOf(scroller, 13)).toBe(0);
    pumpFrames(ScrollRest.QUIET_FRAMES * 4);
    expect(writes.length).toBe(0);

    resize(rowBox(scroller, 1), 160); // with its box back, a row above the reader that grows is absorbed as ever
    expect(reservoirOf(scroller).style.height).toBe('2440px');
    expect(scroller.scrollHeight).toBe(4560);
    expect(trueOffsetOf(scroller, 13)).toBe(0);
    expect(writes.length).toBe(0);
  });
});

describe('no box has one owner, and every read passes it', () => {
  const layoutTopOf = (scroller: HTMLElement, id: number) => layoutOf(scroller).rects.get(rowBox(scroller, id))!.top;
  /** The consumer places its view on a row when the pane is shown (its own park). */
  const park = (scroller: HTMLElement, id: number) => readerScrollsTo(scroller, layoutTopOf(scroller, id));

  test('a commit that keeps the first row while the pane has no box, the pane shown again, then older rows land: the reader’s row holds and the landing is height-neutral', () => {
    const { harness, scroller } = mount({ initial: rows(1, 20, 100), remaining: 25 });
    readerScrollsTo(scroller, 3700); // row 13 at the edge
    paneLosesItsBox();
    act(() => {
      harness.replace(rows(1, 20, 100)); // a commit while hidden (a reply that streams on): the same first row
    });
    paneGetsItsBox();
    park(scroller, 13);
    engineReportsSizes();
    pumpFrames(ScrollRest.QUIET_FRAMES * 4);
    const offsetBefore = trueOffsetOf(scroller, 13);
    const extentBefore = scroller.scrollHeight;
    act(() => {
      harness.prepend(rows(101, 105, 120)); // 600 px land above the reader
    });
    // A place recorded from a pane with no box is 0, and the landing measured against it takes the whole block.
    expect(reservoirOf(scroller).style.height).toBe('1900px');
    expect(reservoirOf(scroller).style.marginBottom).toBe('0px');
    expect(trueOffsetOf(scroller, 13)).toBe(offsetBefore);
    expect(scroller.scrollHeight).toBe(extentBefore);
    expect(writes.length).toBe(0);
  });

  test('a pane MOUNTED with no box and shown later, then older rows land: no place was ever recorded, and the landing is measured from the first row’s place as it is — the reader’s row holds, height-neutral', () => {
    paneHasBox = false; // a kept pane mounted hidden
    const { harness, scroller } = mount({ initial: rows(1, 20, 100), remaining: 25 });
    expect(reservoirOf(scroller).style.height).toBe('2500px'); // 25 × the seed: no row there has a length to measure
    paneGetsItsBox();
    park(scroller, 13);
    engineReportsSizes();
    pumpFrames(ScrollRest.QUIET_FRAMES * 4);
    const offsetBefore = trueOffsetOf(scroller, 13);
    const extentBefore = scroller.scrollHeight;
    act(() => {
      harness.prepend(rows(101, 105, 120)); // 600 px land above the reader
    });
    expect(reservoirOf(scroller).style.height).toBe('1900px');
    expect(reservoirOf(scroller).style.marginBottom).toBe('0px');
    expect(trueOffsetOf(scroller, 13)).toBe(offsetBefore);
    expect(scroller.scrollHeight).toBe(extentBefore);
    expect(writes.length).toBe(0);
  });

  test('older rows land WHILE the pane has no box: nothing is taken out of the block unread, and the room owed is paid at the rest with the reader’s row held where the consumer put it', () => {
    const { harness, scroller } = mount({ initial: rows(1, 20, 100), remaining: 25 });
    readerScrollsTo(scroller, 3700);
    paneLosesItsBox();
    act(() => {
      harness.prepend(rows(101, 108, 120)); // eight rows (960 px) land above while hidden; seventeen remain
    });
    expect(reservoirOf(scroller).style.height).toBe('2500px'); // their height is no length yet: nothing taken
    paneGetsItsBox();
    // Held from where the CONSUMER puts the view at the return: the scroller cannot hold what it could not read. A
    // consumer that places nothing there finds the row lower by the landed height.
    park(scroller, 13);
    engineReportsSizes();
    const before = trueOffsetOf(scroller, 13);
    pumpFrames(ScrollRest.QUIET_FRAMES * 4);
    expect(reservoirOf(scroller).style.height).toBe('1900px'); // one viewport toward the room for seventeen
    expect(trueOffsetOf(scroller, 13)).toBe(before);
    expect(writes.length).toBe(1);
  });

  test('a rest pending when the pane loses its box fires once and asks for no frame after it, nothing is stepped unread, and what was owed is paid at the first rests after the box returns with no scroll of the consumer’s — a shrink owed at the hide; and a block merely inside its band, the reader’s last scroll just before the hide', () => {
    let rests = 0;
    const onRest = () => {
      rests++;
    };
    // A SHRINK OWED AT THE HIDE.
    const shrink = mount({ initial: rows(1, 10, 100), remaining: 20, onRest });
    readerScrollsTo(shrink.scroller, 2350); // row 4 first visible, 50 px above the edge
    pumpFrames(ScrollRest.QUIET_FRAMES * 4);
    act(() => {
      shrink.harness.setRemaining(10); // the target is 1000 for a block of 2000: a shrink is owed at the next rest …
    });
    paneLosesItsBox(); // … and the pane is hidden before that rest
    rests = 0;
    pumpFrames(600); // ten seconds of frames with the pane hidden
    expect(rests).toBe(1);
    expect(frameQueue.length).toBe(0);
    expect(reservoirOf(shrink.scroller).style.height).toBe('2000px');
    expect(writes.length).toBe(0);
    paneGetsItsBox();
    engineReportsSizes(); // the engine's reports at the return, the offset as it was kept: nobody scrolls
    expect(trueOffsetOf(shrink.scroller, 4)).toBe(-50);
    pumpFrames(ScrollRest.QUIET_FRAMES * 12);
    // Two steps, each bounded by the reader's 350 px from the loaded start, bring the block inside its band.
    expect(reservoirOf(shrink.scroller).style.height).toBe('1300px');
    expect(trueOffsetOf(shrink.scroller, 4)).toBe(-50);
    expect(frameQueue.length).toBe(0);

    // A BLOCK MERELY INSIDE ITS BAND: nothing is owed with a box, and nothing with none.
    tearDown();
    setUp();
    const inBand = mount({ initial: rows(1, 10, 100), remaining: 20, onRest });
    readerScrollsTo(inBand.scroller, 2350);
    pumpFrames(ScrollRest.QUIET_FRAMES * 4);
    act(() => {
      inBand.harness.prepend(rows(101, 103, 130)); // a landing leaves the block about 208 px off its target
    });
    pumpFrames(ScrollRest.QUIET_FRAMES * 4);
    expect(reservoirOf(inBand.scroller).style.height).toBe('1610px');
    readerScrollsTo(inBand.scroller, 2400); // the reader's last scroll …
    paneLosesItsBox(); // … and the pane is hidden before its rest
    rests = 0;
    pumpFrames(600);
    expect(rests).toBe(1);
    expect(frameQueue.length).toBe(0);
    expect(reservoirOf(inBand.scroller).style.height).toBe('1610px');
    expect(writes.length).toBe(0);
  });

  test('a scroller rendered with no height of its own, its rows laid out, is not a pane with no box: given its height later, growth above the reader is absorbed', () => {
    clientHeight = 0; // mounted before its height: every row has its box
    const { scroller } = mount({ initial: rows(1, 20, 100), remaining: 25 });
    boxResizes(scroller, 600);
    readerScrollsTo(scroller, 3700); // row 13 at the edge, rows 1–12 above it
    resize(rowBox(scroller, 2), 160);
    expect(reservoirOf(scroller).style.height).toBe('2440px');
    expect(trueOffsetOf(scroller, 13)).toBe(0);
    expect(writes.length).toBe(0);
  });

  test('a scroller squeezed to no height for a moment while a row below the reader changes, then given its height back: growth above the reader is absorbed', () => {
    const { scroller } = mount({ initial: rows(1, 20, 100), remaining: 25 });
    readerScrollsTo(scroller, 3700);
    boxResizes(scroller, 0); // squeezed: no height, every row still laid out
    resize(rowBox(scroller, 20), 130); // a row below the reader reports under it
    boxResizes(scroller, 600);
    readerScrollsTo(scroller, 3700);
    resize(rowBox(scroller, 2), 160);
    expect(reservoirOf(scroller).style.height).toBe('2440px');
    expect(trueOffsetOf(scroller, 13)).toBe(0);
    expect(writes.length).toBe(0);
  });

  test('a scroller squeezed to no height while a row ABOVE the reader grows: absorbed there and then, as with a height', () => {
    const { scroller } = mount({ initial: rows(1, 20, 100), remaining: 25 });
    readerScrollsTo(scroller, 3700);
    boxResizes(scroller, 0);
    resize(rowBox(scroller, 2), 160);
    expect(reservoirOf(scroller).style.height).toBe('2440px');
    expect(trueOffsetOf(scroller, 13)).toBe(0);
    expect(writes.length).toBe(0);
  });

  test('a layout that draws no ruler (a consumer’s own modeled layout) says no box with the scroller’s height — with a height it is read as ever: a landing is absorbed, growth above the reader is absorbed', () => {
    rulerIsDrawn = false;
    const { harness, scroller } = mount({ initial: rows(1, 10, 100), remaining: 20 });
    expect(reservoirOf(scroller).style.height).toBe('2000px');
    readerScrollsTo(scroller, 2350); // row 4 first visible, 50 px above the edge
    act(() => {
      harness.prepend(rows(101, 105, 120)); // 600 px land above the reader
    });
    expect(reservoirOf(scroller).style.height).toBe('1400px');
    expect(offsetOf(scroller, 4)).toBe(-50);
    resize(rowBox(scroller, 1), 160);
    expect(reservoirOf(scroller).style.height).toBe('1340px');
    expect(offsetOf(scroller, 4)).toBe(-50);
    expect(writes.length).toBe(0);
  });

  test('the reservoir’s own doors, whoever calls them: with no box growth is neither judged above the reader nor absorbed, nothing is owed and a step moves nothing; and after the block moved by the reservoir’s own write a landing is measured from the first row’s place as it is', () => {
    // The reservoir alone over a bare scroller, as its second consumer (a windowed list) drives it.
    const scroller = document.createElement('div');
    modelScroller(scroller);
    container.appendChild(scroller);
    const block = document.createElement('div');
    block.setAttribute('data-prepend-reservoir', '');
    scroller.appendChild(block);
    const addRow = (id: number, before: Element | null) => {
      const wrapper = document.createElement('div');
      wrapper.setAttribute('data-prepend-row', String(id));
      const box = document.createElement('div');
      box.setAttribute('data-h', '100');
      wrapper.appendChild(box);
      scroller.insertBefore(wrapper, before);
    };
    rows(1, 20, 100).forEach((row) => addRow(row.id, null));
    const boxes = () => Array.from(scroller.querySelectorAll<HTMLElement>('[data-prepend-row] > [data-h]'));
    const reservoir = new PrependReservoir(scroller, block, boxes);
    reservoir.setRemaining(25, 100);
    reservoir.initialize();
    expect(block.style.height).toBe('2500px');
    readerScrollsTo(scroller, 3700); // row 13 at the edge, rows 1–12 above it

    paneHasBox = false;
    expect(reservoir.aboveReader(rowBox(scroller, 2), 60)).toBe(false);
    reservoir.absorbGrowth(60);
    expect(block.style.height).toBe('2500px');
    reservoir.setRemaining(10, 100); // a shrink of 1500 px is wanted
    expect(reservoir.owed(600)).toBe(false);
    expect(reservoir.step(600)).toBe(0);
    expect(block.style.height).toBe('2500px');
    reservoir.setRemaining(25, 100);

    paneHasBox = true;
    reservoir.record(); // the first row's place, with the box back
    reservoir.setWindowAbove(300); // the block grows by a window's rows above: the reservoir's own write
    expect(block.style.height).toBe('2800px');
    const first = boxes()[0];
    rows(101, 105, 100).forEach((row) => addRow(row.id, first.parentElement)); // 500 px land above the first row
    expect(reservoir.land(first, 5)).toBe(500);
    expect(block.style.height).toBe('2300px');
  });
});
