/**
 * THE START EDGE — the block of no height at a list's start, where every height change above the reader is HELD out
 * of the scroll range, and from where it is paid with one scroll write.
 *
 * A top-origin scroller keeps `scrollTop` when content is added above the viewport: the content moves down under the
 * reader by the added height. The usual answer is a `scrollTop` write, and a write made while the engine is moving
 * the list is not kept on iOS WebKit (re-derived away under a finger, never shown in a glide or in the band). So the
 * change is first HELD: the block takes a negative bottom margin of exactly the height that appeared above the
 * reader's row, in the same layout pass, before paint. The scroller's `scrollHeight` is unchanged, `scrollTop` is
 * unchanged, the reader's row is where it was — under a finger, in a glide, in the band — and the rows that were added
 * sit above the scroll origin, where nothing can reach them yet. Height that goes away above the reader is held the
 * other way, as the block's own height (a gap).
 *
 * What is held is an exact, signed number of pixels, `held`, measured on the reader's own row and never estimated:
 * nothing here knows how many rows a consumer has not loaded yet, or how tall they might be.
 *
 * THE SETTLE pays what is held, whole, with ONE scroll write, in one task: the margin released and the reader's row
 * put back by the drift measured on it (a gap the other way round: the write first, then the block, so the offset is
 * never outside the range). Where a finger can move the list, THE STOP comes first: the scroller's overflow is
 * hidden for one painted frame, so nothing is moving the list when the write is made — a write on a stopped list is
 * kept in every state an engine can be in, and a finger the page was never told of loses its pan, never the reader's
 * place. The stop is not taken where hiding the overflow would change the scroller's content box (a scrollbar that
 * takes room), nor on a device with no touch input. WHEN the settle runs is the owner's to say: at the list's rest,
 * or where the reader has run out of loaded rows.
 *
 * THE WINDOW TERM (`setWindowAbove`): a windowed list — `List` in its windowed mode — mounts only the rows near the
 * viewport and keeps the rows loaded ABOVE its window out of the document; their measured heights sum to the block's
 * own height. What is held comes off that height before it is a negative margin. `distanceFromLoadedStart` reads
 * from the LOADED start — the window's rows above are inside the loaded span. With no window term (the default, 0)
 * every number below is the one it was.
 */
export class ListStartEdge {
  /**
   * Height above the reader held out of the scroll range, px. Positive: rows above the scroll origin (the block's
   * negative bottom margin). Negative: a gap, kept as the block's own height.
   */
  private held = 0;
  /** The measured height of the rows loaded above a windowed list's window — the block's own height (0 without a window). */
  private windowAbove = 0;
  /** A stop under way: its pending animation frame, and what puts the scroller's overflow back. */
  private stop: { frame: number; release: () => void } | null = null;

  constructor(
    private readonly scroller: HTMLElement,
    private readonly edge: HTMLElement,
    /** The rows' boxes in document order — the elements whose rects are the rows' geometry. */
    private readonly rowBoxes: () => HTMLElement[]
  ) {}

  /**
   * A windowed list's rows loaded above its window, by their measured heights: the block grows by exactly that much in
   * the same layout pass (a window shifting down leaves rows above by their measured heights; shifting up takes them
   * back) — what is held stands until the settle.
   */
  setWindowAbove(px: number): void {
    const next = Math.max(0, Number.isFinite(px) ? px : 0);
    if (next === this.windowAbove) {
      return;
    }
    this.windowAbove = next;
    this.apply();
  }

  /** A box's top relative to the block's top, as the engine lays it out now — the one geometry every measure uses. */
  topOf(box: HTMLElement): number {
    return box.getBoundingClientRect().top - this.edge.getBoundingClientRect().top;
  }

  /**
   * A box's top against the LOADED START: its top against the block, with what is held counted back in. Only a
   * change of height above the box changes this number — a hold and its payment leave it as it was — so a place
   * read at one moment can be compared with the place read at a later one, whatever was held or paid in between.
   */
  placeOf(box: HTMLElement): number {
    return this.topOf(box) + this.held;
  }

  /**
   * Height appeared (`delta` > 0) or went away (`delta` < 0) above the reader's row: held out of the scroll range in
   * this same layout pass, with no scroll write.
   */
  hold(delta: number): void {
    if (!Number.isFinite(delta) || delta === 0) {
      return;
    }
    this.held += delta;
    this.apply();
  }

  /** The list was replaced, emptied or filled from empty: there is no reader's row to hold anything against. */
  reset(): void {
    this.held = 0;
    this.apply();
  }

  /** Whether anything is held: a settle is wanted. */
  get owes(): boolean {
    return Math.abs(this.held) > 0.5;
  }

  /** Whether a stop is under way: its settle has begun and its write is a painted frame away. */
  get settling(): boolean {
    return this.stop !== null;
  }

