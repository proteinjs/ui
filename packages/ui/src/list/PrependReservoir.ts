/**
 * THE RESERVOIR — the block above a list's loaded start that absorbs every height change above the reader, so that
 * nothing the reader sees moves and no scroll position is ever written at a landing.
 *
 * A top-origin scroller keeps `scrollTop` when content is inserted above the viewport: the content moves down under
 * the reader by the inserted height. The usual compensation is a `scrollTop` write, and on iOS WebKit that write
 * is advisory — undone under a finger, raced by the page's own render, acknowledged a frame late. The reservoir
 * makes the compensation unnecessary: an empty block sized for the rows not yet loaded sits at the start edge, and
 * every landing of rows at the start SHRINKS it by exactly the height the landed rows added, in the same layout
 * pass, before paint. The scroller's `scrollHeight` is unchanged, `scrollTop` is unchanged, the reader's row is
 * where it was — while a finger is down, while a fling runs, while a band springs back.
 *
 * The reservoir's size is a signed number of pixels, `reserve`:
 *   • reserve > 0 — the block's height: room for the rows still above, from the consumer's count × the measured
 *     mean row height (the consumer's `estimatedRowHeight` seeds it until rows are measured);
 *   • reserve < 0 — a DEBT: a landing taller than the room left. The block is at zero height with a negative bottom
 *     margin of the shortfall, so the landing was still height-neutral (the first rows sit above the scroll origin,
 *     unreachable until the debt is paid) and the reader did not move.
 * Rows above the first visible row that grow or shrink later (a picture, a late card, a font) are absorbed the same
 * way, in the resize observation, before paint.
 *
 * The only scroll-position writes are the RECONCILE steps the owner runs at the engine's rest (`ScrollRest`): the
 * whole gap once the consumer says nothing remains above (the leftover collapsed, the debt paid — one step, one
 * write), a refill while rows remain and the estimate trails by more than a viewport. Each step writes the drift it
 * MEASURES on the first visible row after the change — an engine whose own scroll anchoring already compensated
 * reads a drift of zero and gets no write. While rows remain a step changes the block by at most one viewport — a
 * shrink by at most the reader's distance from the loaded start as well — so a step the engine drops is bounded by
 * a viewport, never a page, and a dropped shrink never pulls the loaded start past the reader's edge. At the end
 * that bound would only split the gap into a write per rest, each painted as a tick where the engine acknowledges
 * a write a frame late (iOS WebKit), so the end takes the gap at once.
 *
 * THE READER'S VIEW (`noteReaderInput`): a step's write holds the reader's row only where the engine takes it. Under
 * a touch iOS WebKit keeps its own offset — the write reads back as taken, the engine discards it at the touch's
 * next move, and the block's new size stands — and a touch that lands on a fling reaches the scroller with no event
 * reaching the page, so no watch for fingers can keep a step out from under one. A chain of viewport steps under
 * such a touch pulled the rows a viewport per step out from under a reader a few rows above the end, past the end's
 * edge, and the lift settled the view on the END. So from the reader's first input on the scroller (a wheel, a touch
 * that moves, a press) the ESTIMATE's reconcile — the one step that is the scroller's own idea, owed to nothing the
 * reader did — runs only while the view rests at the scroller's END, where a step the engine drops settles on the
 * view the reader already had; anywhere else it waits for the reader to return there by their own hand or by a door
 * that takes them there. A debt and the end's collapse are owed to rows that landed and step as before. A list
 * replaced or filled from empty is a view the reader has not moved.
 *
 * THE WINDOW TERM (`setWindowAbove`): a windowed list — `List` in its windowed mode — mounts only the rows near the
 * viewport and keeps the rows loaded ABOVE its window out of the document; their measured heights sum to the block's
 * second term, added to `reserve` in the applied size. The two terms keep their meanings: `reserve` is the room for
 * rows not yet loaded (and the signed drift the laws absorb — a debt is paid out of the window's room before it is a
 * negative margin), `windowAbove` the exact height of loaded rows the window left out. `distanceFromLoadedStart` reads
 * from the LOADED start — the window's rows above are inside the loaded span. With no window term (the default, 0)
 * every number below is the one it was.
 */
export class PrependReservoir {
  /** A reconcile step moves the reservoir by at most this many client heights, one step per rest. */
  static readonly STEP_VIEWPORTS = 1;
  /** A refill is owed only when the reservoir trails its target by more than this many client heights. */
  static readonly REFILL_BAND_VIEWPORTS = 1;
  /** The reservoir's ceiling — far beyond any list, inside every engine's layout range. */
  static readonly MAX_RESERVE_PX = 4_000_000;
  /** The events on the scroller that are the reader moving the view by their own input. */
  static readonly READER_INPUTS = ['wheel', 'touchmove', 'pointerdown'] as const;

  private reserve = 0;
  /** The measured height of the rows loaded above a windowed list's window — the block's second term (0 without a window). */
  private windowAbove = 0;
  private remaining = 0;
  private seedEstimate = 0;
  private measuredTotal = 0;
  private measuredRows = 0;
  /** The first row's box top relative to the reservoir's box top, as of the last layout this owner saw. */
  private recordedFirstTop: number | null = null;
  /** The reader moved this list's view by their own input: the estimate's reconcile waits for them at the END. */
  private readerMoved = false;

