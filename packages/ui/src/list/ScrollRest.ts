/**
 * THE LIST AT REST — one definition for every scroller that must wait for the engine to stop before it writes a
 * scroll position.
 *
 * On iOS WebKit an overflow scroller's offset belongs to the UI process while a finger is down or a fling runs: a
 * programmatic `scrollTop` write under a pan is re-derived away on the pan's next update, a write under momentum
 * ends the deceleration, and the main thread's getter can lag a frame behind the write. Chromium honours a write
 * mid-pan but re-asserts a scrollbar-thumb drag's position over the next frames. So an owner whose scroll write
 * must be invisible waits for the list to be AT REST, judged here one way. The list is at rest when all four hold:
 *
 *   R1 NO ARM IS DOWN — no touch the page was told of that began on the scroller (each counted by its identifier,
 *      so one of two fingers lifting is not "no finger"), and no mouse button on the scroller's own scrollbar (a
 *      pointerdown whose offset lies outside the client box … pointerup / pointercancel). A touch's end is heard on
 *      the touch's OWN target, bound when it begins: the engine sends a touch's later events to the element it
 *      began on, and when that element has left the document (a streaming reply replaces its text under the
 *      finger) they no longer reach the scroller — a lift heard only there left the finger down for good.
 *   R2 INSIDE A GESTURE A FINGER BEGAN, THE ENGINE HAS ENDED THE SCROLL — a `scrollend` has come since the last
 *      `scroll` event. A gesture opens at the first scroll event seen with a known touch down and closes at the
 *      rest that ends it, so the glide after the lift is inside it — and so is a finger that CATCHES that glide: a
 *      catch reaches the page as no event at all, the scroll events simply stop, and the engine withholds its
 *      `scrollend` until that finger lifts. Outside a gesture (a script's write, an engine's clamp, a wheel, a
 *      write on a hidden scroller) this condition holds: such a scroll ends by the window alone, never waiting on
 *      an event that needs a gesture it cannot take. An engine with no `scrollend` opens no gesture: the window is
 *      its whole rule — one predicate, "the engine has ended the scroll", from one of two sources, chosen once per
 *      instance.
 *   R3 THE WINDOW — `QUIET_MS` of clock time have passed since the last `scroll` event. Clock time, not animation
 *      frames: three frames are 50 ms at 60 Hz and 25 ms at 120 Hz, shorter than the gaps between a glide's last
 *      scroll events and than the pause between a lift and the motion it starts.
 *   R4 THE SCROLLER IS INSIDE ITS SCROLL RANGE — not stretched past an edge by a rubber band, where a write lands
 *      off by the stretch.
 *
 * `onRest` fires once when the four first hold together after motion, an arm or a `request()`. The rest is judged
 * by ONE timer, armed for what is left of the window: an arm's lift, a `scrollend` and a `request()` only ask for
 * the judgment, so nothing fires inside the task that asked — from an idle list it fires in the next task.
 */
export class ScrollRest {
  /** Clock time with no `scroll` event that counts as the scroll's end (R3). */
  static readonly QUIET_MS = 150;
  /** Nothing in this library reads it any longer (see `QUIET_MS`); it stays for those who import it. */
  static readonly QUIET_FRAMES = 3;
  /** The identifier a touch event that names no touch stands for (a synthetic event: one touch down, one lifted). */
  private static readonly UNNAMED_TOUCH = -1;

  private scroller: HTMLElement | null = null;
  private detachListeners: (() => void) | null = null;
  /** The touches down that the page was told of, by identifier, each with the element its end is heard on. */
  private readonly touches = new Map<number, EventTarget>();
  private scrollbarPress = false;
  /** A rest is owed to the owner: motion or an arm was seen, or a rest was asked for, and none was reached since. */
  private owed = false;
  /** A scroll a known finger began is open: its end is the engine's `scrollend` (R2). */
  private gesture = false;
  /** A `scrollend` has come since the last `scroll` event. */
  private scrollEnded = false;
  /** The clock at the last `scroll` event. */
  private lastScrollAt = Number.NEGATIVE_INFINITY;
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** Whether this engine fires `scrollend` — the source of "the engine has ended the scroll", chosen once. */
  private readonly engineEndsScrolls = typeof window !== 'undefined' && 'onscrollend' in window;

  constructor(private readonly onRest: () => void) {}

  /** The arms' and the motion's listeners on the scroller; returns the detach (also `detach()`). */
  attach(scroller: HTMLElement): () => void {
    this.detach();
    this.scroller = scroller;
    const onTouchStart = (event: Event) => this.touchBegan(event);
    const onPointerDown = (event: PointerEvent) => {
      if (ScrollRest.onScrollbar(scroller, event)) {
        this.scrollbarPress = true;
        this.owed = true;
      }
    };
    const onPointerEnd = () => {
      if (this.scrollbarPress) {
        this.scrollbarPress = false;
        this.judgeWhenQuiet();
      }
    };
    const onScroll = () => {
      this.lastScrollAt = performance.now();
      this.scrollEnded = false;
      if (this.engineEndsScrolls && this.touches.size > 0) {
        this.gesture = true;
      }
      this.owed = true;
      this.judgeWhenQuiet();
    };
    const onScrollEnd = () => {
      this.scrollEnded = true;
      this.judgeWhenQuiet();
    };
    scroller.addEventListener('touchstart', onTouchStart, { passive: true });
    scroller.addEventListener('pointerdown', onPointerDown, { passive: true });
    scroller.addEventListener('pointerup', onPointerEnd, { passive: true });
    scroller.addEventListener('pointercancel', onPointerEnd, { passive: true });
    scroller.addEventListener('scroll', onScroll, { passive: true });
    scroller.addEventListener('scrollend', onScrollEnd, { passive: true });
    this.detachListeners = () => {
      scroller.removeEventListener('touchstart', onTouchStart);
      scroller.removeEventListener('pointerdown', onPointerDown);
      scroller.removeEventListener('pointerup', onPointerEnd);
      scroller.removeEventListener('pointercancel', onPointerEnd);
      scroller.removeEventListener('scroll', onScroll);
      scroller.removeEventListener('scrollend', onScrollEnd);
    };
    return () => this.detach();
  }

