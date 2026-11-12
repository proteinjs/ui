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
 * 11. THE LAW (row 3435 — his finding on test, 2026-11-11: on his phone one press of Home's back-to-top ended short of
 *     the top): THE BROWSER HOLDS THE LIST'S PLACE UNDER WHAT STANDS ABOVE IT; THE LIST HOLDS ITS ROWS. Under a browser
 *     that ANCHORS (WebKit from iOS 27; the stand-in below): several screens down, ONE press, the motion settled — the
 *     scroller at its top, the first row first in view, the button gone, nothing written (11a); under a fling no rest
 *     is declared at a window commit while the scroll goes on, so what is owed is written at the fling's own end, never
 *     under its momentum (11b). Who declares what (11c): while the window's engine is mounted the list's root is a
 *     candidate of the browser's anchoring and every child of the root is not — the foot's box from its first render,
 *     each element of a row, a row that replaces its own box on a commit that is not the list's and a child the list's
 *     own later commit adds among them — a sibling of the list in the same scroller stays one and the scroller declares
 *     nothing; all of it is taken back when the list leaves the windowed mode; a list that is not windowed, or windowed
 *     with no scrollable ancestor, declares nothing. The browser's side (11d): what stands above the list grows under a
 *     reader deep in it — the reader's row does not move. HOME'S SHAPE (11e — the one windowed list in the house is
 *     GROUPED): the same one press under the same browser, each group box out with its rows, the root in. THE FOOT AT
 *     THE TAIL (11f): a child of the root left a candidate is the only one under it, and the browser holds IT — so the
 *     consumer's foot is drawn inside a box of the list's own that is out from its first render: bare text, a box
 *     inside the consumer's own box-less element, a row that draws itself later — a page lands under a reader at the
 *     tail and the reader's row does not move.
 * 12. THE HOLD'S OWN RECORD: the anchors are recorded wherever the list itself moves the layout they are read against —
 *     a hold is not undone at the next commit, a payment is not absorbed again as a debt nobody owes, and a row growing
 *     below the reader's edge is not read back as drift (the engine's anchoring hid all three where it anchored).
 * 13. THE RESERVOIR STANDS AT EVERY LAYOUT (round 5 — iOS 27.2 and WebKit, 2026-11-12: with the rows out of the
 *     anchoring a jump down the list was thrown back, 5,320 px of 5,320): a row that reads the layout in its own layout
 *     effect asks the browser for a layout in the middle of the list's commit, and the browser clamps the offset to
 *     the content it finds — so the reservoir takes the rows above the window before any layout effect runs. The
 *     reader jumps several screens down: the offset stays where the reader put it.
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
  browserLaysOut(scroller as HTMLElement);
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
// ── THE BROWSER'S SCROLL ANCHORING, ITS ANIMATED SCROLL AND ITS FLING (pin 11; the witnesses are the simulator on
//    iOS 27.2 and the harness's WebKit and Chromium over the real Home, 2026-11-11 and 11-12). The stand-in has TWO
//    JOBS. (i) THE ROWS: a browser that anchors answers a layout change inside a scroller with an adjustment on a
//    candidate row. Under `scrollTo({ behavior: 'smooth' })` — an animation the browser steps per tick, a scroll event
//    each, never a write — that adjustment ends the animation where it stands: a `scrollend`, short of the target.
//    Under a fling it fires `scrollend` and the momentum goes on. A write to scrollTop ends an animation too. The
//    browser chooses its anchor at a LAYOUT, and a page that reads a rect asks for one: a row that is a candidate at
//    any layout since the last tick is a row the adjustment can land on. (ii) THE LIST'S PLACE: what stands above the
//    list in the same scroller changes height, and the browser moves the offset by as much — its own adjustment, a
//    scroll event, never a write — only while the list's root is a candidate; with the root out nothing in the list is
//    one, and the reader's row moves. AT THE LIST'S TAIL the same job has a second face: the browser's anchor is the
//    first candidate in view, so with the rows out a box at the tail that is still a candidate — a foot the list's
//    declaration does not cover — is the one the browser holds, and a page landing above it moves the offset by the
//    page: the reader at the tail is thrown (the review's probe on Chromium and WebKit, 2026-11-12: 1,560 px, where a
//    row in view that is a candidate — main — moves 0). An element is a CANDIDATE unless it, or any ancestor up to AND INCLUDING the
//    scroller, declares `overflow-anchor: none` — wherever and however it is declared: jsdom keeps no `overflow-anchor`
//    (not in a style object, not in a computed style), so the stand-in reads the declaration itself by each door a page
//    has — the style object's property (React's `style`), `setProperty`, the attribute's text, a rule of a style sheet.
//    An element with NO BOX (`display: contents`) declares nothing a browser reads (the harness's probe on both
//    engines, 2026-11-12: a row under a box-less element that declares it still anchors). ──
const anchorNoneBySetProperty = new WeakSet<CSSStyleDeclaration>();
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
    anchorNoneBySetProperty.add(this);
  } else {
    anchorNoneBySetProperty.delete(this);
  }
};
CSSStyleDeclaration.prototype.removeProperty = function (this: CSSStyleDeclaration, name: string) {
  if (name !== 'overflow-anchor') {
    return realRemoveProperty.call(this, name);
  }
  return anchorNoneBySetProperty.delete(this) ? 'none' : '';
};
const declaresAnchorNone = (el: HTMLElement): boolean => {
  if (el.style.display === 'contents') {
    return false;
  }
  if ((el.style as unknown as { overflowAnchor?: string }).overflowAnchor === 'none') {
    return true;
  }
  if (anchorNoneBySetProperty.has(el.style) || /overflow-anchor\s*:\s*none/.test(el.getAttribute('style') ?? '')) {
    return true;
  }
  return Array.from(document.styleSheets).some((sheet) =>
    Array.from(sheet.cssRules).some((rule) => {
      const { selectorText, style } = rule as CSSStyleRule;
      return !!selectorText && style?.getPropertyValue('overflow-anchor') === 'none' && el.matches(selectorText);
    })
  );
};
/** A candidate of the browser's anchoring: no `overflow-anchor: none` from the element up to and including the scroller. */
const isAnchoringCandidate = (el: HTMLElement, scroller: HTMLElement): boolean => {
  for (let at: HTMLElement | null = el; at; at = at === scroller ? null : at.parentElement) {
    if (declaresAnchorNone(at)) {
      return false;
    }
  }
  return true;
};
/** Whether the browser's anchoring finds a row to hold: a mounted row that is a candidate. */
const anchoringHasACandidate = (scroller: HTMLElement): boolean =>
  Array.from(scroller.querySelectorAll<HTMLElement>('[data-row]')).some((row) => isAnchoringCandidate(row, scroller));