  constructor(
    private readonly scroller: HTMLElement,
    private readonly reservoir: HTMLElement,
    /** The rows' boxes in document order — the elements whose rects are the rows' geometry. */
    private readonly rowBoxes: () => HTMLElement[]
  ) {}

  /** The consumer's count of rows not yet loaded above, and the seed for the row-height estimate. */
  setRemaining(remaining: number, estimatedRowHeight: number): void {
    this.remaining = Math.max(0, Number.isFinite(remaining) ? remaining : 0);
    this.seedEstimate = Math.max(0, Number.isFinite(estimatedRowHeight) ? estimatedRowHeight : 0);
  }

  /**
   * A windowed list's rows loaded above its window, by their measured heights: the block grows by exactly that much in
   * the same layout pass (a window shifting down leaves rows above by their measured heights; shifting up takes them
   * back) — the rest of the block's bookkeeping is untouched, so a drift absorbed into `reserve` stands until the rest.
   */
  setWindowAbove(px: number): void {
    const next = Math.max(0, Number.isFinite(px) ? px : 0);
    if (next === this.windowAbove) {
      return;
    }
    this.windowAbove = next;
    this.apply();
  }

  /** A box's top relative to the reservoir's top, as the engine lays it out now — the one geometry the records use. */
  topOf(box: HTMLElement): number {
    return box.getBoundingClientRect().top - this.reservoir.getBoundingClientRect().top;
  }

  /** The mounted rows measured for the estimate, the reservoir sized to the target, the first row recorded. */
  initialize(): void {
    this.measureMounted();
    this.reserve = this.target();
    this.apply();
    this.record();
  }

  /**
   * The list was replaced, emptied or filled from empty: the rows now mounted ARE measured rows — the estimate is
   * their mean from this commit (the seed stands only while no row is in the document), so a consumer's exact count
   * sizes an exact room before the first paint and the first landing owes no refill, no debt and no collapse to
   * a seed that was off. Sized to the target with nothing to hold the view against.
   */
  reset(): void {
    this.readerMoved = false;
    this.measureMounted();
    this.reserve = this.target();
    this.apply();
    this.record();
  }

  /**
   * THE LANDING: `landedCount` rows are now in the document before the row that was first; `previousFirstBox` is
   * that row's box. Its displacement since the last record is exactly the height the landing added above it —
   * margins, collapsed or not, included — and the reservoir shrinks by that much in this same layout pass.
   * Returns the height absorbed.
   */
  land(previousFirstBox: HTMLElement | null, landedCount: number): number {
    if (!previousFirstBox || this.recordedFirstTop === null) {
      this.reset();
      return 0;
    }
    const landed = this.topOf(previousFirstBox) - this.recordedFirstTop;
    this.reserve -= landed;
    this.measuredTotal += landed;
    this.measuredRows += landedCount;
    this.apply();
    this.record();
    return landed;
  }

  /** A row above the first visible row changed height by `delta`: absorbed height-neutrally. */
  absorbGrowth(delta: number): void {
    if (delta === 0) {
      return;
    }
    this.reserve -= delta;
    this.apply();
    this.record();
  }

  /** Re-record the first row's place after a commit that kept the same first row. */
  record(): void {
    const boxes = this.rowBoxes();
    this.recordedFirstTop = boxes.length > 0 ? this.topOf(boxes[0]) : null;
  }

  /** The reader's own input on the scroller — a wheel, a touch that moves, a press: from here the view is theirs. */
  noteReaderInput(): void {
    this.readerMoved = true;
  }

  /** Whether a reconcile step is wanted at the next rest. */
  owed(clientHeight: number): boolean {
    if (this.reserve < -0.5) {
      return true;
    }
    if (this.remaining <= 0) {
      return this.reserve > 0.5;
    }
    if (this.yieldsToReader()) {
      return false;
    }
    const band = Math.max(1, clientHeight * PrependReservoir.REFILL_BAND_VIEWPORTS);
    return Math.abs(this.target() - this.reserve) > band;
  }

