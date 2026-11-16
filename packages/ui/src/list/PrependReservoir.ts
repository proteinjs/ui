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
 * THE WINDOW TERM (`setWindowAbove`): a windowed list — `List` in its windowed mode — mounts only the rows near the
 * viewport and keeps the rows loaded ABOVE its window out of the document; their measured heights sum to the block's
 * second term, added to `reserve` in the applied size. The two terms keep their meanings: `reserve` is the room for
 * rows not yet loaded (and the signed drift the laws absorb — a debt is paid out of the window's room before it is a
 * negative margin), `windowAbove` the exact height of loaded rows the window left out. `distanceFromLoadedStart` reads
 * from the LOADED start — the window's rows above are inside the loaded span. With no window term (the default, 0)
 * every number below is the one it was.
 *
 * TRUE LENGTHS (the ruler): every length held, compared or written here is the layout's own. The block's size and a
 * scroll offset are layout lengths; a rect is a DRAWN one — a host that draws the pane to a scale (a card drawn small
 * and growing back to its size) scales every rect with it and neither of those. A drift read from two rects and
 * written to `scrollTop` under a scale of 0.95 is short by a twentieth of the step, and the reader's row comes to
 * rest that much lower; a place recorded under a scale and read at another makes a landing take the difference out of
 * the block. So the reservoir carries a RULER: a box of a known true length (`RULER_PX`) inside the block, clipped by
 * a box of no size so that it adds nothing to the scroller's extent. Its drawn length over its true one is the scale
 * the pane is drawn at, and every length read from rects is divided by it (`trueLength`, the one conversion, public for
 * a consumer's own view math) — never by a drawn length over a rounded layout one (`offsetHeight` is a whole number: a
 * pixel in a few thousand at rest). A ruler that reads its own length (to `RULER_SLACK_PX`, an engine's rounding of a
 * long box on a zoomed page) says nothing is drawn to a scale, and every number is then, bit for bit, the one the rects
 * give; so does a ruler with no drawn length (a pane with no box, where every rect is empty). A slide moves both ends
 * of a length alike and needs no ruler.
 * THE RULER'S SEAT: its holder is STICKY at the scroller's top edge, inside the block — at the edge while the reader is
 * in the block, at the block's foot once the reader is below it — so the ruler's two edges are never farther from the
 * reader than the loaded rows above plus its own length. An engine holds a rect's edges in single precision once the
 * pane is drawn through a transform, a slide among them: a ruler left at the block's top, two million px above a reader
 * deep in a long list, read an eighth of a px off its own length there and was taken for a scale. THE BOUND, as
 * measured on Chromium and WebKit: the ruler reads its own length through any transform that scales nothing while
 * fewer than 2^21 px (2,097,152) of LOADED rows stand above the reader, whatever the block's size — its two edges
 * misread only where they stand either side of that length. A sticky holder holds to the nearest ancestor that scrolls
 * or clips: under one between the block and its scroller the ruler stays at the block's top.
 * OUT OF THE BLOCK'S FLOW: the holder does not stand in the block itself but in a box of its own, out of the block's
 * flow and stretched over the block from its top to its foot — the room the holder moves in. A sticky box stays in the
 * flow, and this one clips its ruler, so it is a formatting context of its own: standing in a block 0 px tall it would
 * stop the margins either side of the block from meeting through it — in a block layout a first row with a top margin
 * would stand lower by that margin, and the list's own top would move by as much as a whole debt. With nothing of
 * this owner's in its flow the block is to the layout the empty block it was before it carried a ruler, at any size.
 * WHAT THE SEAT NEEDS, and who sees to it: that box holds to the nearest positioned box above it, which must be the
 * block — this class makes the block one where it arrives with no position (`positionBlock`), so no file that renders
 * a block has to remember it.
 *
 * NO BOX (`boxless`): a pane that generates no box (a kept pane hidden with display: none) has no layout to read —
 * every rect in it is empty, its scroll offset reads 0 and every size its observers report is 0. THE ONE OWNER of the
 * word is here, by what the engine reports of the one box whose size nothing else decides: the ruler has no drawn
 * length (and the scroller no height — the word of a layout that draws no ruler). A scroller of no height whose rows
 * keep their boxes (squeezed for a moment, mounted before its height) IS laid out: its ruler reads its own length and
 * it is read as any other. EVERY READ PASSES THE WORD: with no box nothing is recorded (`record`), compared (`land` —
 * rows that land there take nothing out of the block), judged (`aboveReader`), absorbed (`absorbGrowth`), stepped
 * (`step`) or owed (`owed` — what cannot be paid is not asked of the rest), and the rows' span there, 0, is no
 * measurement. The first comparison after the box returns takes the record fresh, from the layout as it is; what the
 * pane could not pay while it had no box its owner asks of the rest when the box returns, and the step pays it by its
 * own law.
 */
