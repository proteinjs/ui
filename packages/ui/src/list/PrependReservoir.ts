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
 * debt paid, the leftover collapsed once the consumer says nothing remains above, a refill when the estimate ran
 * low by more than a viewport. Each step changes the block by at most one viewport — a shrink by at most the
 * reader's distance from the loaded start as well — and writes the drift it MEASURES on the first visible row
 * after the change — an engine whose own scroll anchoring already compensated reads a drift of zero and gets no
 * write — so a step the engine drops is bounded by a viewport, never a page, and a dropped shrink never pulls the
 * loaded start past the reader's edge.
 */
export class PrependReservoir {
  /** A reconcile step moves the reservoir by at most this many client heights, one step per rest. */
  static readonly STEP_VIEWPORTS = 1;
  /** A refill is owed only when the reservoir trails its target by more than this many client heights. */
  static readonly REFILL_BAND_VIEWPORTS = 1;
  /** The reservoir's ceiling — far beyond any list, inside every engine's layout range. */
  static readonly MAX_RESERVE_PX = 4_000_000;

  private reserve = 0;
  private remaining = 0;
  private seedEstimate = 0;
  private measuredTotal = 0;
  private measuredRows = 0;
  /** The first row's box top relative to the reservoir's box top, as of the last layout this owner saw. */
  private recordedFirstTop: number | null = null;

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

  /** The mounted rows measured for the estimate, the reservoir sized to the target, the first row recorded. */
  initialize(): void {
    const boxes = this.rowBoxes();
    if (boxes.length > 0) {
      const first = boxes[0].getBoundingClientRect();
      const last = boxes[boxes.length - 1].getBoundingClientRect();
      const span = last.bottom - first.top;
      if (span > 0) {
        this.measuredTotal = span;
        this.measuredRows = boxes.length;
      }
    }
    this.reserve = this.target();
    this.apply();
    this.record();
  }

  /** The list was replaced, emptied or filled from empty: sized to the target with nothing to hold the view against. */
  reset(): void {
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
    const nowTop = previousFirstBox.getBoundingClientRect().top - this.reservoir.getBoundingClientRect().top;
    const landed = nowTop - this.recordedFirstTop;
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
    this.recordedFirstTop =
      boxes.length > 0 ? boxes[0].getBoundingClientRect().top - this.reservoir.getBoundingClientRect().top : null;
  }

  /** Whether a reconcile step is wanted at the next rest. */
  owed(clientHeight: number): boolean {
    if (this.reserve < -0.5) {
      return true;
    }
    if (this.remaining <= 0) {
      return this.reserve > 0.5;
    }
    const band = Math.max(1, clientHeight * PrependReservoir.REFILL_BAND_VIEWPORTS);
    return Math.abs(this.target() - this.reserve) > band;
  }

  /**
   * ONE RECONCILE STEP, at the engine's rest: the reservoir moves toward its target by at most a viewport, and the
   * scroller is written by the drift measured on the first visible row — zero where the engine's own anchoring
   * already held it. A SHRINK (the end collapse, an overestimate) is bounded further, by the reader's distance from
   * the loaded start: its write holds the reader's row, and a write the engine drops (a pan that begins in the
   * write's frame; momentum that re-asserts its own offset) leaves the rows pulled up under the reader by the step —
   * bounded by that distance, a dropped step can at worst bring the loaded start to the reader's edge, never the
   * empty room past it. With the scroller at its very top no write can hold the first row at all (the offset
   * cannot go below 0), so the room the reader is looking at goes in ONE step — one move of the first row to the
   * edge, not a viewport of it every rest. Returns the drift written (0 for none).
   */
  step(clientHeight: number): number {
    const want = this.remaining > 0 ? this.target() : 0;
    const gap = want - this.reserve;
    if (Math.abs(gap) <= 0.5) {
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
    const scrollerTop = this.scroller.getBoundingClientRect().top;
    const reservoirBottom = this.reservoir.getBoundingClientRect().bottom;
    return scrollerTop - reservoirBottom - Math.min(0, this.reserve);
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

  /** The block's size from `reserve`: a positive reserve is its height, a negative one its bottom margin. */
  private apply(): void {
    this.reservoir.style.height = `${Math.max(0, this.reserve)}px`;
    this.reservoir.style.marginBottom = `${Math.min(0, this.reserve)}px`;
  }

  /** The reservoir resized with the first visible row held: its drift after the change is the one write. */
  private applyWithDrift(next: number): number {
    const anchor = this.anchorBox();
    const before = anchor ? anchor.getBoundingClientRect().top : null;
    this.reserve = next;
    this.apply();
    let written = 0;
    if (anchor && before !== null) {
      const drift = anchor.getBoundingClientRect().top - before;
      const offset = this.scroller.scrollTop + drift;
      // An offset below 0 is one the engine clamps: the write would hold nothing — none is made (the one-step
      // collapse at the very top moves the first row to the edge by design).
      if (Math.abs(drift) > 0.5 && offset >= 0) {
        this.scroller.scrollTop = offset;
        written = drift;
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
