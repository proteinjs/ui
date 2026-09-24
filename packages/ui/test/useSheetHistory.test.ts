/**
 * @jest-environment node
 */
import {
  SHEET_HISTORY_STATE_KEY,
  SheetHistoryCoordinator,
  SheetHistoryEnv,
  SheetHistoryInstance,
} from '../src/hooks/useSheetHistory';

/** Router-shaped base entry (usr/key/idx — what @remix-run/router keeps in history.state). */
const routerEntry = (idx: number): Record<string, unknown> => ({ usr: null, key: `k${idx}`, idx });

/**
 * Fake history with browser-faithful traversal timing, matching the semantics OBSERVED live
 * (round 18, Chrome): back()/forward()/user gestures queue a traversal whose landing position
 * is resolved AT CALL TIME — a pushState issued between the call and the landing does NOT
 * shift where the traversal lands (the fresh entry is stranded forward). flush() drains the
 * coordinator's parked microtasks, then applies traversals one at a time, firing popstate
 * after each and re-draining microtasks between (a handler may park more work).
 */
class FakeHistory implements SheetHistoryEnv {
  stack: Array<Record<string, unknown> | null>;
  position = 0;
  /** Traversals applied (each fires one popstate) — zero means history was left untouched. */
  popCount = 0;
  /** replaceState calls — the handoff transfer channel. */
  replaceCount = 0;
  onPop: (event: Event) => void = () => undefined;
  /** Landing positions captured at call time (the load-bearing browser fact). */
  private traversals: number[] = [];
  private microtasks: Array<() => void> = [];

  constructor(initial: Record<string, unknown> | null = routerEntry(0)) {
    this.stack = [initial];
  }

  getState(): unknown {
    return this.stack[this.position];
  }

  pushState(state: Record<string, unknown>): void {
    this.stack.splice(this.position + 1);
    this.stack.push(state);
    this.position += 1;
  }

  replaceState(state: Record<string, unknown>): void {
    this.stack[this.position] = state;
    this.replaceCount += 1;
  }

  back(): void {
    this.traversals.push(this.position - 1);
  }

  forward(): void {
    this.traversals.push(this.position + 1);
  }

  defer(task: () => void): void {
    this.microtasks.push(task);
  }

  /** The UA's own session-history position (the Navigation API's currentEntry.index / entries().length):
   *  the coordinator reads the traversal's direction and bounds from it. */
  traversal(): { index: number; length: number } | null {
    return { index: this.position, length: this.stack.length };
  }

  /** The user's OS back gesture / back button — queues identically to a programmatic back. */
  userBack(): void {
    this.traversals.push(this.position - 1);
  }

  userGo(delta: number): void {
    this.traversals.push(this.position + delta);
  }

  /** Runs parked coordinator microtasks WITHOUT applying traversals — exposes the in-flight
   *  window between a flushed back() and its landing. */
  drainMicrotasks(): void {
    let guard = 0;
    while (this.microtasks.length > 0) {
      if (++guard > 50) {
        throw new Error('runaway microtask loop');
      }
      this.microtasks.shift()!();
    }
  }

  flush(): void {
    let guard = 0;
    this.drainMicrotasks();
    while (this.traversals.length > 0) {
      if (++guard > 50) {
        throw new Error('runaway traversal loop');
      }
      const target = this.traversals.shift()!;
      this.position = Math.max(0, Math.min(this.stack.length - 1, target));
      this.popCount += 1;
      this.onPop(new Event('popstate'));
      this.drainMicrotasks();
    }
  }

  markerAt(position: number): unknown {
    const state = this.stack[position];
    return state ? (state as Record<string, unknown>)[SHEET_HISTORY_STATE_KEY] : undefined;
  }

  currentMarker(): unknown {
    return this.markerAt(this.position);
  }
}