/** The layout as the browser's anchoring sees it change: the reservoir's size and the mounted rows. */
const layoutSignature = (scroller: HTMLElement): string => {
  const reservoir = scroller.querySelector<HTMLElement>('[data-list-reservoir]');
  const rows = scroller.querySelectorAll('[data-row]');
  return `${reservoir ? `${reservoir.style.height}/${reservoir.style.marginBottom}` : ''}|${rows.length}|${rows.length > 0 ? rows[0].getAttribute('data-row') : ''}`;
};
let animation: { target: number } | null = null;
/** A fling's momentum runs (11b): the browser lays out under it as it does under its own animation. */
let momentum = false;
let layoutAtLastTick = '';
/** A row was a candidate at a layout since the last tick. */
let rowChosenAtALayout = false;
/**
 * THE BROWSER LAYS OUT under its own motion — at each tick, and wherever the page reads a rect — and chooses its
 * anchor. And at EVERY layout it clamps the offset to the content it finds (pin 13): a layout asked for while the
 * content is short leaves the reader where the short content ends — a scroll event of the browser's own, never a write.
 * The stand-in models NO browser bringing the offset back afterwards: one anchored on a row or on the spacer below
 * did (main on iOS 27.2: the jump reaches the tail), none does once every child of the root is out of the anchoring
 * (iOS 27.2 and WebKit at round 4's tip: thrown back), and none ever did where the browser does not anchor.
 */
const browserLaysOut = (scroller: HTMLElement) => {
  if ((animation || momentum) && !rowChosenAtALayout) {
    rowChosenAtALayout = anchoringHasACandidate(scroller);
  }
  if (clientHeight > 0) {
    const most = Math.max(0, layoutOf(scroller).contentHeight - clientHeight);
    if (scrollTopValue > most) {
      scrollTopValue = most;
      queueMicrotask(() => scroller.dispatchEvent(new Event('scroll')));
    }
  }
};
/** The anchoring's adjustment (the first job): the layout changed since the last tick, under a row chosen at a layout since then. */
const anchoringAdjusts = (scroller: HTMLElement): boolean => {
  browserLaysOut(scroller);
  const signature = layoutSignature(scroller);
  const adjusts = signature !== layoutAtLastTick && rowChosenAtALayout;
  layoutAtLastTick = signature;
  rowChosenAtALayout = false;
  return adjusts;
};
/**
 * One tick of the browser's animated scroll: `stepPx` toward the target as a scroll event (never a write), the
 * `scrollend` at the target — unless the anchoring adjusts, which ends the animation where it stands. False once no
 * animation runs.
 */