export class PrependReservoir {
  /** A reconcile step moves the reservoir by at most this many client heights, one step per rest. */
  static readonly STEP_VIEWPORTS = 1;
  /** A refill is owed only when the reservoir trails its target by more than this many client heights. */
  static readonly REFILL_BAND_VIEWPORTS = 1;
  /** The reservoir's ceiling — far beyond any list, inside every engine's layout range. */
  static readonly MAX_RESERVE_PX = 4_000_000;
  /** The ruler's true length in px: long, so that the scale read from it is fine enough for a list of any length. */
  static readonly RULER_PX = 65536;
  /**
   * A ruler drawn within this many px of its own length is drawn as laid out: an engine rounds a long box by a
   * fraction of a layout step where the page is zoomed, and that is no scale.
   */
  static readonly RULER_SLACK_PX = 1 / 16;
  /** The grid a layout length lies on, in steps per px: a length read under a scale is returned to it. */
  static readonly LAYOUT_STEPS_PER_PX = 64;

  private reserve = 0;
  /** The measured height of the rows loaded above a windowed list's window — the block's second term (0 without a window). */
  private windowAbove = 0;
  private remaining = 0;
  private seedEstimate = 0;
  private measuredTotal = 0;
  private measuredRows = 0;
  /** The first row's box top relative to the reservoir's box top, as of the last layout this owner saw. */
  private recordedFirstTop: number | null = null;
  /**
   * The record does not say where the first row is: it was asked for while the pane had no box, or the block has moved
   * by a write of this owner's own since it was taken. The next comparison against it takes it fresh first.
   */
  private recordStale = false;
  /** The box of known true length the drawn scale is read from. */
  private readonly ruler: HTMLElement;