/** Drives the coordinator exactly like the hook's effect does (register+opened / unregister). */
function harness(initial?: Record<string, unknown> | null) {
  const history = new FakeHistory(initial);
  const coordinator = new SheetHistoryCoordinator(history);
  history.onPop = coordinator.handlePop;
  const sheet = (opts: { throws?: string } = {}) => {
    let closeCount = 0;
    const instance: SheetHistoryInstance = {
      open: false,
      entryId: null,
      consuming: false,
      onClose: () => {
        closeCount += 1;
        if (opts.throws) {
          throw new Error(opts.throws);
        }
      },
    };
    return {
      instance,
      closes: () => closeCount,
      open() {
        instance.open = true;
        coordinator.register(instance);
        coordinator.opened(instance);
      },
      /** open→false AND unmount take the same path (the hook's effect cleanup). */
      close() {
        instance.open = false;
        coordinator.unregister(instance);
      },
    };
  };
  return { history, coordinator, sheet };
}

describe('SheetHistoryCoordinator', () => {
  it('open pushes exactly one same-URL entry, preserving the router state and incrementing idx', () => {
    const { history, sheet } = harness();
    sheet().open();
    expect(history.stack).toHaveLength(2);
    expect(history.position).toBe(1);
    const entry = history.getState() as Record<string, unknown>;
    expect(typeof entry[SHEET_HISTORY_STATE_KEY]).toBe('string');
    expect(entry.idx).toBe(1); // router idx carried forward +1
    expect(entry.key).toBe('k0'); // router key preserved → location recomputes identically
    expect(entry.usr).toBeNull();
  });

  it('double-open does not stack a second entry (idempotence by live entry)', () => {
    const { history, coordinator, sheet } = harness();
    const s = sheet();
    s.open();
    coordinator.opened(s.instance); // effect re-fire / double signal
    expect(history.stack).toHaveLength(2);
    expect(history.position).toBe(1);
  });

  it('user back closes the sheet exactly once and lands on the page entry', () => {
    const { history, sheet } = harness();
    const s = sheet();
    s.open();
    history.userBack();
    history.flush();
    expect(s.closes()).toBe(1);
    expect(history.position).toBe(0);
    // Host reacts by flipping open false — must not fire another traversal or close.
    s.close();
    history.flush();
    expect(s.closes()).toBe(1);
    expect(history.position).toBe(0);
  });

  it('forward onto a dismissed sheet entry is consumed — no ghost reopen, no double close', () => {
    const { history, sheet } = harness();
    const s = sheet();
    s.open();
    history.userBack();
    history.flush();
    s.close();
    history.userGo(1); // forward button onto the dead marker
    history.flush();
    expect(history.position).toBe(0); // bounced back off the ghost
    expect(s.closes()).toBe(1);
  });

  it('programmatic close consumes the entry and swallows the popstate (no onClose)', () => {
    const { history, sheet } = harness();
    const s = sheet();
    s.open();
    s.close();
    history.flush();
    expect(history.position).toBe(0);
    expect(s.closes()).toBe(0);
  });

  it('open/close cycles leave history length and position unchanged (no accumulation)', () => {
    const { history, sheet } = harness();
    const s = sheet();
    for (let cycle = 0; cycle < 3; cycle++) {
      s.open();
      history.flush();
      s.close();
      history.flush();
    }
    expect(history.position).toBe(0);
    // Each reopen truncates the previous cycle's dead forward entry: length stays constant.
    expect(history.stack).toHaveLength(2);
    expect(s.closes()).toBe(0);
  });

  it('rapid reopen cancels the parked close — the live entry stays, zero traversals', () => {
    const { history, sheet } = harness();
    const s = sheet();
    s.open();
    s.close(); // parked for the microtask flush
    s.open(); // reopen BEFORE the flush — the close is cancelled outright
    history.flush();
    expect(history.popCount).toBe(0);
    expect(history.position).toBe(1);
    expect(history.stack).toHaveLength(2);
    expect(typeof history.currentMarker()).toBe('string');
    expect(s.closes()).toBe(0);
    s.close();
    history.flush();
    expect(history.position).toBe(0);
    expect(history.stack).toHaveLength(2);
  });

  it('reopen during an IN-FLIGHT consumption re-pushes on landing — one live entry, none accumulated', () => {
    const { history, sheet } = harness();
    const s = sheet();
    s.open();
    s.close();
    history.drainMicrotasks(); // back() now in flight
    s.open(); // reopen before the traversal lands
    history.flush();
    expect(history.position).toBe(1);
    expect(history.stack).toHaveLength(2);
    expect(typeof history.currentMarker()).toBe('string');
    expect(s.closes()).toBe(0);
    s.close();
    history.flush();
    expect(history.position).toBe(0);
    expect(history.stack).toHaveLength(2);
  });

  it('same-task close→open handoff TRANSFERS the entry via replaceState — zero traversals (round 18: + sheet child pickers)', () => {
    const { history, sheet } = harness();
    const plus = sheet();
    const model = sheet();
    plus.open();
    history.flush();
    const popsBefore = history.popCount;
    plus.close();
    model.open(); // same task — inside the parked-close transfer window
    history.flush();
    expect(history.popCount).toBe(popsBefore); // history never traversed
    expect(history.replaceCount).toBe(1);
    expect(history.position).toBe(1);
    expect(model.instance.entryId).not.toBeNull();
    expect(history.currentMarker()).toBe(model.instance.entryId);
    expect(plus.instance.entryId).toBeNull();
    // OS back closes the NEW sheet exactly once and lands on the page entry.
    history.userBack();
    history.flush();
    expect(model.closes()).toBe(1);
    expect(plus.closes()).toBe(0);
    expect(history.position).toBe(0);
  });

  it('open during an in-flight consumption defers its entry and survives the landing sweep (cross-task handoff)', () => {
    const { history, sheet } = harness();
    const plus = sheet();
    const child = sheet();
    plus.open();
    history.flush();
    plus.close();
    history.drainMicrotasks(); // back() now in flight
    child.open(); // the round-18 failure mode: this push must NOT interleave with the traversal
    history.flush();
    expect(child.closes()).toBe(0); // not swept closed by the landing
    expect(child.instance.entryId).not.toBeNull();
    expect(history.currentMarker()).toBe(child.instance.entryId);
    expect(history.position).toBe(1);
    history.userBack();
    history.flush();
    expect(child.closes()).toBe(1);
    expect(history.position).toBe(0);
  });

  it('unmount while open consumes the entry without firing onClose', () => {
    const { history, sheet } = harness();
    const s = sheet();
    s.open();
    s.close(); // the hook's cleanup path — unmount and open→false are the same seam
    history.flush();
    expect(history.position).toBe(0);
    expect(s.closes()).toBe(0);
  });

  it('a navigation in the parked-close window buries the marker — disowned with zero traversals, collected later', () => {
    const { history, sheet } = harness();
    const s = sheet();
    s.open();
    s.close(); // parked...
    history.pushState(routerEntry(2)); // ...and a router push lands before the flush (close-then-navigate)
    history.flush();
    // The flush finds the marker buried and disowns it — the navigation stands untraversed.
    expect(history.position).toBe(2);
    expect((history.getState() as Record<string, unknown>).key).toBe('k2');
    expect(history.popCount).toBe(0);
    expect(s.closes()).toBe(0);
    // Later back from the navigation: the buried marker is unowned → auto-consumed through
    // to the real page entry.
    history.userBack();
    history.flush();
    expect(history.position).toBe(0);
    expect(s.closes()).toBe(0);
  });

  it('a navigation in the sub-frame window between back() and its landing is stranded forward (call-time traversal — known, accepted)', () => {
    const { history, sheet } = harness();
    const s = sheet();
    s.open();
    s.close();
    history.drainMicrotasks(); // back() in flight — the traversal target is already fixed
    history.pushState(routerEntry(2)); // navigation races into the sub-frame window
    history.flush();
    // Call-time semantics land the traversal at the page entry; the navigation entry is
    // stranded in the forward branch. Unrecoverable at this layer; documented trade-off.
    expect(history.position).toBe(0);
    expect(s.closes()).toBe(0);
    expect((history.stack[2] as Record<string, unknown>).key).toBe('k2');
  });

  it('nested sheets close top-down, one per back', () => {
    const { history, sheet } = harness();
    const s1 = sheet();
    const s2 = sheet();
    s1.open();
    s2.open();
    expect(history.stack).toHaveLength(3);
    history.userBack();
    history.flush();
    expect(s2.closes()).toBe(1);
    expect(s1.closes()).toBe(0);
    s2.close(); // host reaction — no-op
    history.userBack();
    history.flush();
    expect(s1.closes()).toBe(1);
    expect(history.position).toBe(0);
  });

  it('one go(-n) past several sheets closes each exactly once', () => {
    const { history, sheet } = harness();
    const s1 = sheet();
    const s2 = sheet();
    s1.open();
    s2.open();
    history.userGo(-2);
    history.flush();
    expect(s1.closes()).toBe(1);
    expect(s2.closes()).toBe(1);
    expect(history.position).toBe(0);
  });

  it('closing a sheet buried under a navigation disowns it silently — zero traversals, no route bounce', () => {
    const { history, sheet } = harness();
    const s = sheet();
    s.open();
    // Host closes the sheet and navigates in the same tick: the navigation's pushState lands
    // before the close effect runs (React defers effects past the handler).
    history.pushState(routerEntry(2));
    s.close();
    history.flush();
    expect(history.position).toBe(2); // the user's navigation stands
    expect(history.popCount).toBe(0); // and history was never traversed — no transient bounce
    // The buried marker is collected whenever it is landed on.
    history.userBack();
    history.flush();
    expect(history.position).toBe(0);
    expect(s.closes()).toBe(0);
  });

  it('FORWARD past a buried marker lands on the navigation beyond it (founder R10 2026-09-18: home → settings sheet → Broadcasts → back → forward must return to Broadcasts)', () => {
    const { history, sheet } = harness();
    const s = sheet();
    s.open(); // [home, sheet]
    // The settings sheet's Broadcasts row: close + navigate in one handler — the push lands first.
    history.pushState(routerEntry(2)); // [home, sheet(buried), broadcasts]
    s.close();
    history.flush();
    expect(history.position).toBe(2);
    // The OS back gesture: the buried marker is collected through to home.
    history.userBack();
    history.flush();
    expect(history.position).toBe(0);
    // The OS forward gesture lands on the same buried marker — the traversal continues FORWARD onto
    // Broadcasts, never bounced back onto home (pre-fix: position 0, the founder's dead forward swipe).
    history.userGo(1);
    history.flush();
    expect(history.position).toBe(2);
    expect((history.getState() as Record<string, unknown>).key).toBe('k2');
    // And back from there is home again — the marker is a pass-through in both directions.
    history.userBack();
    history.flush();
    expect(history.position).toBe(0);
    expect(s.closes()).toBe(0);
  });

  it('a forward landing on a buried marker with NOTHING beyond it still bounces back (the top of the stack is never a ghost park)', () => {
    const { history, sheet } = harness();
    const s = sheet();
    s.open(); // [home, sheet]
    history.userBack(); // the user pops the sheet
    history.flush();
    expect(s.closes()).toBe(1);
    s.close();
    history.userGo(1); // forward onto the dead marker — the last entry
    history.flush();
    expect(history.position).toBe(0);
  });

  it('without the UA position (no Navigation API) a ghost landing takes the back road in every direction — the named case', () => {
    const { history, sheet } = harness();
    history.traversal = () => null;
    const s = sheet();
    s.open();
    history.pushState(routerEntry(2));
    s.close();
    history.flush();
    history.userBack();
    history.flush();
    expect(history.position).toBe(0);
    history.userGo(1);
    history.flush();
    expect(history.position).toBe(0); // bounced — the pre-2026-09 rule, the safe side
  });

  it('closing both stacked sheets in one task consumes each sequentially down to the page entry', () => {
    const { history, sheet } = harness();
    const s1 = sheet();
    const s2 = sheet();
    s1.open();
    s2.open();
    s2.close(); // both park; the flush consumes one at a time,
    s1.close(); // the second resuming after the first lands
    history.flush();
    expect(history.position).toBe(0);
    expect(s1.closes()).toBe(0);
    expect(s2.closes()).toBe(0);
  });

  it('tolerates a null base state (no router bookkeeping yet)', () => {
    const { history, sheet } = harness(null);
    const s = sheet();
    s.open();
    const entry = history.getState() as Record<string, unknown>;
    expect(entry.idx).toBe(1);
    expect(typeof entry[SHEET_HISTORY_STATE_KEY]).toBe('string');
    history.userBack();
    history.flush();
    expect(s.closes()).toBe(1);
  });
  it('a sheet whose onClose THROWS on the user back never skips the sweep of the sheets beneath it (bookkeeping completes, every closer is told, the error still surfaces)', () => {
    // The founder's hang (2026-09-13): the row-menu sheet's close handler threw inside the
    // coordinator's popstate sweep, and the sweep ABORTED at the throw — the remaining sheets kept
    // entries the stack no longer held, and the ghost rule / deferred opens / parked closes after
    // the loop never ran. The consumer's bug must surface (rethrown), but the coordinator's own
    // state is settled first and every popped-past sheet is still told to close.
    const { history, sheet } = harness();
    const thrower = sheet({ throws: 'consumer close handler threw' });
    const beneath = sheet();
    thrower.open(); // registered first → swept first
    beneath.open();
    history.userGo(-2);
    expect(() => history.flush()).toThrow('consumer close handler threw');
    expect(thrower.closes()).toBe(1);
    expect(beneath.closes()).toBe(1); // pre-fix: 0 — the loop died at the throw
    expect(thrower.instance.entryId).toBeNull();
    expect(beneath.instance.entryId).toBeNull();
    expect(history.position).toBe(0);
  });

  it('THE STACK DISCIPLINE: closing the top of three stacked sheets leaves both beneath open — a landing closes only the sheets ABOVE the entry landed on', () => {
    // A rail drawer + a row's menu sheet + the menu's child sheet; the table stage + a header menu +
    // its submenu (the phone presents a submenu as another sheet over its parent). Pre-fix the sweep
    // closed every sheet whose entry was not the CURRENT one: closing the top landed on the middle
    // and closed the BOTTOM — the drawer/stage collapsed under a still-open sheet.
    const { history, sheet } = harness();
    const bottom = sheet();
    const middle = sheet();
    const top = sheet();
    bottom.open();
    middle.open();
    top.open();
    expect(history.position).toBe(3);
    top.close();
    history.flush();
    expect(history.position).toBe(2);
    expect(bottom.closes()).toBe(0); // pre-fix: 1
    expect(middle.closes()).toBe(0);
    expect(bottom.instance.entryId).not.toBeNull();
    expect(middle.instance.entryId).not.toBeNull();
    // A user back now closes exactly the middle; the bottom stays with its entry.
    history.userBack();
    history.flush();
    expect(middle.closes()).toBe(1);
    expect(bottom.closes()).toBe(0);
    expect(history.position).toBe(1);
    expect(history.currentMarker()).toBe(bottom.instance.entryId);
  });

  it("a close→open handoff keeps the transferred entry at the donor's place in the stack", () => {
    const { history, sheet } = harness();
    const bottom = sheet();
    const donor = sheet();
    bottom.open();
    donor.open();
    donor.close();
    const taker = sheet();
    taker.open(); // same task: takes the donor's entry over (replaceState)
    history.flush();
    expect(history.position).toBe(2);
    // Closing the taker lands on the bottom's entry: the bottom is beneath, and stays.
    taker.close();
    history.flush();
    expect(history.position).toBe(1);
    expect(bottom.closes()).toBe(0);
    expect(bottom.instance.entryId).not.toBeNull();
  });

  it('a ghost landing ABOVE a live sheet closes nothing — the bounce judges the sheets beneath on its own landing', () => {
    const { history, sheet } = harness();
    const beneath = sheet();
    const dead = sheet();
    beneath.open();
    dead.open();
    // The top sheet is closed by the user (its entry dies), then the user goes FORWARD onto it.
    history.userBack();
    history.flush();
    expect(dead.closes()).toBe(1);
    dead.close();
    history.userGo(1);
    history.flush();
    expect(history.position).toBe(1); // bounced back off the ghost onto the live entry beneath
    expect(beneath.closes()).toBe(0); // pre-fix: the sweep closed it at the ghost landing
    expect(beneath.instance.entryId).not.toBeNull();
    expect(history.currentMarker()).toBe(beneath.instance.entryId);
  });

  it('the popped sheet is told to close with the popstate event that popped it', () => {
    const { history, coordinator } = harness();
    const seen: Event[] = [];
    const instance: SheetHistoryInstance = {
      open: true,
      entryId: null,
      consuming: false,
      onClose: (...args: unknown[]) => {
        seen.push(args[0] as Event);
      },
    };
    coordinator.register(instance);
    coordinator.opened(instance);
    history.userBack();
    history.flush();
    expect(seen).toHaveLength(1);
    expect(seen[0]).toBeInstanceOf(Event);
    expect(seen[0].type).toBe('popstate');
  });
});
