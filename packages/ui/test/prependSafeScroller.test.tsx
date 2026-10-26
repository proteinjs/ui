/**
 * @jest-environment jsdom
 *
 * PrependSafeScroller (src/list/PrependSafeScroller.tsx) with its reservoir (PrependReservoir) and the one rest
 * definition (ScrollRest), under a MODELLED LAYOUT: jsdom lays nothing out, so the scroller's clientHeight,
 * scrollHeight and scrollTop, and every box's rect, are computed here from the DOM order, each row's declared
 * height (`data-h`) and the reservoir's own inline style — the geometry a real engine would give. `scrollTop`'s
 * setter is a spy: every programmatic write is counted, and a write IS the outcome these laws forbid or allow.
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
 *  it. The loading row renders at the reservoir's foot only while loading with rows remaining, height-neutrally.
 *  `onRest` fires at the rest and not before; `scrollend` short-circuits it. `apiRef` reads the geometry.
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
const entryFor = (target: Element): ResizeObserverEntry => {
  const height = heightOf(target);
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

// ── The layout model ──
const CLIENT_HEIGHT = 600;
let scrollTopValue = 0;
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
const realRect = Element.prototype.getBoundingClientRect;
Element.prototype.getBoundingClientRect = function (this: Element): DOMRect {
  const scroller = this.closest('[data-model-scroller]');
  if (!scroller) {
    return realRect.call(this);
  }
  if (this === scroller) {
    return rect(0, CLIENT_HEIGHT);
  }
  const entry = layoutOf(scroller).rects.get(this);
  return entry ? rect(entry.top - scrollTopValue, entry.bottom - scrollTopValue) : rect(0, 0);
};
/** The scroller element takes the model's scroll geometry; its scrollTop setter is the write spy. */
const modelScroller = (el: HTMLElement) => {
  el.setAttribute('data-model-scroller', '');
  Object.defineProperty(el, 'clientHeight', { get: () => CLIENT_HEIGHT, configurable: true });
  Object.defineProperty(el, 'scrollHeight', {
    get: () => Math.max(CLIENT_HEIGHT, layoutOf(el).contentHeight),
    configurable: true,
  });
  Object.defineProperty(el, 'scrollTop', {
    get: () => scrollTopValue,
    set: (value: number) => {
      writes.push(value);
      scrollTopValue = Math.max(0, Math.min(value, Math.max(0, layoutOf(el).contentHeight - CLIENT_HEIGHT)));
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

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  scrollTopValue = 0;
  writes.length = 0;
  frameQueue.length = 0;
  observers.length = 0;
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

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
