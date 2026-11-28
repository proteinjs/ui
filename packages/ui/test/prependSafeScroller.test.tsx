/**
 * @jest-environment jsdom
 *
 * PrependSafeScroller (src/list/PrependSafeScroller.tsx) with its start edge (ListStartEdge) and the one rest
 * definition (ScrollRest), under a MODELLED LAYOUT: jsdom lays nothing out, so the scroller's clientHeight,
 * scrollHeight and scrollTop, and every box's rect, are computed here from the DOM order, each row's declared
 * height (`data-h`) and the start edge's own inline style — the geometry a real engine would give. `scrollTop`'s
 * setter is a spy: every programmatic write is counted, with the state the list was in when it was made, and a
 * write IS the outcome these laws forbid or allow.
 *
 * The laws, asserted as outcomes:
 *  1. A LANDING MOVES NOTHING AND WRITES NOTHING. The list is a plain list of real rows — no room stands above the
 *     loaded start, before a landing or after it. K rows landing at the start change the scroller's scrollHeight by
 *     0 and write scrollTop never: the height they added above the reader's row is held out of the scroll range in
 *     the rows' own commit, and the reader's row keeps its offset. Under a held finger the same, and the rows land
 *     at once (no hold).
 *  2. WHAT IS HELD IS PAID WHOLE, WITH ONE WRITE, AT THE REST: never under a finger, never while scroll events keep
 *     arriving, never a second time — however the heights of the rows above compare with the rows below.
 *  3. WHERE THE READER HAS RUN OUT OF LOADED ROWS (the scroller's top edge at the loaded start) nothing waits for a
 *     rest: what is held is settled at once with no known finger down, at the lift with one, and rows that land
 *     while the reader stands there are settled as they land. The consumer is told once per arrival (`onRest`), so
 *     rows it holds as data land there. At a list's true start — nothing remaining, nothing held — nothing happens.
 *  4. THE STOP: on a device with touch input the list is stopped (its overflow hidden) for one painted frame, then
 *     the one write, then the overflow is back; rows that landed above the scroll origin are not painted until that
 *     write. No stop where it would change the scroller's width; a landing inside the stopped frame is paid by the
 *     same write; an owner that leaves inside it leaves the overflow as it found it.
 *  5. ONE MEASURE, THE READER'S OWN ROW: whatever a commit does above the reader — rows landing, the row that was
 *     first moving down among them, the first row leaving, the reader's own row leaving — the reader's row (the
 *     first row after it that is still there) keeps its offset, with no write. A row above the reader that grows
 *     later is held the same way (the resize observation). A list replaced or filled from empty holds nothing.
 *  The gate: `onNeedMore` leaves when the viewport enters the lead, once per read, re-asked after a landing that
 *  leaves the viewport inside the lead, never with nothing remaining; a settled promise or `loading` false reopens
 *  it. THE SCROLLER'S OWN BOX: rows that landed while the scroller had no geometry (a pane mounted hidden, laid out
 *  later) were judged against no viewport — the box gaining height re-judges the lead, by the same rule, once.
 *  The loading face floats over the start of the rows only while loading with rows remaining, and takes no room.
 *  The fact on the root (`PREPEND_ROWS_ABOVE_ATTR`) stands while rows remain above or are held above the origin.
 *  `onRest` fires at the rest and not before — the four conditions of ScrollRest, each with its case: no touch the
 *  page was told of (counted, its end heard on its own target), the engine's `scrollend` inside a gesture a finger
 *  began, QUIET_MS of clock time since the last scroll event, the scroller inside its range — and the lift is told
 *  in its own task. `apiRef` reads the geometry and asks for a rest.
 */
import React, { forwardRef, useImperativeHandle, useState } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { PrependSafeScroller, PrependSafeScrollerApi, PREPEND_ROWS_ABOVE_ATTR } from '../src/list/PrependSafeScroller';
import { ScrollRest } from '../src/list/ScrollRest';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// ── The clock: the rest is CLOCK time (ScrollRest.QUIET_MS), so the suite runs on jest's clock and advances it;
//    animation frames stay the manual pump below. ──
jest.useFakeTimers({
  doNotFake: [
    'requestAnimationFrame',
    'cancelAnimationFrame',
    'nextTick',
    'queueMicrotask',
    'setImmediate',
    'clearImmediate',
  ],
});