const engineTick = (scroller: HTMLElement, stepPx: number): boolean => {
  if (!animation) {
    return false;
  }
  if (anchoringAdjusts(scroller)) {
    animation = null;
    scroller.dispatchEvent(new Event('scroll'));
    scroller.dispatchEvent(new Event('scrollend'));
    return false;
  }
  scrollTopValue = Math.max(animation.target, scrollTopValue - stepPx);
  scroller.dispatchEvent(new Event('scroll'));
  if (scrollTopValue === animation.target) {
    animation = null;
    scroller.dispatchEvent(new Event('scrollend'));
  }
  return true;
};
/** One tick of a fling's momentum, downward: where the anchoring adjusts it fires `scrollend` — and the scroll goes on. */
const flingTick = (scroller: HTMLElement, stepPx: number) => {
  if (anchoringAdjusts(scroller)) {
    scroller.dispatchEvent(new Event('scrollend'));
  }
  scrollTopValue += stepPx;
  scroller.dispatchEvent(new Event('scroll'));
};
/**
 * The stand-in's second job: the block above the list (`above`, the list's root its next sibling) grows by `px`, and
 * the browser holds the list's place under it — the offset moved by as much, its own adjustment — only while the
 * list's root is a candidate.
 */
const growsAboveTheList = (scroller: HTMLElement, above: HTMLElement, px: number) => {
  above.setAttribute('data-h', String(heightOf(above) + px));
  if (isAnchoringCandidate(above.nextElementSibling as HTMLElement, scroller)) {
    scrollTopValue += px;
    scroller.dispatchEvent(new Event('scroll'));
  }
};

/** Where the list's tail begins in the layout: the bottom of the spacer below the rows. */
const tailTopOf = (scroller: HTMLElement): number => {
  const spacer = scroller.querySelector('[data-list-below]') as HTMLElement;
  return layoutOf(scroller).rects.get(spacer)?.bottom ?? 0;
};
/** What the browser lays out at the list's tail, after the spacer below the rows: each element with a box and each run
 *  of bare text — a box-less element (`display: contents`) standing as its children. */
const laidOutAtTheTail = (scroller: HTMLElement): Array<HTMLElement | Text> => {
  const out: Array<HTMLElement | Text> = [];
  const take = (node: ChildNode) => {
    if (node.nodeType === Node.TEXT_NODE) {
      if ((node.textContent ?? '').trim() !== '') {
        out.push(node as Text);
      }
    } else if (node instanceof HTMLElement) {
      if (node.style.display === 'contents') {
        node.childNodes.forEach(take);
      } else {
        out.push(node);
      }
    }
  };
  for (let node = scroller.querySelector('[data-list-below]')?.nextSibling ?? null; node; node = node.nextSibling) {
    take(node);
  }
  return out;
};
/**
 * The stand-in's second job at the list's TAIL — THE BROWSER'S ANCHOR INSIDE THE LIST, chosen at a layout: the first
 * candidate in view. A row in view that is a candidate (main); else, the tail in view, what is laid out there that is
 * still a candidate (bare text is one unless a box around it declares otherwise); else the root, whose top no commit
 * of the list moves.
 */
const browsersAnchorInTheList = (scroller: HTMLElement): 'a row' | 'the tail' | 'the root' => {
  const { rects } = layoutOf(scroller);
  const inView = (el: Element) => {
    const box = rects.get(el);
    return !!box && box.bottom > scrollTopValue && box.top < scrollTopValue + clientHeight;
  };
  const rows = Array.from(scroller.querySelectorAll<HTMLElement>('[data-row]'));
  if (rows.some((row) => inView(row) && isAnchoringCandidate(row, scroller))) {
    return 'a row';
  }
  const heldAtTheTail = laidOutAtTheTail(scroller).some((node) =>
    isAnchoringCandidate(node instanceof HTMLElement ? node : (node.parentElement as HTMLElement), scroller)
  );
  return heldAtTheTail && tailTopOf(scroller) <= scrollTopValue + clientHeight ? 'the tail' : 'the root';
};
/** The layout changed above the tail (a page landed): the browser keeps its anchor where it was — an anchor at the tail
 *  moved by the page, and the offset with it, its own adjustment, a scroll event, never a write. */