  /**
   * ONE RECONCILE STEP, at the engine's rest; the scroller is written by the drift measured on the first visible
   * row — zero where the engine's own anchoring already held it.
   *
   * AT THE END (nothing remains above) the whole gap goes at once: the leftover collapsed or the debt paid with ONE
   * write, the reader's row holding its offset while a write can hold it — with the room above the reader's edge
   * wider than the offset none can, so the first row arrives at the edge in that same step (a write of 0; none
   * where the scroller already sits at 0). A bounded step here would be a write per rest, each painted as a tick
   * on an engine that acknowledges a write a frame late (iOS WebKit): the vibration at a transcript's top.
   *
   * WHILE ROWS REMAIN (a refill, an overestimate corrected) the reservoir moves toward its target by at most a
   * viewport, and a SHRINK is bounded further, by the reader's distance from the loaded start: its write holds the
   * reader's row, and a write the engine drops (a pan that begins in the write's frame; momentum that re-asserts
   * its own offset) leaves the rows pulled up under the reader by the step — bounded by that distance, a dropped
   * step can at worst bring the loaded start to the reader's edge, never the empty room past it. With the scroller
   * at its very top no write can hold the first row at all, so the room the reader is looking at goes in one step.
   * The estimate's step (no debt to pay) waits while the reader holds the view away from the END (`yieldsToReader`).
   * Returns the write made (0 for none).
   */
  step(clientHeight: number): number {
    const atEnd = this.remaining <= 0;
    const want = atEnd ? 0 : this.target();
    const gap = want - this.reserve;
    if (Math.abs(gap) <= 0.5) {
      return 0;
    }
    if (atEnd) {
      return this.applyWithDrift(want);
    }
    if (this.reserve >= -0.5 && this.yieldsToReader()) {
      return 0;
    }
    let limit = Math.max(1, clientHeight * PrependReservoir.STEP_VIEWPORTS);
    if (gap < 0) {
      const offset = this.scroller.scrollTop;
      limit =
        offset <= 0.5 ? Math.abs(gap) : Math.max(1, Math.min(limit, Math.abs(this.distanceFromLoadedStart()), offset));
    }
    const delta = Math.sign(gap) * Math.min(Math.abs(gap), limit);
    return this.applyWithDrift(this.reserve + delta);
  }

  /** The reader's distance from the loaded start: the scroller's top edge below the first row's start, in px. */
  distanceFromLoadedStart(): number {
    // The loaded start sits `reserve` below the block's top: the room, or (a debt) above it; a window's rows above
    // are loaded rows, inside the span. With no window term this is the block's bottom plus its negative margin.
    const scrollerTop = this.scroller.getBoundingClientRect().top;
    const reservoirTop = this.reservoir.getBoundingClientRect().top;
    return scrollerTop - reservoirTop - this.reserve;
  }

  /** The reservoir's signed size in px (a negative value is the debt). */
  get reservePx(): number {
    return this.reserve;
  }

  /** The mean row height in use: the measured mean once rows were measured, the seed before. */
  get estimate(): number {
    const measured = this.measuredRows > 0 ? this.measuredTotal / this.measuredRows : 0;
    return measured > 0 ? measured : this.seedEstimate;
  }

  private target(): number {
    return Math.min(PrependReservoir.MAX_RESERVE_PX, this.remaining * this.estimate);
  }

  /**
   * Whether the estimate's reconcile waits for the reader: they moved the view by their own input and it is not at
   * the scroller's END — the last pixel of its extent, which the engine reports whole where the offset is not.
   */
  private yieldsToReader(): boolean {
    if (!this.readerMoved) {
      return false;
    }
    const { scrollTop, scrollHeight, clientHeight } = this.scroller;
    return scrollHeight - clientHeight - scrollTop > 1;
  }

  /** The mounted rows' span, as the measurement (replacing any earlier one: these rows are the list now); none without rows. */
  private measureMounted(): void {
    const boxes = this.rowBoxes();
    if (boxes.length === 0) {
      this.measuredTotal = 0;
      this.measuredRows = 0;
      return;
    }
    const first = boxes[0].getBoundingClientRect();
    const last = boxes[boxes.length - 1].getBoundingClientRect();
    const span = last.bottom - first.top;
    if (span > 0) {
      this.measuredTotal = span;
      this.measuredRows = boxes.length;
    }
  }

  /** The block's size from `reserve`: a positive reserve is its height, a negative one its bottom margin. */
  private apply(): void {
    // The two terms as one block: a debt is paid out of the window's room before it is a negative margin.
    const total = this.reserve + this.windowAbove;
    this.reservoir.style.height = `${Math.max(0, total)}px`;
    this.reservoir.style.marginBottom = `${Math.min(0, total)}px`;
  }

  /**
   * The reservoir resized with the first visible row held: its drift after the change is the one write, clamped
   * at 0 where the engine would clamp it (no write holds a row above the scroller's top: the first row arrives at
   * the edge instead) — and no write where the clamped offset is the one the scroller already has.
   */
  private applyWithDrift(next: number): number {
    const anchor = this.anchorBox();
    const before = anchor ? anchor.getBoundingClientRect().top : null;
    this.reserve = next;
    this.apply();
    let written = 0;
    if (anchor && before !== null) {
      const drift = anchor.getBoundingClientRect().top - before;
      const current = this.scroller.scrollTop;
      const offset = Math.max(0, current + drift);
      if (Math.abs(drift) > 0.5 && Math.abs(offset - current) > 0.5) {
        this.scroller.scrollTop = offset;
        written = offset - current;
      }
    }
    this.record();
    return written;
  }

  /** The first row at least partly below the scroller's top edge — the reader's row; the first row when none is. */
  private anchorBox(): HTMLElement | null {
    const boxes = this.rowBoxes();
    const top = this.scroller.getBoundingClientRect().top;
    for (const box of boxes) {
      if (box.getBoundingClientRect().bottom > top + 0.5) {
        return box;
      }
    }
    return boxes.length > 0 ? boxes[0] : null;
  }
}