  /**
   * THE SETTLE: what is held is paid whole with one scroll write, the reader's row where it was — after the stop,
   * where a finger can move the list. `done` runs in the write's own task. Returns false, having begun nothing, when
   * nothing is held, a settle is already under way, or the scroller has no box (a pane not laid out measures every
   * drift against nothing: what is held stands until the box is back). The box is looked for again in the write's
   * own frame: a pane put away inside the stopped frame is not written against, its stop ends, and what is held
   * stands (`done` does not run).
   */
  settle(done?: () => void): boolean {
    if (this.stop !== null || !this.owes || this.scroller.clientHeight <= 0) {
      return false;
    }
    const release = this.stopTheList();
    if (!release) {
      this.pay();
      done?.();
      return true;
    }
    // One painted frame with the list stopped: the first frame's callback runs ahead of that paint, the second after it.
    const stop = {
      release,
      frame: requestAnimationFrame(() => {
        stop.frame = requestAnimationFrame(() => {
          this.stop = null;
          if (this.scroller.clientHeight <= 0) {
            release();
            return;
          }
          this.pay();
          release();
          done?.();
        });
      }),
    };
    this.stop = stop;
    return true;
  }

  /** A stop under way is given up — the owner is leaving: the overflow back, nothing written, what is held standing. */
  cancel(): void {
    const stop = this.stop;
    if (!stop) {
      return;
    }
    this.stop = null;
    cancelAnimationFrame(stop.frame);
    stop.release();
  }

  /** The reader's distance from the loaded start: the scroller's top edge below the first row's start, in px. */
  distanceFromLoadedStart(): number {
    // The loaded start sits `held` above the block's top (rows above the scroll origin are loaded rows), or (a gap)
    // below it; a window's rows above are loaded rows too, inside the span.
    const scrollerTop = this.scroller.getBoundingClientRect().top;
    const edgeTop = this.edge.getBoundingClientRect().top;
    return scrollerTop - edgeTop + this.held;
  }

  /**
   * What is held, as the block's signed size in px: negative while rows sit above the scroll origin, waiting for the
   * settle; positive for a gap; 0 with nothing held.
   */
  get reservePx(): number {
    return this.held === 0 ? 0 : -this.held;
  }

  /**
   * THE READER'S ROWS: the first row at least partly below the scroller's top edge — the reader's row — and the rows
   * after it down to the scroller's bottom edge; the first row alone when none lies below the top edge. The rows a
   * change above the reader is measured on: the reader's row, and (should a commit remove it) the first one after it
   * that is still there.
   */
  readerRows(): HTMLElement[] {
    const boxes = this.rowBoxes();
    if (boxes.length === 0) {
      return [];
    }
    const box = this.scroller.getBoundingClientRect();
    // Rows stand in document order, so their bottoms only grow: the first one below the top edge by halving.
    let low = 0;
    let high = boxes.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (boxes[middle].getBoundingClientRect().bottom > box.top + 0.5) {
        high = middle;
      } else {
        low = middle + 1;
      }
    }
    if (low >= boxes.length) {
      return [boxes[0]];
    }
    const rows = [boxes[low]];
    for (let index = low + 1; index < boxes.length && boxes[index].getBoundingClientRect().top < box.bottom; index++) {
      rows.push(boxes[index]);
    }
    return rows;
  }

  /** The block's size from what is held: the window's rows above less the held height, a shortfall as a bottom margin. */
  private apply(): void {
    const total = this.windowAbove - this.held;
    this.edge.style.height = `${Math.max(0, total)}px`;
    this.edge.style.marginBottom = `${Math.min(0, total)}px`;
  }

  /**
   * THE STOP: the scroller's overflow hidden, so that nothing is moving the list when the write is made. Only on a
   * device with touch input (nowhere else can a finger the page cannot see be on the list), and never where hiding the
   * overflow changes the scroller's content box (a scrollbar that takes room would give its width to the rows, and
   * every row would be laid out again for a frame). Returns what puts the overflow back; null where no stop is taken.
   */
  private stopTheList(): (() => void) | null {
    if (typeof navigator === 'undefined' || !(navigator.maxTouchPoints > 0)) {
      return null;
    }
    const scroller = this.scroller;
    const before = scroller.style.overflowY;
    const width = scroller.clientWidth;
    scroller.style.overflowY = 'hidden';
    if (scroller.clientWidth !== width) {
      scroller.style.overflowY = before;
      return null;
    }
    return () => {
      scroller.style.overflowY = before;
    };
  }

  /**
   * ONE TASK, ONE WRITE. Rows above the scroll origin: the margin is released first (the range grows by what was
   * held, the rows come down under the reader), and the reader's row is put back by the drift measured on it — an
   * absolute write from a read in this same task, clamped at 0 where the engine would clamp it, and none where an
   * engine's own anchoring already held the row. A gap is the other way round: the write first, then the block —
   * released first, the range would end above the reader's offset for the length of this task and the engine would
   * move the reader to its end.
   */
  private pay(): void {
    const held = this.held;
    this.held = 0;
    if (held < 0) {
      const current = this.scroller.scrollTop;
      const offset = Math.max(0, current + held);
      if (Math.abs(offset - current) > 0.5) {
        this.scroller.scrollTop = offset;
      }
      this.apply();
      return;
    }
    const row = this.readerRows()[0] ?? null;
    const before = row ? row.getBoundingClientRect().top : null;
    this.apply();
    if (row && before !== null) {
      const drift = row.getBoundingClientRect().top - before;
      const current = this.scroller.scrollTop;
      const offset = Math.max(0, current + drift);
      if (Math.abs(drift) > 0.5 && Math.abs(offset - current) > 0.5) {
        this.scroller.scrollTop = offset;
      }
    }
  }
}
