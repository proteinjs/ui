/**
 * THE ENGINE'S REST — one definition for every scroller that must wait for the engine to stop before it writes a
 * scroll position.
 *
 * On iOS WebKit an overflow scroller's offset belongs to the UI process while a finger is down or a fling runs: a
 * programmatic `scrollTop` write under a pan is re-derived away on the pan's next update, a write under momentum
 * ends the deceleration, and the main thread's getter can lag a frame behind the write. Chromium honours a write
 * mid-pan but re-asserts a scrollbar-thumb drag's position over the next frames. So an owner whose scroll write
 * must be invisible waits for the engine's REST, judged here one way:
 *
 *   • an ARM is down — a finger on the scroller (touchstart … touchend / touchcancel) or a mouse button on the
 *     scroller's own scrollbar (a pointerdown whose offset lies outside the client box … pointerup / pointercancel)
 *     — and the engine is not at rest, whatever the scroll events say;
 *   • a scroll event is motion; the rest is QUIET_FRAMES animation frames after the last one with no arm down and
 *     the scroller inside its scroll range (not stretched past an edge by a rubber band); `scrollend` short-circuits
 *     the count where the engine fires it (WebKit fires one per programmatic write and one at a fling's end — each
 *     a true stop);
 *   • a lifted arm may START motion (a lift into momentum, a band's spring-back), so a lift re-opens the watch
 *     rather than declaring the rest.
 *
 * Never a settle timer: the quiet is counted in animation frames, so a throttled tab and a 120 Hz phone judge the
 * same stillness. `request()` asks for the next rest explicitly: the watch runs from an idle engine too, so work owed
 * to the rest lands QUIET_FRAMES frames later, never inside the task that asked for it.
 */
export class ScrollRest {
  /** Animation frames with no scroll event, and no arm down, that count as the engine's rest. */
  static readonly QUIET_FRAMES = 3;

  private scroller: HTMLElement | null = null;
  private detachListeners: (() => void) | null = null;
  private fingerDown = false;
  private pointerDown = false;
  /** Motion seen (a scroll event, an arm) and no rest reached since. */
  private moving = false;
  /** A rest was asked for explicitly (`request`) and has not been reached since. */
  private requested = false;
  private scrollSeq = 0;
  private watchSeq = 0;
  private quietFrames = 0;
  private frame = 0;

  constructor(private readonly onRest: () => void) {}

  /** The arms' and the motion's listeners on the scroller; returns the detach (also `detach()`). */
  attach(scroller: HTMLElement): () => void {
    this.detach();
    this.scroller = scroller;
    const onTouchStart = () => {
      this.fingerDown = true;
      this.moving = true;
      this.cancelWatch();
    };
    const onTouchEnd = () => {
      this.fingerDown = false;
      this.armLifted();
    };
    const onPointerDown = (event: PointerEvent) => {
      if (ScrollRest.onScrollbar(scroller, event)) {
        this.pointerDown = true;
        this.moving = true;
        this.cancelWatch();
      }
    };
    const onPointerEnd = () => {
      if (this.pointerDown) {
        this.pointerDown = false;
        this.armLifted();
      }
    };
    const onScroll = () => {
      this.scrollSeq++;
      this.moving = true;
      this.ensureWatch();
    };
    const onScrollEnd = () => {
      if (!this.armDown && this.inRange()) {
        this.reachRest();
      }
    };
    scroller.addEventListener('touchstart', onTouchStart, { passive: true });
    scroller.addEventListener('touchend', onTouchEnd, { passive: true });
    scroller.addEventListener('touchcancel', onTouchEnd, { passive: true });
    scroller.addEventListener('pointerdown', onPointerDown, { passive: true });
    scroller.addEventListener('pointerup', onPointerEnd, { passive: true });
    scroller.addEventListener('pointercancel', onPointerEnd, { passive: true });
    scroller.addEventListener('scroll', onScroll, { passive: true });
    scroller.addEventListener('scrollend', onScrollEnd, { passive: true });
    this.detachListeners = () => {
      scroller.removeEventListener('touchstart', onTouchStart);
      scroller.removeEventListener('touchend', onTouchEnd);
      scroller.removeEventListener('touchcancel', onTouchEnd);
      scroller.removeEventListener('pointerdown', onPointerDown);
      scroller.removeEventListener('pointerup', onPointerEnd);
      scroller.removeEventListener('pointercancel', onPointerEnd);
      scroller.removeEventListener('scroll', onScroll);
      scroller.removeEventListener('scrollend', onScrollEnd);
    };
    return () => this.detach();
  }

  detach(): void {
    this.cancelWatch();
    if (this.detachListeners) {
      this.detachListeners();
      this.detachListeners = null;
    }
    this.scroller = null;
    this.fingerDown = false;
    this.pointerDown = false;
    this.moving = false;
    this.requested = false;
  }

  /** Something waits for the rest: `onRest` fires at the next rest — QUIET_FRAMES frames from now at the soonest. */
  request(): void {
    this.requested = true;
    this.ensureWatch();
  }

  /** A finger on the scroller, or a mouse button on its scrollbar. */
  get armDown(): boolean {
    return this.fingerDown || this.pointerDown;
  }

  /** No arm down and no motion since the last rest. */
  get atRest(): boolean {
    return !this.moving && !this.armDown;
  }

  /**
   * An arm lifted: a lift may start motion (momentum, a band's spring-back), so the engine is not taken to be at
   * rest — the watch re-confirms it. With the other arm still down, nothing changes.
   */
  private armLifted(): void {
    if (this.armDown) {
      return;
    }
    this.moving = true;
    this.ensureWatch();
  }

  /** The watch: an animation-frame loop that counts quiet frames; idempotent; never runs under an arm. */
  private ensureWatch(): void {
    if (this.frame !== 0 || this.armDown || !(this.moving || this.requested)) {
      return;
    }
    this.watchSeq = this.scrollSeq;
    this.quietFrames = 0;
    this.frame = requestAnimationFrame(this.tick);
  }

  private readonly tick = (): void => {
    this.frame = 0;
    if (this.armDown || !(this.moving || this.requested)) {
      return; // the lift re-arms the watch; nothing owed stops it
    }
    if (this.scrollSeq !== this.watchSeq || !this.inRange()) {
      // the engine moved since the last frame, or sits stretched inside a rubber band: the count restarts
      this.watchSeq = this.scrollSeq;
      this.quietFrames = 0;
      this.frame = requestAnimationFrame(this.tick);
      return;
    }
    this.quietFrames++;
    if (this.quietFrames >= ScrollRest.QUIET_FRAMES) {
      this.reachRest();
      return;
    }
    this.frame = requestAnimationFrame(this.tick);
  };

  private reachRest(): void {
    this.cancelWatch();
    this.moving = false;
    this.requested = false;
    this.onRest();
  }

  private cancelWatch(): void {
    if (this.frame !== 0) {
      cancelAnimationFrame(this.frame);
      this.frame = 0;
    }
  }

  /**
   * The scroller sits at a legal position — not past an edge. iOS WebKit lets scrollTop go negative past the top
   * (or past the bottom) inside a rubber band and pauses at the stretched offset before springing back; a write
   * made there lands off by the stretch, so the band is waited out.
   */
  private inRange(): boolean {
    const scroller = this.scroller;
    if (!scroller) {
      return true;
    }
    const max = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
    return scroller.scrollTop >= -0.5 && scroller.scrollTop <= max + 0.5;
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