  detach(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.detachListeners) {
      this.detachListeners();
      this.detachListeners = null;
    }
    new Set(this.touches.values()).forEach((target) => this.unbindTouchEnd(target));
    this.touches.clear();
    this.scroller = null;
    this.scrollbarPress = false;
    this.owed = false;
    this.gesture = false;
    this.scrollEnded = false;
    this.lastScrollAt = Number.NEGATIVE_INFINITY;
  }

  /** Something waits for the rest: `onRest` fires at the next rest — in the next task at the soonest. */
  request(): void {
    this.owed = true;
    this.judgeWhenQuiet();
  }

  /** A touch the page was told of on the scroller, or a mouse button on its scrollbar (R1). */
  get armDown(): boolean {
    return this.touches.size > 0 || this.scrollbarPress;
  }

  /** The four conditions, read now. */
  get atRest(): boolean {
    return (
      !this.armDown &&
      (!this.gesture || this.scrollEnded) &&
      performance.now() - this.lastScrollAt >= ScrollRest.QUIET_MS &&
      this.inRange()
    );
  }

  /** A touch began on the scroller: counted by identifier, its end bound on the element it began on. */
  private touchBegan(event: Event): void {
    const target = event.target;
    if (!target) {
      return;
    }
    ScrollRest.touchIds(event).forEach((id) => this.touches.set(id, target));
    // The same listener on the same target is one listener, however many touches began there.
    target.addEventListener('touchend', this.touchEnded, { passive: true });
    target.addEventListener('touchcancel', this.touchEnded, { passive: true });
    this.owed = true;
  }

  /** A touch ended or was cancelled, heard on its own target: with no touch left, the rest is judged. */
  private readonly touchEnded = (event: Event): void => {
    ScrollRest.touchIds(event).forEach((id) => this.touches.delete(id));
    const target = event.currentTarget;
    if (target && !Array.from(this.touches.values()).includes(target)) {
      this.unbindTouchEnd(target);
    }
    if (this.touches.size === 0) {
      this.judgeWhenQuiet();
    }
  };

  private unbindTouchEnd(target: EventTarget): void {
    target.removeEventListener('touchend', this.touchEnded);
    target.removeEventListener('touchcancel', this.touchEnded);
  }

  /** The one timer, armed for what is left of the window (idempotent); nothing is armed with no rest owed. */
  private judgeWhenQuiet(): void {
    if (this.timer !== null || !this.owed) {
      return;
    }
    const left = this.lastScrollAt + ScrollRest.QUIET_MS - performance.now();
    this.timer = setTimeout(this.judge, Math.max(0, left));
  }

  /**
   * The judgment: a scroll event since the timer was armed moves the window, and the timer follows it; conditions
   * that do not hold yet are each re-judged by the event that turns them (a lift, a `scrollend`, the next scroll).
   */
  private readonly judge = (): void => {
    this.timer = null;
    if (!this.owed) {
      return;
    }
    if (performance.now() - this.lastScrollAt < ScrollRest.QUIET_MS) {
      this.judgeWhenQuiet();
      return;
    }
    if (!this.atRest) {
      return;
    }
    this.owed = false;
    this.gesture = false;
    this.onRest();
  };

  /**
   * The scroller sits at a legal position — not past an edge. iOS WebKit lets scrollTop go negative past the top
   * (or past the bottom) inside a rubber band and pauses at the stretched offset before springing back; a write
   * made there lands off by the stretch, so the band is waited out (its spring-back's scroll events re-judge).
   */
  private inRange(): boolean {
    const scroller = this.scroller;
    if (!scroller) {
      return true;
    }
    const max = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
    return scroller.scrollTop >= -0.5 && scroller.scrollTop <= max + 0.5;
  }

  /** The touches an event reports as begun or ended, by identifier; an event that names none stands for one. */
  private static touchIds(event: Event): number[] {
    const changed = (event as TouchEvent).changedTouches;
    if (!changed || changed.length === 0) {
      return [ScrollRest.UNNAMED_TOUCH];
    }
    const ids: number[] = [];
    for (let i = 0; i < changed.length; i++) {
      ids.push(changed[i].identifier);
    }
    return ids;
  }

  /**
   * A press on the scroller's own scrollbar: the event targets the scroller itself and its offset lies outside the
   * client box (a vertical bar at the right, or at the left of a right-to-left scroller; a horizontal bar below).
   * A press on content targets the content; a press on the scroller's own padding lies inside the box.
   */
  private static onScrollbar(scroller: HTMLElement, event: PointerEvent): boolean {
    if (event.target !== scroller) {
      return false;
    }
    return (
      event.offsetX < 0 ||
      event.offsetX >= scroller.clientWidth ||
      event.offsetY < 0 ||
      event.offsetY >= scroller.clientHeight
    );
  }
}