// ── Frames: requestAnimationFrame as a manual pump — what the scroller asks of a frame (its opening ask, a stop). ──
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
/** A 60 Hz screen's frame. */
const FRAME_MS = 16;
/** Time passes: the clock, and the frames a 60 Hz screen paints in it. */
const elapse = (ms: number) => {
  for (let left = ms; left > 0; left -= FRAME_MS) {
    jest.advanceTimersByTime(Math.min(FRAME_MS, left));
    if (left >= FRAME_MS) {
      pumpFrames(1);
    }
  }
};
/** A screen paints `count` frames, `frameMs` apart. */
const framesPass = (count: number, frameMs: number) => {
  for (let k = 0; k < count; k++) {
    jest.advanceTimersByTime(frameMs);
    pumpFrames(1);
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
    // The observation's first report: the size as mounted.
    this.entry.callback([entryFor(target)]);
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
/** Every programmatic write of scrollTop, and the list as it stood when each was made. */
const writes: number[] = [];
const writtenWith: Array<{ overflowY: string; edgeHeight: string; edgeMargin: string }> = [];
const heightOf = (el: Element) => Number(el.getAttribute('data-h') ?? 0);
const layoutOf = (scroller: Element) => {
  const edge = scroller.querySelector('[data-prepend-start-edge]') as HTMLElement;
  // What the edge holds inside it is laid out as an engine would: out of the flow it adds nothing, in the flow its height.
  const within = Array.from(edge.children).reduce(
    (sum, child) =>
      sum + ((child as HTMLElement).style.position === 'absolute' ? 0 : heightOf(child.firstElementChild ?? child)),
    0
  );
  const edgeHeight = (parseFloat(edge.style.height) || 0) + within;
  const edgeMargin = parseFloat(edge.style.marginBottom) || 0;
  const rects = new Map<Element, { top: number; bottom: number }>();
  let y = 0;
  rects.set(edge, { top: y, bottom: y + edgeHeight });
  y += edgeHeight + edgeMargin;
  Array.from(scroller.children).forEach((child) => {
    if (child === edge) {
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
const realRect = Element.prototype.getBoundingClientRect;
Element.prototype.getBoundingClientRect = function (this: Element): DOMRect {
  const scroller = this.closest('[data-model-scroller]');
  if (!scroller) {
    return realRect.call(this);
  }
  if (this === scroller) {
    return rect(0, clientHeight);
  }
  const entry = layoutOf(scroller).rects.get(this);
  return entry ? rect(entry.top - scrollTopValue, entry.bottom - scrollTopValue) : rect(0, 0);
};
/** The scroller element takes the model's scroll geometry; its scrollTop setter is the write spy. */
const modelScroller = (el: HTMLElement) => {
  el.setAttribute('data-model-scroller', '');
  Object.defineProperty(el, 'clientHeight', { get: () => clientHeight, configurable: true });
  Object.defineProperty(el, 'scrollHeight', {
    get: () => Math.max(clientHeight, layoutOf(el).contentHeight),
    configurable: true,
  });
  Object.defineProperty(el, 'scrollTop', {
    get: () => scrollTopValue,
    set: (value: number) => {
      const edge = edgeOf(el);
      writes.push(value);
      writtenWith.push({
        overflowY: el.style.overflowY,
        edgeHeight: edge.style.height,
        edgeMargin: edge.style.marginBottom,
      });
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
/** A touch event as an engine sends it: on the element the touch began on, naming the touches that began or ended. */
const touch = (type: 'touchstart' | 'touchend' | 'touchcancel', target: EventTarget, ...identifiers: number[]) => {
  const event = new Event(type, { bubbles: true });
  Object.defineProperty(event, 'changedTouches', { value: identifiers.map((identifier) => ({ identifier })) });
  target.dispatchEvent(event);
};
/** An engine that fires `scrollend`: ScrollRest chooses its source of "the scroll has ended" once, when it is made. */
const engineFiresScrollEnd = () => {
  Object.defineProperty(window, 'onscrollend', { value: null, configurable: true, writable: true });
};
/** A device with touch input (a finger can move the list), or one without (jsdom's own word: none). */
const touchInput = (points: number | undefined) => {
  Object.defineProperty(window.navigator, 'maxTouchPoints', { value: points, configurable: true });
};
const rowBox = (scroller: HTMLElement, id: number) =>
  scroller.querySelector(`[data-prepend-row="${id}"] > [data-h]`) as HTMLElement;
const rowWrapper = (scroller: HTMLElement, id: number) =>
  scroller.querySelector(`[data-prepend-row="${id}"]`) as HTMLElement;
const offsetOf = (scroller: HTMLElement, id: number) => rowBox(scroller, id).getBoundingClientRect().top;
function edgeOf(scroller: HTMLElement): HTMLElement {
  return scroller.querySelector('[data-prepend-start-edge]') as HTMLElement;
}

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

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  scrollTopValue = 0;
  clientHeight = CLIENT_HEIGHT;
  writes.length = 0;
  writtenWith.length = 0;
  frameQueue.length = 0;
  observers.length = 0;
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  delete (window as unknown as { onscrollend?: unknown }).onscrollend;
  touchInput(undefined);
});

describe('law 1 — a landing moves nothing and writes nothing', () => {
  test('K rows at the start: no room above the loaded start before or after, scrollHeight unchanged, scrollTop never written, the landed height held out of the scroll range, the reader’s row holding', () => {
    const { harness, scroller } = mount({ initial: rows(1, 10, 100), remaining: 20 });
    // A plain list of real rows: 20 rows remain above and nothing stands for them.
    expect(edgeOf(scroller).style.height).toBe('0px');
    expect(scroller.scrollHeight).toBe(1000);
    readerScrollsTo(scroller, 350); // row 4 (top 300) is the first visible, 50 px above the edge
    expect(offsetOf(scroller, 4)).toBe(-50);

    act(() => {
      harness.prepend(rows(101, 105, 120)); // 600 px land above the reader
    });

    expect(scroller.scrollHeight).toBe(1000);
    expect(writes.length).toBe(0);
    expect(edgeOf(scroller).style.height).toBe('0px');
    expect(edgeOf(scroller).style.marginBottom).toBe('-600px');
    expect(offsetOf(scroller, 4)).toBe(-50);
    expect(scroller.scrollTop).toBe(350);
  });

  test('under a held finger the rows land at once, held, with no write; the one write waits for the lift', () => {
    const { harness, scroller } = mount({ initial: rows(1, 10, 100), remaining: 20 });
    readerScrollsTo(scroller, 350);
    fingerDown(scroller);
    act(() => {
      harness.prepend(rows(101, 103, 100));
    });
    expect(scroller.querySelectorAll('[data-prepend-row]').length).toBe(13); // in the document now, no hold
    expect(scroller.scrollHeight).toBe(1000);
    expect(writes.length).toBe(0);
    expect(offsetOf(scroller, 4)).toBe(-50);
    expect(edgeOf(scroller).style.marginBottom).toBe('-300px');
    // The finger stays down: no rest, no write, however long it rests.
    elapse(ScrollRest.QUIET_MS * 4);
    expect(writes.length).toBe(0);
    // The lift on a list long still is the rest — judged after the lift's own task, never inside it — and the one
    // write that makes the landed rows reachable.
    fingerUp(scroller);
    expect(writes.length).toBe(0);
    elapse(1);
    expect(writes.length).toBe(1);
    expect(edgeOf(scroller).style.marginBottom).toBe('0px');
    expect(scroller.scrollTop).toBe(650);
    expect(offsetOf(scroller, 4)).toBe(-50); // the write was exact: the row is where it was
    expect(scroller.scrollHeight).toBe(1300);
    elapse(ScrollRest.QUIET_MS * 4);
    expect(writes.length).toBe(1); // nothing more held
  });

  test('two landings in a row and a tail below the rows: each held, the tail unmoved relative to the reader; ONE write at the rest pays both', () => {
    const { harness, scroller } = mount({ initial: rows(1, 10, 100), remaining: 30, tail: 400 });
    expect(scroller.scrollHeight).toBe(1400);
    readerScrollsTo(scroller, 800); // the end: the last row (top 900) and the tail below it in view
    expect(offsetOf(scroller, 10)).toBe(100);
    act(() => {
      harness.prepend(rows(101, 110, 150));
    });
    act(() => {
      harness.prepend(rows(201, 205, 80));
    });
    expect(scroller.scrollHeight).toBe(1400);
    expect(writes.length).toBe(0);
    expect(offsetOf(scroller, 10)).toBe(100);
    expect(edgeOf(scroller).style.marginBottom).toBe(`-${1500 + 400}px`);
    elapse(ScrollRest.QUIET_MS);
    expect(writes.length).toBe(1);
    expect(scroller.scrollTop).toBe(800 + 1900);
    expect(offsetOf(scroller, 10)).toBe(100);
    expect(scroller.scrollHeight).toBe(1400 + 1900);
  });
});

describe('law 2 — what is held is paid whole, with one write, at the rest', () => {
  test('the first page’s rows tall and every older row short, hundreds remaining: after one landing ONE write at the rest, the start 0 px tall throughout, and nothing owed at any later rest', () => {
    const apiRef: React.MutableRefObject<PrependSafeScrollerApi | null> = { current: null };
    const { harness, scroller } = mount({ initial: rows(1, 10, 600), remaining: 300, apiRef });
    expect(edgeOf(scroller).style.height).toBe('0px');
    readerScrollsTo(scroller, 5400); // the end: row 10 (top 5400) first visible at offset 0
    act(() => {
      harness.prepend(rows(101, 110, 60)); // ten short rows, a tenth of the mean below them
    });
    expect(edgeOf(scroller).style.height).toBe('0px');
    expect(writes.length).toBe(0);
    elapse(ScrollRest.QUIET_MS);
    expect(writes.length).toBe(1);
    expect(scroller.scrollTop).toBe(6000);
    expect(offsetOf(scroller, 10)).toBe(0);
    expect(edgeOf(scroller).style.height).toBe('0px');
    expect(apiRef.current!.reservePx()).toBe(0);
    // Rest after rest: the 290 rows still above are nobody's estimate, so nothing is owed and nothing is written.
    elapse(ScrollRest.QUIET_MS * 20);
    expect(writes.length).toBe(1);
    expect(scroller.scrollTop).toBe(6000);
    expect(scroller.scrollHeight).toBe(6600);
  });

  test('nothing while scroll events keep arriving, for longer than the window; at the rest ONE write, the row holding — a landing taller than the viewport included', () => {
    const { harness, scroller } = mount({ initial: rows(1, 20, 100), remaining: 25 });
    readerScrollsTo(scroller, 1400); // the end: row 15 (top 1400) first visible at offset 0
    act(() => {
      harness.prepend(rows(101, 110, 100)); // 1000 px: over the 600 px viewport
    });
    expect(edgeOf(scroller).style.marginBottom).toBe('-1000px');
    // The reader keeps moving, for longer than the window: a scroll event each frame holds the rest off.
    for (let k = 0; k < 14; k++) {
      readerScrollsTo(scroller, 1400);
      elapse(FRAME_MS);
    }
    expect(writes.length).toBe(0);
    elapse(ScrollRest.QUIET_MS);
    expect(writes.length).toBe(1);
    expect(edgeOf(scroller).style.marginBottom).toBe('0px');
    expect(scroller.scrollTop).toBe(2400);
    expect(offsetOf(scroller, 15)).toBe(0);
    expect(scroller.scrollHeight).toBe(3000);
    elapse(ScrollRest.QUIET_MS * 4);
    expect(writes.length).toBe(1); // nothing more held: no further write at any later rest
  });

  test('rows that land on a list long still are paid in the next task: an idle list declares no rest by itself, so one is asked for', () => {
    const { harness, scroller } = mount({ initial: rows(1, 10, 100), remaining: 20 });
    readerScrollsTo(scroller, 350);
    elapse(ScrollRest.QUIET_MS * 4); // the rest has come and gone; nothing was held
    expect(writes.length).toBe(0);
    act(() => {
      harness.prepend(rows(101, 103, 100));
    });
    expect(writes.length).toBe(0); // never inside the commit: the reader is not at the loaded start
    elapse(1);
    expect(writes.length).toBe(1);
    expect(scroller.scrollTop).toBe(650);
    expect(offsetOf(scroller, 4)).toBe(-50);
  });

  test('a scroller with no box settles nothing — a drift measured against no layout is no drift: what is held stands, and is paid when the box is back', () => {
    const { harness, scroller } = mount({ initial: rows(1, 10, 100), remaining: 20 });
    readerScrollsTo(scroller, 350);
    act(() => {
      harness.prepend(rows(101, 103, 100));
    });
    boxResizes(scroller, 0); // the pane is put away before the rest
    elapse(ScrollRest.QUIET_MS * 4);
    expect(writes.length).toBe(0);
    expect(edgeOf(scroller).style.marginBottom).toBe('-300px');
    boxResizes(scroller, 600); // shown again
    elapse(1);
    expect(writes.length).toBe(1);
    expect(edgeOf(scroller).style.marginBottom).toBe('0px');
    expect(scroller.scrollTop).toBe(650);
    expect(offsetOf(scroller, 4)).toBe(-50);
  });
});

describe('law 3 — where the reader has run out of loaded rows, nothing waits for a rest', () => {
  test('a reader who reaches the loaded start with rows landed above it is settled there, at once: ONE write, the row holding, and the consumer told', () => {
    const rests: number[] = [];
    const { harness, scroller } = mount({ initial: rows(1, 10, 100), remaining: 20, onRest: () => rests.push(1) });
    readerScrollsTo(scroller, 350);
    act(() => {
      harness.prepend(rows(101, 103, 100)); // landed while the reader was moving: held, 300 px above the origin
    });
    expect(writes.length).toBe(0);
    expect(rests.length).toBe(0);
    readerScrollsTo(scroller, 0); // the glide runs into the oldest loaded row
    // No rest has passed: the list stopped there by itself, and the rows above exist by the reader's next swipe.
    expect(writes.length).toBe(1);
    expect(scroller.scrollTop).toBe(300);
    expect(offsetOf(scroller, 1)).toBe(0);
    expect(edgeOf(scroller).style.marginBottom).toBe('0px');
    expect(scroller.scrollHeight).toBe(1300);
    expect(rests.length).toBe(2); // told at the arrival, and again with the rows reachable
  });

  test('with a known finger down at the loaded start nothing is settled, however long it rests; its lift settles, in the lift’s own task', () => {
    const { harness, scroller } = mount({ initial: rows(1, 10, 100), remaining: 20 });
    readerScrollsTo(scroller, 350);
    act(() => {
      harness.prepend(rows(101, 103, 100));
    });
    fingerDown(scroller);
    readerScrollsTo(scroller, 0); // the finger drags the list to its loaded start
    elapse(ScrollRest.QUIET_MS * 4);
    expect(writes.length).toBe(0);
    expect(edgeOf(scroller).style.marginBottom).toBe('-300px');
    fingerUp(scroller);
    expect(writes.length).toBe(1);
    expect(scroller.scrollTop).toBe(300);
    expect(offsetOf(scroller, 1)).toBe(0);
  });

  test('rows that land while the reader stands at the loaded start are settled as they land', () => {
    const { harness, scroller } = mount({ initial: rows(1, 10, 100), remaining: 20 });
    readerScrollsTo(scroller, 0); // standing at the oldest loaded row; the rows above are on their way
    expect(writes.length).toBe(0);
    act(() => {
      harness.prepend(rows(101, 103, 100));
    });
    expect(writes.length).toBe(1);
    expect(scroller.scrollTop).toBe(300);
    expect(offsetOf(scroller, 1)).toBe(0);
    expect(rowWrapper(scroller, 101).style.visibility).toBe(''); // reachable, and painted
  });

  test('the consumer is told once per arrival at the loaded start — rows it holds as data land there — and again only after leaving and coming back', () => {
    const rests: number[] = [];
    const { scroller } = mount({ initial: rows(1, 10, 100), remaining: 20, onRest: () => rests.push(1) });
    readerScrollsTo(scroller, 200);
    expect(rests.length).toBe(0);
    readerScrollsTo(scroller, 0);
    expect(rests.length).toBe(1);
    readerScrollsTo(scroller, 0); // the band's own scroll events at the start
    readerScrollsTo(scroller, 0);
    expect(rests.length).toBe(1);
    readerScrollsTo(scroller, 200);
    readerScrollsTo(scroller, 0);
    expect(rests.length).toBe(2);
    expect(writes.length).toBe(0);
  });

  test('at a list’s true start — nothing remaining, nothing held — nothing happens: no word to the consumer at the arrival, no write, no face, no fact on the root', () => {
    const rests: number[] = [];
    const { harness, scroller } = mount({
      initial: rows(1, 10, 100),
      remaining: 0,
      onRest: () => rests.push(1),
      loadingRow: <div data-h={48} data-loading-face />,
    });
    act(() => {
      harness.setLoading(true);
    });
    readerScrollsTo(scroller, 200);
    readerScrollsTo(scroller, 0);
    expect(rests.length).toBe(0);
    expect(writes.length).toBe(0);
    expect(scroller.querySelector('[data-prepend-loading]')).toBeNull();
    expect(scroller.hasAttribute(PREPEND_ROWS_ABOVE_ATTR)).toBe(false);
    expect(edgeOf(scroller).style.height).toBe('0px');
    expect(edgeOf(scroller).style.marginBottom).toBe('0px');
    elapse(ScrollRest.QUIET_MS);
    expect(rests.length).toBe(1); // the ordinary rest, as for any list
    expect(writes.length).toBe(0);
  });
});

describe('law 4 — the stop: where a finger can move the list it is stopped for one painted frame, then the one write', () => {
  test('on a device with touch input: the overflow hidden, one painted frame, ONE write on the stopped list, the overflow back; rows that landed above the origin are not painted until that write', () => {
    touchInput(5);
    const { harness, scroller } = mount({ initial: rows(1, 10, 100), remaining: 20 });
    readerScrollsTo(scroller, 350);
    act(() => {
      harness.prepend(rows(101, 103, 100));
    });
    [101, 102, 103].forEach((id) => expect(rowWrapper(scroller, id).style.visibility).toBe('hidden'));
    expect(rowWrapper(scroller, 1).style.visibility).toBe('');
    elapse(ScrollRest.QUIET_MS); // the rest: the settle begins with the stop
    expect(scroller.style.overflowY).toBe('hidden');
    expect(writes.length).toBe(0);
    pumpFrames(1); // the frame that is painted with the list stopped
    expect(scroller.style.overflowY).toBe('hidden');
    expect(writes.length).toBe(0);
    expect(rowWrapper(scroller, 101).style.visibility).toBe('hidden');
    pumpFrames(1);
    expect(writes.length).toBe(1);
    expect(writtenWith[0].overflowY).toBe('hidden'); // the write was made on a stopped list
    expect(writtenWith[0].edgeMargin).toBe('0px'); // rows above the origin: the margin released, then the write
    expect(scroller.style.overflowY).toBe('');
    expect(scroller.scrollTop).toBe(650);
    expect(offsetOf(scroller, 4)).toBe(-50);
    [101, 102, 103].forEach((id) => expect(rowWrapper(scroller, id).style.visibility).toBe(''));
    elapse(ScrollRest.QUIET_MS * 4);
    expect(writes.length).toBe(1);
    expect(scroller.style.overflowY).toBe('');
  });

  test('no stop where hiding the overflow would change the scroller’s width (a scrollbar that takes room): the one write at the rest, the overflow never hidden', () => {
    touchInput(5);
    const { harness, scroller } = mount({ initial: rows(1, 10, 100), remaining: 20 });
    Object.defineProperty(scroller, 'clientWidth', {
      get: () => (scroller.style.overflowY === 'hidden' ? 390 : 375),
      configurable: true,
    });
    readerScrollsTo(scroller, 350);
    act(() => {
      harness.prepend(rows(101, 103, 100));
    });
    elapse(ScrollRest.QUIET_MS);
    expect(writes.length).toBe(1);
    expect(writtenWith[0].overflowY).toBe('');
    expect(scroller.style.overflowY).toBe('');
    expect(scroller.scrollTop).toBe(650);
    expect(offsetOf(scroller, 4)).toBe(-50);
  });

  test('a landing that arrives inside the stopped frame is paid by the same ONE write; a settle under way is not begun again', () => {
    touchInput(5);
    const { harness, scroller } = mount({ initial: rows(1, 10, 100), remaining: 20 });
    readerScrollsTo(scroller, 350);
    act(() => {
      harness.prepend(rows(101, 103, 100));
    });
    elapse(ScrollRest.QUIET_MS);
    expect(scroller.style.overflowY).toBe('hidden');
    act(() => {
      harness.prepend(rows(201, 202, 100)); // lands while the list is stopped
    });
    elapse(1); // the rest that landing asked for comes inside the stopped frame: it begins nothing
    expect(writes.length).toBe(0);
    expect(edgeOf(scroller).style.marginBottom).toBe('-500px');
    pumpFrames(2);
    expect(writes.length).toBe(1);
    expect(scroller.scrollTop).toBe(350 + 500);
    expect(offsetOf(scroller, 4)).toBe(-50);
    expect(scroller.style.overflowY).toBe('');
    elapse(ScrollRest.QUIET_MS * 4);
    expect(writes.length).toBe(1);
  });

  test('an owner that leaves inside the stopped frame leaves the overflow as it found it and writes nothing', () => {
    touchInput(5);
    const { harness, scroller } = mount({ initial: rows(1, 10, 100), remaining: 20 });
    scroller.style.overflowY = 'scroll'; // the host's own word, which the stop must put back
    readerScrollsTo(scroller, 350);
    act(() => {
      harness.prepend(rows(101, 103, 100));
    });
    elapse(ScrollRest.QUIET_MS);
    expect(scroller.style.overflowY).toBe('hidden');
    act(() => {
      root.render(<div />);
    });
    expect(scroller.style.overflowY).toBe('scroll');
    pumpFrames(4);
    expect(writes.length).toBe(0);
  });
});

describe('law 5 — one measure, the reader’s own row', () => {
  test('the row that was first moves down among the rows above the reader in the commit that lands a page (a thread taking its place lower): the reader’s row moves 0 px', () => {
    const { harness, scroller } = mount({ initial: rows(1, 10, 100), remaining: 20 });
    readerScrollsTo(scroller, 350);
    expect(offsetOf(scroller, 4)).toBe(-50);
    act(() => {
      // Two rows land, and row 1 now stands after rows 2 and 3: above the reader, 200 px more than before.
      harness.replace([...rows(101, 102, 100), ...rows(2, 3, 100), ...rows(1, 1, 100), ...rows(4, 10, 100)]);
    });
    expect(offsetOf(scroller, 4)).toBe(-50);
    expect(edgeOf(scroller).style.marginBottom).toBe('-200px');
    expect(scroller.scrollHeight).toBe(1000);
    expect(writes.length).toBe(0);
  });

  test('the first row removed: the reader’s row holds — the height that went is kept as the start’s own, and paid at the rest the other way round, the write first', () => {
    const { harness, scroller } = mount({ initial: rows(1, 10, 100), remaining: 20 });
    readerScrollsTo(scroller, 350);
    act(() => {
      harness.replace(rows(2, 10, 100));
    });
    expect(offsetOf(scroller, 4)).toBe(-50);
    expect(edgeOf(scroller).style.height).toBe('100px');
    expect(scroller.scrollHeight).toBe(1000);
    expect(writes.length).toBe(0);
    elapse(ScrollRest.QUIET_MS);
    expect(writes.length).toBe(1);
    expect(writtenWith[0].edgeHeight).toBe('100px'); // a gap: the write while the range still holds the offset
    expect(edgeOf(scroller).style.height).toBe('0px');
    expect(scroller.scrollTop).toBe(250);
    expect(offsetOf(scroller, 4)).toBe(-50);
    expect(scroller.scrollHeight).toBe(900);
  });

  test('the reader’s own row removed in the commit that lands rows: the first row after it that is still there keeps its offset', () => {
    const { harness, scroller } = mount({ initial: rows(1, 10, 100), remaining: 20 });
    readerScrollsTo(scroller, 350);
    expect(offsetOf(scroller, 5)).toBe(50);
    act(() => {
      harness.replace([...rows(101, 102, 100), ...rows(1, 3, 100), ...rows(5, 10, 100)]);
    });
    expect(offsetOf(scroller, 5)).toBe(50);
    expect(edgeOf(scroller).style.marginBottom).toBe('-100px');
    expect(writes.length).toBe(0);
  });

  test('a row above the reader grows later: held with no write, the row holding; a row below does nothing; the rest pays it with one write', () => {
    const { scroller } = mount({ initial: rows(1, 10, 100), remaining: 20 });
    readerScrollsTo(scroller, 350); // row 4 first visible at −50; rows 1–3 are above
    resize(rowBox(scroller, 1), 160);
    expect(edgeOf(scroller).style.marginBottom).toBe('-60px');
    expect(offsetOf(scroller, 4)).toBe(-50);
    expect(scroller.scrollHeight).toBe(1000);
    expect(writes.length).toBe(0);
    resize(rowBox(scroller, 6), 300); // below the reader's row: nothing to hold
    expect(edgeOf(scroller).style.marginBottom).toBe('-60px');
    expect(offsetOf(scroller, 4)).toBe(-50);
    expect(writes.length).toBe(0);
    elapse(ScrollRest.QUIET_MS);
    expect(writes.length).toBe(1);
    expect(scroller.scrollTop).toBe(410);
    expect(offsetOf(scroller, 4)).toBe(-50);
    expect(edgeOf(scroller).style.marginBottom).toBe('0px');
  });

  test('a list replaced, or filled from empty, holds nothing: no room, nothing above the origin, no write at any rest', () => {
    const { harness, scroller } = mount({ initial: [], remaining: 0 });
    act(() => {
      harness.replace(rows(1, 10, 100)); // the head page lands …
      harness.setRemaining(40); // … with the consumer's count of rows above, in the same commit
    });
    expect(edgeOf(scroller).style.height).toBe('0px');
    expect(edgeOf(scroller).style.marginBottom).toBe('0px');
    expect(scroller.scrollHeight).toBe(1000); // the rows, and nothing for the 40 above them
    readerScrollsTo(scroller, 350);
    act(() => {
      harness.prepend(rows(101, 103, 100)); // held: 300 px above the origin
    });
    expect(edgeOf(scroller).style.marginBottom).toBe('-300px');
    act(() => {
      harness.replace(rows(201, 210, 100)); // another list's rows: nothing of the old list to hold against
    });
    expect(edgeOf(scroller).style.height).toBe('0px');
    expect(edgeOf(scroller).style.marginBottom).toBe('0px');
    expect(scroller.scrollHeight).toBe(1000);
    elapse(ScrollRest.QUIET_MS * 4);
    expect(writes.length).toBe(0);
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
    // 3000 px of rows; the lead is 2 × 600 = 1200 px from the loaded start.
    readerScrollsTo(scroller, 2400); // the consumer's opening view: the end, 2400 from the start
    pumpFrames(1); // the opening ask's frame: outside the lead, nothing asked
    expect(asks.length).toBe(0);
    readerScrollsTo(scroller, 1100); // 1100 from the start: inside
    expect(asks.length).toBe(1);
    readerScrollsTo(scroller, 1000);
    readerScrollsTo(scroller, 900);
    expect(asks.length).toBe(1); // in flight: once
    act(() => {
      harness.prepend(rows(101, 110, 100)); // lands, held: the reader is 900 + 1000 from the loaded start — outside
    });
    expect(asks.length).toBe(1);
    readerScrollsTo(scroller, 100); // 1100 from the start
    expect(asks.length).toBe(2);
    act(() => {
      harness.prepend(rows(111, 111, 50)); // lands: the reader is 1150 from the start — inside: the chain asks
    });
    expect(asks.length).toBe(3);
    act(() => {
      harness.setRemaining(0); // the history's start is reached while #3 is out
    });
    act(() => {
      harness.setLoading(true); // the consumer answers #3 …
    });
    act(() => {
      harness.setLoading(false); // … and its read ends with nothing: the gate is open again
    });
    readerScrollsTo(scroller, 50);
    readerScrollsTo(scroller, 20);
    expect(asks.length).toBe(3); // open, inside the lead, and nothing remains: nothing is asked
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
    readerScrollsTo(scroller, 400); // inside the lead; the failed read's settle reopens nothing
    pumpFrames(6);
    readerScrollsTo(scroller, 300);
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
    readerScrollsTo(scroller, 200); // #3 resolved with nothing landed: still in flight until `loading` says otherwise
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
    readerScrollsTo(scroller, 2400);
    pumpFrames(1);
    readerScrollsTo(scroller, 1100); // inside the lead: ask #1
    expect(asks.length).toBe(1);
    // The read settles (the consumer's continuation ran; React has not committed the rows yet).
    resolvers.shift()!();
    await Promise.resolve();
    await Promise.resolve();
    readerScrollsTo(scroller, 1000); // a scroll event in the gap — the engine pans on
    readerScrollsTo(scroller, 950);
    pumpFrames(6); // however long the commit takes
    expect(asks.length).toBe(1);
    // The rows' commit: the gate reopens, and the chain asks only if still inside the lead.
    act(() => {
      harness.prepend(rows(101, 110, 100)); // held: the reader is 950 + 1000 from the loaded start — outside
    });
    pumpFrames(4);
    expect(asks.length).toBe(1);
    readerScrollsTo(scroller, 100); // 1100 from the start: ask #2
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
    readerScrollsTo(scroller, 2400);
    pumpFrames(1);
    readerScrollsTo(scroller, 1100); // inside the lead: ask #1
    expect(asks.length).toBe(1);
    act(() => {
      harness.setLoading(true); // the consumer answers #1
    });
    readerScrollsTo(scroller, 100);
    act(() => {
      harness.prepend(rows(101, 110, 100)); // the rows land AND the read ends in ONE commit
      harness.setLoading(false);
    });
    // 1000 px held; the reader is 1100 from the loaded start — inside the lead: the chain asks ONCE (#2).
    expect(asks.length).toBe(2);
    act(() => {
      harness.setLoading(true); // the consumer answers #2
    });
    readerScrollsTo(scroller, 90); // #2 in flight: no ask
    expect(asks.length).toBe(2);
    act(() => {
      harness.prepend(rows(111, 111, 50)); // #2's rows land: the reader 1140 from the start — the chain asks #3
    });
    expect(asks.length).toBe(3);
    act(() => {
      harness.setLoading(false); // #2's read ends in a LATER commit: it belongs to #2, not to #3 in flight — no reopen
    });
    readerScrollsTo(scroller, 80);
    expect(asks.length).toBe(3);
  });
});

describe('the gate — the scroller’s own box', () => {
  test('rows that landed while the scroller had no box: the box arriving re-judges the lead — asked once, not at the mount, not at the landing, not again in flight, never on a shrink; the landing re-judges as ever', () => {
    clientHeight = 0; // the pane has no geometry yet: a pane mounted display:none and laid out later
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
    boxResizes(scroller, 600); // the pane gains its size: the reader at the loaded start, inside the lead of 1200
    expect(asks.length).toBe(1);
    boxResizes(scroller, 600); // the same box reported again
    boxResizes(scroller, 300); // a shrink
    boxResizes(scroller, 900); // growth while the ask is out
    expect(asks.length).toBe(1);
    act(() => {
      harness.prepend(rows(11, 20, 100)); // the landing reopens the gate and re-judges: 1000 px above the reader, inside the lead of 1800
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
    readerScrollsTo(scroller, 2400); // 2400 px below the loaded start; the lead is 2 × 600 = 1200
    pumpFrames(1);
    expect(asks.length).toBe(0);
    boxResizes(scroller, 900); // the lead 1800: the reader is still beyond it
    expect(asks.length).toBe(0);
    boxResizes(scroller, 1300); // the lead 2600 reaches the reader
    expect(asks.length).toBe(1);
  });
});

describe('the loading face', () => {
  test('floats over the start of the rows only while loading with rows remaining: out of the flow, taking no room, the rows where they were when it comes and when it goes', () => {
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
    const face = scroller.querySelector('[data-prepend-loading]') as HTMLElement;
    expect(face).not.toBeNull();
    expect(face.parentElement).toBe(edgeOf(scroller));
    expect(face.querySelector('[data-loading-face]')).not.toBeNull();
    expect(scroller.scrollHeight).toBe(before);
    expect(offsetOf(scroller, 1)).toBe(0);
    act(() => {
      harness.setRemaining(0);
    });
    expect(scroller.querySelector('[data-prepend-loading]')).toBeNull();
    expect(scroller.scrollHeight).toBe(before);
    expect(offsetOf(scroller, 1)).toBe(0);
  });
});

describe('the fact on the root — rows remain above this start', () => {
  test('stands while the consumer says rows remain above or while rows are held above the origin, and is moved only when it changes', () => {
    const { harness, scroller } = mount({ initial: rows(1, 10, 100), remaining: 20 });
    const moves = jest.spyOn(scroller, 'toggleAttribute');
    expect(scroller.hasAttribute(PREPEND_ROWS_ABOVE_ATTR)).toBe(true);
    readerScrollsTo(scroller, 350);
    act(() => {
      harness.prepend(rows(101, 103, 100)); // rows land; 17 still remain
    });
    elapse(ScrollRest.QUIET_MS * 2); // the settle
    expect(scroller.hasAttribute(PREPEND_ROWS_ABOVE_ATTR)).toBe(true);
    expect(moves).toHaveBeenCalledTimes(0); // true throughout: never touched
    act(() => {
      harness.setRemaining(0); // the history's end is reached
    });
    expect(scroller.hasAttribute(PREPEND_ROWS_ABOVE_ATTR)).toBe(false);
    expect(moves).toHaveBeenCalledTimes(1);
    act(() => {
      harness.prepend(rows(201, 202, 100)); // a late landing at the end: held above the origin until the rest
    });
    expect(scroller.hasAttribute(PREPEND_ROWS_ABOVE_ATTR)).toBe(true);
    elapse(ScrollRest.QUIET_MS);
    expect(scroller.hasAttribute(PREPEND_ROWS_ABOVE_ATTR)).toBe(false);
    expect(moves).toHaveBeenCalledTimes(3);
    moves.mockRestore();
  });
});

describe('onRest — the one rest definition', () => {
  const watches: ScrollRest[] = [];
  /** A bare scroller inside its range, and the rests a ScrollRest on it declares. */
  const watched = () => {
    const scroller = document.createElement('div');
    container.appendChild(scroller);
    const box = { height: 600, offset: 0 };
    Object.defineProperty(scroller, 'clientWidth', { get: () => 390 });
    Object.defineProperty(scroller, 'clientHeight', { get: () => box.height });
    Object.defineProperty(scroller, 'scrollHeight', { get: () => (box.height > 0 ? 2000 : 0) });
    Object.defineProperty(scroller, 'scrollTop', { get: () => box.offset });
    const rests: number[] = [];
    const lifts: number[] = [];
    const rest = new ScrollRest(
      () => rests.push(1),
      () => lifts.push(1)
    );
    rest.attach(scroller);
    watches.push(rest);
    return { scroller, rest, rests, lifts, box };
  };
  const scrolls = (scroller: HTMLElement) => scroller.dispatchEvent(new Event('scroll'));
  const scrollEnds = (scroller: HTMLElement) => scroller.dispatchEvent(new Event('scrollend'));

  afterEach(() => {
    watches.splice(0).forEach((rest) => rest.detach());
  });

  test('fires QUIET_MS after the last scroll event, not before, and not under a finger', () => {
    const rests: number[] = [];
    const { scroller } = mount({ initial: rows(1, 10, 100), remaining: 0, onRest: () => rests.push(1) });
    readerScrollsTo(scroller, 100);
    elapse(ScrollRest.QUIET_MS - 1);
    expect(rests.length).toBe(0);
    elapse(1);
    expect(rests.length).toBe(1);
    fingerDown(scroller);
    readerScrollsTo(scroller, 200);
    elapse(ScrollRest.QUIET_MS * 4);
    expect(rests.length).toBe(1);
    fingerUp(scroller);
    elapse(1);
    expect(rests.length).toBe(2);
  });

  test('three 8 ms frames are not a rest, nor are the gaps measured inside a motion: the window is clock time and longer than a glide’s tail (116 ms) and a bounce (134 ms)', () => {
    const { scroller, rests } = watched();
    scrolls(scroller);
    framesPass(3, 8); // a 120 Hz screen
    expect(rests.length).toBe(0);
    scrolls(scroller);
    elapse(116);
    scrolls(scroller);
    elapse(134);
    scrolls(scroller);
    expect(rests.length).toBe(0);
    elapse(ScrollRest.QUIET_MS);
    expect(rests.length).toBe(1);
  });

  test('stretched past an edge is not a rest; the band’s return is', () => {
    const { scroller, rests, box } = watched();
    box.offset = -40; // the rubber band at the top, the list pausing there
    scrolls(scroller);
    elapse(ScrollRest.QUIET_MS * 4);
    expect(rests.length).toBe(0);
    box.offset = 0;
    scrolls(scroller); // the spring-back's last scroll event
    elapse(ScrollRest.QUIET_MS);
    expect(rests.length).toBe(1);
  });

  test('a list stopped under a finger the page was never told of gives no rest until the scrollend', () => {
    engineFiresScrollEnd();
    const { scroller, rests } = watched();
    // A flick: the finger drags the list — the gesture — and lifts; the glide goes on.
    touch('touchstart', scroller, 1);
    scrolls(scroller);
    elapse(FRAME_MS);
    touch('touchend', scroller, 1);
    for (let k = 0; k < 5; k++) {
      scrolls(scroller);
      elapse(FRAME_MS);
    }
    // Another finger catches the glide and rests on the list: the page is told nothing, the scroll events simply stop.
    elapse(ScrollRest.QUIET_MS * 8);
    expect(rests.length).toBe(0);
    // That finger lifts: the engine's `scrollend`, withheld until now — the rest, after the event's own task.
    scrollEnds(scroller);
    expect(rests.length).toBe(0);
    elapse(1);
    expect(rests.length).toBe(1);
    // ONE rest for one motion: a later `scrollend` with nothing moved since declares nothing.
    scrollEnds(scroller);
    elapse(ScrollRest.QUIET_MS * 4);
    expect(rests.length).toBe(1);
    // The gesture closed at its rest: a write no finger began rests by the window alone again.
    scrolls(scroller);
    elapse(ScrollRest.QUIET_MS);
    expect(rests.length).toBe(2);
  });

  test('a scrollend followed by scroll events in a gesture is not a rest', () => {
    engineFiresScrollEnd();
    const { scroller, rests } = watched();
    touch('touchstart', scroller, 1);
    scrolls(scroller);
    touch('touchend', scroller, 1);
    // Under the glide the engine sends a `scrollend` (its answer to a write or to an adjustment of its own) and the
    // glide's scroll events go on, for longer than the window.
    scrolls(scroller);
    scrollEnds(scroller);
    for (let k = 0; k < 14; k++) {
      elapse(FRAME_MS);
      scrolls(scroller);
    }
    expect(rests.length).toBe(0);
    // The scroll events stop and no `scrollend` has come since the last of them: still not a rest.
    elapse(ScrollRest.QUIET_MS * 4);
    expect(rests.length).toBe(0);
    scrollEnds(scroller);
    elapse(1);
    expect(rests.length).toBe(1);
  });

  test('a script write with no gesture rests by the window alone, hidden or not', () => {
    engineFiresScrollEnd();
    const { scroller, rests, box } = watched();
    // A write no finger began; no `scrollend` follows it here.
    scrolls(scroller);
    elapse(ScrollRest.QUIET_MS - 1);
    expect(rests.length).toBe(0);
    elapse(1);
    expect(rests.length).toBe(1);
    box.height = 0; // the pane hidden
    scrolls(scroller);
    elapse(ScrollRest.QUIET_MS - 1);
    expect(rests.length).toBe(1);
    elapse(1);
    expect(rests.length).toBe(2);
  });

  test('two fingers, one lifted, is not a rest', () => {
    const { scroller, rests } = watched();
    touch('touchstart', scroller, 1);
    touch('touchstart', scroller, 2);
    touch('touchend', scroller, 1);
    elapse(ScrollRest.QUIET_MS * 4);
    expect(rests.length).toBe(0);
    touch('touchend', scroller, 2);
    elapse(1);
    expect(rests.length).toBe(1);
  });

  test('a touch whose target left the document still ends', () => {
    const { scroller, rests, rest } = watched();
    const word = document.createElement('span');
    scroller.appendChild(word);
    touch('touchstart', word, 1);
    expect(rest.armDown).toBe(true);
    // The content under the finger is replaced; the engine sends the lift to the element the touch
    // began on, which no longer has the scroller above it.
    word.remove();
    touch('touchend', word, 1);
    expect(rest.armDown).toBe(false);
    elapse(1);
    expect(rests.length).toBe(1);
  });

  test('a scrollbar press is an arm; request() never lands in the asking task', () => {
    const { scroller, rest, rests } = watched();
    expect(rest.atRest).toBe(true);
    rest.request();
    expect(rests.length).toBe(0);
    elapse(1);
    expect(rests.length).toBe(1);
    const press = new MouseEvent('pointerdown');
    Object.defineProperty(press, 'offsetX', { get: () => 395 }); // on the vertical scrollbar, right of the client box
    Object.defineProperty(press, 'offsetY', { get: () => 100 });
    scroller.dispatchEvent(press);
    expect(rest.armDown).toBe(true);
    rest.request();
    elapse(ScrollRest.QUIET_MS * 4);
    expect(rests.length).toBe(1);
    scroller.dispatchEvent(new MouseEvent('pointerup'));
    expect(rest.armDown).toBe(false);
    elapse(1);
    expect(rests.length).toBe(2);
  });

  test('the lift is told in the task the last arm goes up, never while another is down: one of two fingers, the second, a scrollbar press released', () => {
    const { scroller, lifts, rests } = watched();
    touch('touchstart', scroller, 1);
    touch('touchstart', scroller, 2);
    touch('touchend', scroller, 1);
    expect(lifts.length).toBe(0); // a finger is still down
    touch('touchend', scroller, 2);
    expect(lifts.length).toBe(1); // in the lift's own task, ahead of any rest
    expect(rests.length).toBe(0);
    const press = (type: string, offsetX: number) => {
      const event = new Event(type, { bubbles: true });
      Object.defineProperty(event, 'offsetX', { value: offsetX });
      Object.defineProperty(event, 'offsetY', { value: 300 });
      scroller.dispatchEvent(event);
    };
    press('pointerdown', 395); // on the scroller's own scrollbar, outside its 390 px client box
    expect(lifts.length).toBe(1);
    press('pointerup', 395);
    expect(lifts.length).toBe(2);
  });
});

describe('apiRef', () => {
  test('distanceFromLoadedStart and reservePx read the geometry — rows held above the origin count as loaded; requestRest asks for the list’s next rest', () => {
    const apiRef: React.MutableRefObject<PrependSafeScrollerApi | null> = { current: null };
    const rests: number[] = [];
    const { harness, scroller } = mount({
      initial: rows(1, 10, 100),
      remaining: 20,
      apiRef,
      onRest: () => rests.push(1),
    });
    readerScrollsTo(scroller, 350);
    expect(apiRef.current!.scroller).toBe(scroller);
    expect(apiRef.current!.reservePx()).toBe(0);
    expect(apiRef.current!.distanceFromLoadedStart()).toBe(350);
    fingerDown(scroller);
    act(() => {
      harness.prepend(rows(101, 103, 100));
    });
    expect(apiRef.current!.reservePx()).toBe(-300); // rows above the scroll origin until the settle
    expect(apiRef.current!.distanceFromLoadedStart()).toBe(650);
    fingerUp(scroller);
    elapse(ScrollRest.QUIET_MS);
    expect(apiRef.current!.reservePx()).toBe(0);
    expect(apiRef.current!.distanceFromLoadedStart()).toBe(650);
    // A still list declares no rest by itself; asked, it answers in the next task, never in the asking one.
    elapse(ScrollRest.QUIET_MS * 4);
    const before = rests.length;
    apiRef.current!.requestRest();
    expect(rests.length).toBe(before);
    elapse(1);
    expect(rests.length).toBe(before + 1);
  });
});