  constructor(
    private readonly scroller: HTMLElement,
    private readonly reservoir: HTMLElement,
    /** The rows' boxes in document order — the elements whose rects are the rows' geometry. */
    private readonly rowBoxes: () => HTMLElement[]
  ) {
    this.ruler = this.seatRuler();
  }

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
    // The block moves by this owner's own write: the record no longer says where the first row is. Marked, not retaken,
    // and no word is asked of the engine here: a windowed list calls this in its commit's insertion pass, where a read
    // of the layout BEFORE the block stands for the rows the window left out is the read that pass exists to prevent
    // (the engine clamps the offset to the short content), and one after it is a layout the commit did not ask for.
    this.recordStale = true;
    this.apply();
  }

  /** A box's top relative to the reservoir's top, as the engine lays it out now — the one geometry the records use. */
  topOf(box: HTMLElement): number {
    return this.trueLength(box.getBoundingClientRect().top - this.reservoir.getBoundingClientRect().top);
  }

  /**
   * A length read from rects inside this scroller — a difference of two edges, or a rect's own size — as the layout's
   * own, whatever scale a host draws the pane at. THE ONE CONVERSION for this scroller's content: every read here goes
   * through it, and a consumer's own view math reads through it too (`PrependSafeScrollerApi.trueLength`), never
   * through a ruler of its own.
   */
  trueLength(drawn: number): number {
    return this.layoutLength(drawn, this.drawnScale());
  }

  /**
   * NO BOX: the pane this scroller is in generates no box (a kept pane hidden with display: none), so nothing in it
   * has a length to read. The engine says so of the one box here whose size nothing else decides — the ruler has no
   * drawn length — and a layout that draws no ruler says it with the scroller's own height, so the two are asked
   * together. A scroller of no height whose rows keep their boxes is laid out, and is not this. THE ONE OWNER of the
   * word: every read of this class passes it, and its consumers ask it here.
   */
  boxless(): boolean {
    return this.scroller.clientHeight <= 0 && !(this.ruler.getBoundingClientRect().height > 0);
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
    if (!this.readable()) {
      // Rows landed in a pane with no box: their height is no length yet, so nothing is taken out of the block. The
      // room then owed is paid at the rest, by the step's own law, once the box is back.
      return 0;
    }
    if (this.recordStale) {
      // The first row in the document stands at the block's foot, where the row that was first stood before these
      // rows landed above it: its place now is the record this landing is measured against.
      this.takeRecord();
    }
    if (!previousFirstBox || this.recordedFirstTop === null) {
      this.reset();
      return 0;
    }
    const landed = this.topOf(previousFirstBox) - this.recordedFirstTop;
    this.reserve -= landed;
    this.measuredTotal += landed;
    this.measuredRows += landedCount;
    this.apply();
    this.takeRecord();
    return landed;
  }

  /** A row above the first visible row changed height by `delta`: absorbed height-neutrally. */
  absorbGrowth(delta: number): void {
    if (delta === 0 || !this.readable()) {
      return;
    }
    this.reserve -= delta;
    this.apply();
    this.takeRecord();
  }

  /**
   * Whether a row that changed height by `delta` stood wholly above the reader before the change — its bottom then at
   * or above the scroller's top edge — so that the whole change pushed the reader. `delta` is a layout length (the
   * observer's); the rects are drawn, so the change and the half-pixel are taken as drawn too.
   */
  aboveReader(box: Element, delta: number): boolean {
    if (this.boxless()) {
      return false; // no box: no row stands anywhere, and a size reported from there is no change to judge
    }
    const scale = this.drawnScale();
    const edge = this.scroller.getBoundingClientRect().top;
    return box.getBoundingClientRect().bottom - delta * scale <= edge + 0.5 * scale;
  }

  /** Re-record the first row's place after a commit that kept the same first row. */
  record(): void {
    if (this.readable()) {
      this.takeRecord();
    }
  }

  /**
   * Whether a reconcile step is wanted at the next rest. Never with no box: nothing can be paid there, so nothing is
   * owed — a rest asked for it would step nothing and ask again, for as long as the pane is hidden. What stands unpaid
   * is asked of the rest by the owner when the box returns.
   */
  owed(clientHeight: number): boolean {
    return this.wanted(clientHeight) && !this.boxless();
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
   * Returns the write made (0 for none).
   */
  step(clientHeight: number): number {
    if (!this.readable()) {
      return 0; // no box: a drift read here is 0 whatever moved, and no write would hold the reader's row
    }
    const atEnd = this.remaining <= 0;
    const want = atEnd ? 0 : this.target();
    const gap = want - this.reserve;
    if (Math.abs(gap) <= 0.5) {
      return 0;
    }
    if (atEnd) {
      return this.applyWithDrift(want);
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
    return this.trueLength(scrollerTop - reservoirTop) - this.reserve;
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

  /** Whether the block stands off where it should: a debt, a leftover at the end, or a target more than the band away. */
  private wanted(clientHeight: number): boolean {
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
   * The mounted rows' span, as the measurement (replacing any earlier one: these rows are the list now); none without
   * rows. A span of 0 is no measurement — rows in a pane with no box read one — and the measure there was stands.
   */
  private measureMounted(): void {
    const boxes = this.rowBoxes();
    if (boxes.length === 0) {
      this.measuredTotal = 0;
      this.measuredRows = 0;
      return;
    }
    const first = boxes[0].getBoundingClientRect();
    const last = boxes[boxes.length - 1].getBoundingClientRect();
    const span = this.trueLength(last.bottom - first.top);
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
    const scale = this.drawnScale();
    const anchor = this.anchorBox();
    const before = anchor ? anchor.getBoundingClientRect().top : null;
    this.reserve = next;
    this.apply();
    let written = 0;
    if (anchor && before !== null) {
      const drift = this.layoutLength(anchor.getBoundingClientRect().top - before, scale);
      const current = this.scroller.scrollTop;
      const offset = Math.max(0, current + drift);
      if (Math.abs(drift) > 0.5 && Math.abs(offset - current) > 0.5) {
        this.scroller.scrollTop = offset;
        written = offset - current;
      }
    }
    this.takeRecord();
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

  /**
   * THE GATE every read of the layout passes: whether the pane has a box to read. With none the record is marked — it
   * says nothing of a layout that is not there — and the caller reads, compares and writes nothing.
   */
  private readable(): boolean {
    if (this.boxless()) {
      this.recordStale = true;
      return false;
    }
    return true;
  }

  /** The first row's place, from the layout as it is. */
  private takeRecord(): void {
    const boxes = this.rowBoxes();
    this.recordedFirstTop = boxes.length > 0 ? this.topOf(boxes[0]) : null;
    this.recordStale = false;
  }

  /**
   * The scale the pane is drawn at: the ruler's drawn length over its true one. 1 where the ruler reads its own
   * length (nothing is drawn to a scale) and where it has no drawn length at all (no box: no rect holds a length).
   */
  private drawnScale(): number {
    const drawn = this.ruler.getBoundingClientRect().height;
    if (!(drawn > 0) || Math.abs(drawn - PrependReservoir.RULER_PX) <= PrependReservoir.RULER_SLACK_PX) {
      return 1;
    }
    return drawn / PrependReservoir.RULER_PX;
  }

  /**
   * A length read from rects — a difference of two edges, drawn at `scale` — as the layout's own: divided by the
   * scale and returned to the layout's grid, so that a whole number of px read under a scale is that whole number
   * (an engine that keeps whole scroll offsets drops the fraction of a write a hair under one). Drawn as laid out,
   * it is the length as read.
   */
  private layoutLength(drawn: number, scale: number): number {
    if (scale === 1) {
      return drawn;
    }
    const steps = PrependReservoir.LAYOUT_STEPS_PER_PX;
    return Math.round((drawn / scale) * steps) / steps;
  }

  /**
   * The ruler in the block: a box `RULER_PX` tall inside a holder of no size that clips it — unseen, no room taken in
   * the block, and nothing to the scroller's extent (a short list stays unscrollable). The holder is sticky at the
   * scroller's top edge (the header's THE RULER'S SEAT): the ruler is read where the reader is, never from the top of
   * a block millions of px above. The holder stands in a box that is OUT OF THE BLOCK'S FLOW and as tall as the block
   * (the block is a positioned box, made one here if it arrived with no position; this box holds to its top and its
   * foot and clips nothing, so the holder still sticks to the scroller): nothing of the ruler is in the block's flow,
   * and margins meet through a block 0 px tall as they do through an empty one. The block is this owner's to fill, as
   * its size is this owner's to write; an owner mounted again over the same block finds the ruler standing.
   */
  private seatRuler(): HTMLElement {
    this.positionBlock();
    for (let i = 0; i < this.reservoir.children.length; i++) {
      const seat = this.reservoir.children[i].firstElementChild;
      if (seat?.hasAttribute('data-prepend-ruler') && seat.firstElementChild instanceof HTMLElement) {
        return seat.firstElementChild;
      }
    }
    const page = this.reservoir.ownerDocument;
    const outOfFlow = page.createElement('div');
    outOfFlow.setAttribute('aria-hidden', 'true');
    outOfFlow.style.cssText = 'position:absolute;top:0;bottom:0;left:0;width:0;visibility:hidden;pointer-events:none';
    const seat = page.createElement('div');
    seat.setAttribute('data-prepend-ruler', '');
    seat.style.cssText =
      'position:sticky;top:0;left:0;width:0;height:0;overflow:hidden;visibility:hidden;pointer-events:none';
    const ruler = page.createElement('div');
    ruler.style.cssText = `width:1px;height:${PrependReservoir.RULER_PX}px`;
    seat.appendChild(ruler);
    outOfFlow.appendChild(seat);
    this.reservoir.appendChild(outOfFlow);
    return ruler;
  }

  /**
   * THE SEAT'S OWN PRECONDITION, held by the seat's owner: the ruler's box holds to the nearest positioned box above
   * it, and that must be the block. Held to any other (the scroller, the pane) the box is only as tall as that one,
   * and the holder cannot follow a reader far down a long block: the ruler is left near the block's top. So a block
   * with no position is made a positioned box where it stands (relative, with no offset: no box in the flow moves; a
   * box out of the flow that stands in the block holds to the block from then on, as the scroller's loading row
   * does), and a block a consumer positioned is left as it is. The word is the engine's computed one, which counts a
   * style sheet's rule; an engine computes nothing for a block not yet in a document, and there the block's own
   * declaration is read.
   */
  private positionBlock(): void {
    const view = this.reservoir.ownerDocument.defaultView;
    const position = (view ? view.getComputedStyle(this.reservoir).position : '') || this.reservoir.style.position;
    if (position === '' || position === 'static') {
      this.reservoir.style.position = 'relative';
    }
  }
}