const browserHoldsItsAnchor = (
  scroller: HTMLElement,
  anchor: 'a row' | 'the tail' | 'the root',
  tailTopBefore: number
) => {
  const moved = tailTopOf(scroller) - tailTopBefore;
  if (anchor === 'the tail' && moved !== 0) {
    scrollTopValue += moved;
    scroller.dispatchEvent(new Event('scroll'));
  }
};

/** The scroller element takes the model's scroll geometry; its scrollTop setter is the write spy. */
const modelScroller = (el: HTMLElement) => {
  el.setAttribute('data-model-scroller', '');
  el.style.overflowY = 'auto';
  (el as unknown as { scrollTo: (options: { top: number }) => void }).scrollTo = ({ top }) => {
    animation = { target: top };
    layoutAtLastTick = layoutSignature(el);
    rowChosenAtALayout = false;
  };
  Object.defineProperty(el, 'clientWidth', { get: () => 390, configurable: true });
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
   * THE PRESS, as a finger makes it: the touch lands on the button (inside the scroller), lifts, the click follows —
   * and the lift's watch reaches its rest BEFORE the animation's first scroll event (the device: the click 49 ms after
   * the touchend, the first scroll event 38 ms after the click; three frames are 50 ms, 25 at 120 Hz).
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
  /** A mounted row wholly above the scroller's top edge, the nearest to it — where growth is growth above the reader. */
  const rowAbove = () =>
    [...mountedIds()].reverse().find((id) => boxOf(id).getBoundingClientRect().bottom < hostTop) as number;
  /** A row's box grows by `px`, reported by its observer. */
  const grows = async (id: number, px: number) => {
    await act(async () => {
      resize(boxOf(id), heightOf(boxOf(id)) + px);
    });
  };
  /** The block a case renders above the list in the same scroller, and the list's root — its next sibling. */
  const above = () => scroller.querySelector('[data-above]') as HTMLElement;
  const listRoot = () => above().nextElementSibling as HTMLElement;
  /** The boxes directly under a list's root as a browser lays them out — a box-less cell standing as its elements. */
  const boxesUnder = (listRootEl: HTMLElement): HTMLElement[] =>
    (Array.from(listRootEl.children) as HTMLElement[]).reduce<HTMLElement[]>(
      (out, child) =>
        out.concat(child.style.display === 'contents' ? (Array.from(child.children) as HTMLElement[]) : [child]),
      []
    );
  /** What a box under the root is, by kind. */
  const kindOf = (el: HTMLElement): string =>
    el.hasAttribute('data-row')
      ? 'row'
      : el.hasAttribute('data-list-reservoir')
        ? 'reservoir'
        : el.hasAttribute('data-list-below')
          ? 'spacer'
          : el.hasAttribute('data-list-sentinel')
            ? 'sentinel'
            : el.hasAttribute('data-foot') || el.hasAttribute('data-list-foot')
              ? 'foot'
              : el.querySelector('button[aria-label="Back to top"]')
                ? 'strip'
                : el.querySelector('[data-list-cell]')
                  ? 'group'
                  : el.tagName.toLowerCase();
  const kinds = (els: HTMLElement[]) => Array.from(new Set(els.map(kindOf))).sort();
  /** The kinds of box under the root, and those among them the browser's anchoring can still choose. */
  const kindsUnder = (listRootEl: HTMLElement) => kinds(boxesUnder(listRootEl));
  const inAnchoring = (listRootEl: HTMLElement) =>
    kinds(boxesUnder(listRootEl).filter((box) => isAnchoringCandidate(box, scroller)));
  /** What declares `overflow-anchor: none` at a list: its root, or a box under it. */
  const declaring = (listRootEl: HTMLElement) =>
    (declaresAnchorNone(listRootEl) ? ['root'] : []).concat(kinds(boxesUnder(listRootEl).filter(declaresAnchorNone)));
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
    momentum = false;
    rowChosenAtALayout = false;
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

  test('11a. the list holds its rows, under a browser that anchors (row 3435 — his phone on iOS 27: one press ended short): several screens down, ONE press, the motion settled — the scroller at its top, the first row first in view, the button gone, nothing written', async () => {
    const loader = new CorpusLoader(keys(), corpusOf(300));
    await mountList(loader, 300, { scrollTopButton: true });
    await frame();
    await readerScrollsDownTo(6_000);
    expect(mountedIds()[0]).toBeGreaterThan(50);
    expect(button().getAttribute('data-shown')).toBe('true');
    expect(writes).toEqual([]);

    // The red: the first window commit under the animation is a layout change with the rows as the anchoring's
    // candidates — the adjustment ends the animation, the scroller rests where that left it (5,600 of 6,000), the button
    // still up: his "it takes two taps".
    await press();
    await settle();
    expect(scrollTopValue).toBe(0);
    expect(mountedIds()[0]).toBe(0);
    expect(topOf(0)).toBe(0);
    expect(reservoirPx()).toBe(0);
    expect(writes).toEqual([]);
    expect(button().getAttribute('data-shown')).toBe('false');
  });

  test('11b. the list holds its rows, under a fling: no rest is declared at a window commit while the scroll goes on — what is owed is written at the fling’s own end, never under its momentum', async () => {
    const loader = new CorpusLoader(keys(), corpusOf(300));
    await mountList(loader, 300);
    await frame();
    await readerScrollsDownTo(2_000);
    // The finger flicks and lifts; as the momentum begins a row above the reader grows — absorbed, owed to the rest.
    await act(async () => {
      const row = boxOf(readerRow());
      row.dispatchEvent(new Event('touchstart', { bubbles: true }));
      row.dispatchEvent(new Event('touchend', { bubbles: true }));
    });
    layoutAtLastTick = layoutSignature(scroller);
    momentum = true;
    await grows(rowAbove(), 40);
    expect(writes).toEqual([]);

    // The momentum, a scroll event per tick, through several window commits. The red: the anchoring answers each
    // commit with a `scrollend`, the rest is declared under the momentum and the debt's write lands under it.
    let commits = 0;
    let first = mountedIds()[0];
    for (let k = 0; k < 12; k++) {
      flingTick(scroller, 200);
      await frame();
      if (mountedIds()[0] !== first) {
        commits++;
        first = mountedIds()[0];
      }
      expect(writes).toEqual([]);
    }
    expect(commits).toBeGreaterThanOrEqual(2);
    // The fling's own end — the browser's one `scrollend`, a true stop: the debt paid, once, the reader's row holding.
    momentum = false;
    const reader = readerRow();
    const offset = topOf(reader);
    await act(async () => {
      scroller.dispatchEvent(new Event('scrollend'));
    });
    expect(writes.length).toBe(1);
    expect(Math.abs(topOf(reader) - offset)).toBeLessThanOrEqual(0.5);
  });

  test('11c. who declares what: while the window’s engine is mounted the list’s root is a candidate of the browser’s anchoring and every child of the root is not — the foot’s box from its first render, each element of a row, a row that replaces its own box on a commit that is not the list’s and a child the list’s own later commit adds among them — a sibling of the list stays one and the scroller declares nothing; all of it is taken back when the list leaves the windowed mode; a list that is not windowed, or windowed with no scrollable ancestor, declares nothing', async () => {
    const loader = new CorpusLoader(keys(), corpusOf(300));
    // The consumer's foot draws its row on its OWN state (a loading row timing its own appearance) and one row replaces
    // its own box on its own state: two commits that are not the list's. One row is a fragment of two elements — two
    // boxes under the root, as the browser lays them out.
    let drawFoot: (drawn: boolean) => void = () => undefined;
    const Foot = () => {
      const [drawn, setDrawn] = React.useState(false);
      drawFoot = setDrawn;
      return drawn ? <div data-foot data-h={44} /> : null;
    };
    let replaceBox: () => void = () => undefined;
    const OwnBox = ({ r }: { r: Row }) => {
      const [generation, setGeneration] = React.useState(0);
      replaceBox = () => setGeneration((n) => n + 1);
      return <div key={generation} data-h={r.h} data-row={r.id} />;
    };
    const renderOwnRow = (r: Row) =>
      r.id === 3 ? (
        <OwnBox r={r} />
      ) : r.id === 5 ? (
        <>
          <div data-h={r.h} data-row={r.id} />
          <span data-row-tail />
        </>
      ) : (
        renderRow(r)
      );
    const renderFoot = () => <Foot />;
    const list = (windowed: boolean) => (
      <>
        <div data-above data-h={96} />
        <List<Row>
          loader={loader}
          windowSize={30}
          rowId={rowId}
          renderRow={renderOwnRow}
          renderFoot={renderFoot}
          scrollTopButton
          {...(windowed ? windowedProps({ estimatedRowHeight: ROW_H }) : {})}
        />
      </>
    );
    // NOT WINDOWED, in a scroller: untouched — nothing declared, on the root or under it.
    render(list(false));
    await waitFor(() => mountedIds().length === 30, 'the list, not windowed (30 rows)');
    expect(declaring(listRoot())).toEqual([]);

    // THE ENGINE MOUNTS (the same list, windowed): the root a candidate, every child of the root out — the foot's box
    // among them before the consumer's foot has drawn anything, and BOTH elements of the fragment row (`span` its
    // second); the list's sibling in the scroller a candidate still, and the scroller declares nothing (the review's
    // mutant — the declaration made on the scroller — takes the anchoring from everything in it).
    render(list(true));
    await flush();
    await frame();
    await flush();
    expect(scroller.querySelector('[data-foot]')).toBeNull();
    expect(kindsUnder(listRoot())).toEqual(['foot', 'reservoir', 'row', 'sentinel', 'spacer', 'span', 'strip']);
    expect(inAnchoring(listRoot())).toEqual([]);
    expect(isAnchoringCandidate(listRoot(), scroller)).toBe(true);
    expect(isAnchoringCandidate(above(), scroller)).toBe(true);
    expect(declaresAnchorNone(scroller)).toBe(false);

    // TWO COMMITS THAT ARE NOT THE LIST'S, each alone — the foot draws its row (inside the list's box, already out),
    // then a row replaces its own box (a child of its box-less cell): out, each, with no commit of the list between.
    await act(async () => {
      drawFoot(true);
    });
    await flush();
    expect(isAnchoringCandidate(scroller.querySelector('[data-foot]') as HTMLElement, scroller)).toBe(false);
    expect(inAnchoring(listRoot())).toEqual([]);
    const replaced = boxOf(3);
    await act(async () => {
      replaceBox();
    });
    await flush();
    expect(boxOf(3)).not.toBe(replaced);
    expect(inAnchoring(listRoot())).toEqual([]);

    // THE LIST'S OWN LATER COMMIT — the reader scrolls through a window commit: the rows it mounts are out too.
    const before = mountedIds();
    readerScrollsTo(scroller, 1_400);
    await frame();
    await flush();
    expect(mountedIds().some((id) => !before.includes(id))).toBe(true);
    expect(inAnchoring(listRoot())).toEqual([]);
    expect(isAnchoringCandidate(listRoot(), scroller)).toBe(true);

    // THE LIST LEAVES THE WINDOWED MODE: every declaration is taken back, and the foot's box goes with the mode — the
    // foot is drawn bare again (the consumer's component mounted anew with the body, its row not drawn).
    render(list(false));
    await flush();
    expect(kindsUnder(listRoot())).toEqual(['row', 'sentinel', 'span', 'strip']);
    expect(declaring(listRoot())).toEqual([]);

    // NO ENGINE — `windowed` handed to a list with no scrollable ancestor (round 2's review, RT2): nothing is declared;
    // the browser's anchoring is the only holder its rows have, and keeps them.
    const plain = document.createElement('div');
    document.body.appendChild(plain);
    const plainRoot = createRoot(plain);
    try {
      act(() => {
        plainRoot.render(
          <QueryClientProvider client={queryClient}>
            <List<Row>
              loader={new CorpusLoader(keys(), corpusOf(60))}
              windowSize={60}
              rowId={rowId}
              renderRow={renderRow}
              {...windowedProps({ estimatedRowHeight: ROW_H })}
            />
          </QueryClientProvider>
        );
      });
      await waitFor(() => plain.querySelectorAll('[data-row]').length === 60, 'the list with no scroller (60 rows)');
      await frame();
      const reservoirEl = plain.querySelector('[data-list-reservoir]') as HTMLElement;
      expect(reservoirEl).not.toBeNull();
      expect(declaring(reservoirEl.parentElement as HTMLElement)).toEqual([]);
    } finally {
      act(() => {
        plainRoot.unmount();
      });
      plain.remove();
    }
  });

  test('11d. the browser holds the list’s place under what stands above it (the pins row appearing above a reader deep in Home): the block above the list grows — the reader’s row does not move, nothing written', async () => {
    const loader = new CorpusLoader(keys(), corpusOf(300));
    render(
      <>
        <div data-above data-h={96} />
        <List<Row>
          loader={loader}
          windowSize={300}
          rowId={rowId}
          renderRow={renderRow}
          {...windowedProps({ estimatedRowHeight: ROW_H })}
        />
      </>
    );
    await waitFor(() => loader.loads.length >= 1 && scroller.querySelector('[data-row]') !== null, 'the first window');
    await frame();
    await readerScrollsDownTo(6_000);
    const reader = readerRow();
    const offset = topOf(reader);

    // The red at round 3's tip (the list's ROOT out of the anchoring): nothing in the list is the browser's to hold,
    // the offset stays and the reader's row moves down by the growth — 108 px, the pins row on the real Home.
    await act(async () => {
      growsAboveTheList(scroller, above(), 108);
    });
    await frame();
    await rest();
    expect(Math.abs(topOf(reader) - offset)).toBeLessThanOrEqual(0.5);
    expect(writes).toEqual([]);
  });

  test('11e. Home’s shape — a GROUPED windowed list under a browser that anchors (the one windowed list in the house is grouped): several screens down, ONE press, the motion settled — the scroller at its top, the first head and its first row first in view, the button gone, nothing written; each group box out of the anchoring, the root in it', async () => {
    const loader = new CorpusLoader(keys(), corpusOf(300));
    const HEAD_H = 40;
    await mountList(loader, 300, {
      scrollTopButton: true,
      groupKey: (r: Row) => `g${Math.floor(r.id / 50)}`,
      renderGroupHeader: (key: string) => <div data-h={HEAD_H} data-head={key} />,
      ...windowedProps({ estimatedRowHeight: ROW_H, estimatedGroupHeaderHeight: HEAD_H }),
    });
    await frame();
    await readerScrollsDownTo(6_000);
    expect(mountedIds()[0]).toBeGreaterThan(50);
    expect(button().getAttribute('data-shown')).toBe('true');
    expect(writes).toEqual([]);

    // The red (main, and a list whose group boxes are left in the anchoring): a row inside a group box is a candidate,
    // the first window commit under the animation ends it — the scroller rests short, the button still up.
    await press();
    await settle();
    expect(scrollTopValue).toBe(0);
    expect(mountedIds()[0]).toBe(0);
    expect((scroller.querySelector('[data-head="g0"]') as HTMLElement).getBoundingClientRect().top).toBe(0);
    expect(topOf(0)).toBe(HEAD_H);
    expect(reservoirPx()).toBe(0);
    expect(writes).toEqual([]);
    expect(button().getAttribute('data-shown')).toBe('false');
    // Who holds what: each group box is out, its rows with it; the root is the browser's.
    const listRootEl = reservoir().parentElement as HTMLElement;
    expect(kindsUnder(listRootEl)).toEqual(['group', 'reservoir', 'spacer', 'strip']);
    expect(inAnchoring(listRootEl)).toEqual([]);
    expect(isAnchoringCandidate(listRootEl, scroller)).toBe(true);
  });

  test.each<[string, (() => React.ReactNode) | null]>([
    ['bare text', () => 'Loading more'],
    [
      'a box inside the consumer’s own box-less element',
      () => (
        <div style={{ display: 'contents' }}>
          <div data-foot data-h={44} />
        </div>
      ),
    ],
    ['a row that draws itself later, on its own state', null],
  ])(
    '11f. the foot at the tail is under a box of the list’s own, out of the anchoring from its first render — %s: a page lands under a reader at the tail — the reader’s row does not move, nothing written',
    async (shape, handed) => {
      const loader = new CorpusLoader(keys(), corpusOf(300));
      let drawFoot: (drawn: boolean) => void = () => undefined;
      const Foot = () => {
        const [drawn, setDrawn] = React.useState(false);
        drawFoot = setDrawn;
        return drawn ? <div data-foot data-h={44} /> : null;
      };
      const drawnLater = () => <Foot />;
      await mountList(loader, 30, { renderFoot: handed ?? drawnLater });
      // The next page is asked at the lead and held on its way: the foot's moment.
      loader.hold = true;
      await frame();
      await flush();
      expect(loader.loads).toEqual([null, 30]);
      // The reader at the tail, at rest — and there the foot draws its row (the third shape): its own commit, no
      // commit of the list after it. Then on to the foot, in view.
      readerScrollsTo(scroller, scroller.scrollHeight - CLIENT_HEIGHT);
      await frame();
      await rest();
      if (!handed) {
        await act(async () => {
          drawFoot(true);
        });
        await flush();
      }
      readerScrollsTo(scroller, scroller.scrollHeight - CLIENT_HEIGHT);
      await frame();
      await rest();
      const at = scrollTopValue;
      const reader = readerRow();
      const offset = topOf(reader);

      // The browser chooses its anchor at this layout; the page lands above the foot — the spacer below the rows grows
      // by it before the next frame's window. The red (a foot left a candidate — the only one under the root): the
      // browser holds the foot and moves the offset by the page, 1,560 px, the reader thrown to the new tail.
      const anchor = browsersAnchorInTheList(scroller);
      const tail = tailTopOf(scroller);
      loader.release();
      await waitFor(() => belowPx() === 30 * ROW_H, 'the page landed (the spacer below grew by it)');
      await act(async () => {
        browserHoldsItsAnchor(scroller, anchor, tail);
      });
      await frame();
      await rest();
      expect(scrollTopValue).toBe(at);
      expect(Math.abs(topOf(reader) - offset)).toBeLessThanOrEqual(0.5);
      expect(writes).toEqual([]);
      loader.hold = false;
      loader.release();
    }
  );

  test('12. the hold’s own record: a hold is not undone at the next commit, a payment is not absorbed again as a debt nobody owes, and a row growing below the reader’s edge is not read back as drift', async () => {
    const loader = new CorpusLoader(keys(), corpusOf(300));
    await mountList(loader, 300);
    await frame();
    await readerScrollsDownTo(2_000);
    /** The reader scrolls by `delta` through a window commit: the reader's row moves by exactly that much, nothing written. */
    const scrollsThroughACommit = async (delta: number) => {
      const reader = readerRow();
      const offset = topOf(reader);
      const first = mountedIds()[0];
      const written = writes.length;
      readerScrollsTo(scroller, scrollTopValue + delta);
      await frame();
      expect(mountedIds()[0]).not.toBe(first);
      expect(mountedIds()).toContain(reader);
      expect(topOf(reader) - offset).toBe(-delta);
      expect(writes.length).toBe(written);
    };

    // 1. A HOLD IS NOT UNDONE: a row above the reader grows — absorbed — and BEFORE the rest the reader scrolls up
    //    through a commit. The red: the anchors still held their tops from before the hold shrank the reservoir, the
    //    commit read the hold back as drift and returned it — the reader's row thrown down by the growth.
    await grows(rowAbove(), 40);
    await scrollsThroughACommit(-400);
    let reader = readerRow();
    let offset = topOf(reader);
    await rest();
    expect(writes.length).toBe(1);
    expect(Math.abs(topOf(reader) - offset)).toBeLessThanOrEqual(0.5);

    // 2. A PAYMENT IS NOT ABSORBED AGAIN: the reader scrolls on through two commits and rests. The red: the anchors
    //    still held their tops from under the debt, each commit read the payment back as a debt nobody owes — the
    //    reader's row thrown up by it at every commit, a write at every rest after.
    await scrollsThroughACommit(500);
    await scrollsThroughACommit(500);
    await rest();
    expect(writes.length).toBe(1);

    // 3. GROWTH BELOW THE READER'S EDGE IS NOT DRIFT: a row in view grows — nothing above the reader moved, nothing
    //    absorbed — and the reader scrolls down through a commit that keeps only the window's last row. The red: the
    //    last row's top, recorded before the growth, read as 40 px of drift above the reader.
    reader = readerRow();
    offset = topOf(reader);
    await grows(reader + 2, 40);
    expect(topOf(reader)).toBe(offset);
    await scrollsThroughACommit(560);
    await rest();
    expect(writes.length).toBe(1);
  });

  test('13. the reservoir stands for the rows above the window at every layout — a row that reads the layout in its own layout effect (a title measuring its overflow): the reader jumps several screens down — the offset stays where the reader put it, the rows there in the document, nothing written', async () => {
    const ReadsItsLayout = ({ r }: { r: Row }) => {
      const box = React.useRef<HTMLDivElement | null>(null);
      React.useLayoutEffect(() => {
        box.current?.getBoundingClientRect();
      }, []);
      return <div ref={box} data-h={r.h} data-row={r.id} />;
    };
    const renderReadingRow = (r: Row) => <ReadsItsLayout r={r} />;
    const loader = new CorpusLoader(keys(), corpusOf(300));
    await mountList(loader, 300, { renderRow: renderReadingRow });
    await frame();
    expect(mountedIds()[0]).toBe(0);

    // ONE jump (a dragged scrollbar, the End key, a restored offset) from the top to the loaded end. The red: the
    // commit takes the rows of the old window out, the rows of the new one mount, and the first of them to read the
    // layout finds the reservoir not yet standing for the rows above — the content short by them — so the browser
    // clamps the offset there: the reader thrown back to where the old window ended.
    const tail = 300 * ROW_H - CLIENT_HEIGHT;
    readerScrollsTo(scroller, tail);
    await frame();
    await rest();
    await flush();
    expect(scrollTopValue).toBe(tail);
    expect(mountedIds()).toContain(299);
    expect(reservoirPx()).toBe(mountedIds()[0] * ROW_H);
    expect(writes).toEqual([]);
  });
});
