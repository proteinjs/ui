import { useEffect, useRef } from 'react';

/**
 * history.state key marking a sheet's history entry. The value is the entry id a live sheet
 * instance owns; the coordinator recognizes (and consumes) marker entries by this key.
 */
export const SHEET_HISTORY_STATE_KEY = 'sheetHistoryEntry';

export interface SheetHistoryOptions {
  /** Whether the sheet is presented. The open→true edge claims a history entry; the
   *  open→false edge (and unmount) consumes it. */
  open: boolean;
  /**
   * Called when the user pops our entry (OS back gesture / back button), with the popstate
   * event that popped it. Shells route this through their NORMAL close path (requestClose /
   * the host's onClose), so back plays the same exit animation as any other close — never an
   * instant unmount.
   */
  onClose: (event: Event) => void;
  /** Gate — shells pass `useFormFactor().isPhone`. When false the hook touches nothing
   *  (no listener, no entries): desktop dialogs keep pure-modal semantics. */
  enabled: boolean;
}

/**
 * OS-back closes the sheet, not the page under it (the phone's native contract) — by making every
 * phone sheet a history entry. ONE shared hook, hosted here (the lowest UI layer, beside
 * `useFormFactor`) so framework surfaces — the form's long-value viewer — join the same page-wide
 * history stack as the consumer kits' sheet shells, which wire it inside themselves and re-export
 * it rather than re-implementing it; consumers inherit it with no per-consumer wiring.
 *
 * open→true pushes ONE same-URL entry via raw history.pushState; a popstate while our entry
 * is live means the user pressed back → onClose(); a programmatic close (open→false /
 * unmount) consumes the entry with history.back(), and the resulting popstate is swallowed
 * so onClose never double-fires.
 *
 * WHY raw pushState, not react-router navigate() — verified against @remix-run/router 6.16
 * (proteinjs Router inlines BrowserRouter over createBrowserHistory):
 * - createBrowserHistory observes ONLY popstate; push/replace/go are the mutations it sees.
 *   A raw pushState therefore causes zero router dispatch at open time.
 * - `history.location` is a live getter: window.location (pathname/search/hash) +
 *   history.state.usr (state) + history.state.key. Our entry keeps the SAME URL and SPREADS
 *   the router's state (usr/key preserved), so when the consuming popstate does dispatch
 *   (action POP), the recomputed location is field-identical to the current one — `Routes`
 *   re-matches the same route by URL, and the rendered route provably cannot change. The
 *   view-transition policy sees identical surface keys → null → no animation.
 * - The router stores its stack index at history.state.idx and computes its next push as
 *   getIndex()+1 off the CURRENT entry — so we carry idx forward incremented, keeping the
 *   router's arithmetic (and useAppBack's `idx > 0` in-app-history test) exact even with
 *   sheet entries interleaved in the stack.
 * - navigate(location, {state}) instead would dispatch a full router state update on OPEN as
 *   well as close (v5Compat notifies on PUSH), mint a NEW location.key per commit (useNavigate
 *   resolves a To, which carries no key — key-consumers would misfire), and REPLACE-based
 *   consumption cannot shorten the stack (back would need two presses — breaking the native
 *   contract outright). Raw pushState with router-state-preserving spread is the provably
 *   inert choice.
 *
 * TRAVERSAL SEMANTICS (the load-bearing browser fact, observed live on Chrome — round 18):
 * a queued history.back() resolves against the position CURRENT AT THE CALL, not at the time
 * the traversal task executes. A pushState issued between the back() call and its landing
 * does NOT shift where the back lands — the landing pops PAST the fresh entry, stranding it.
 * This is why a close may never share a task with a sibling open's push (the round-18 bug: a
 * menu sheet's close queued back(); a picker sheet pushed synchronously; the landing left the
 * picker sheet's entry non-current and the sweep closed it instantly).
 *
 * RACES (the known risk class) and how each is prevented — all coordination lives in ONE
 * page-wide coordinator (single popstate listener, shared entry-ownership registry):
 * - Close→open HANDOFF (one sheet closes, another opens, same task — a menu sheet's child
 *   pickers): consumption is deferred to a microtask; an open arriving before the flush
 *   TRANSFERS the closer's live entry to the opener via replaceState (marker swap, same
 *   idx/usr/key) — zero traversals, zero popstates, no race window at all.
 * - Open during an in-flight consumption (cross-task handoff — a child sheet awaiting its
 *   row list, rapid reopen): the push DEFERS; when the traversal lands, entries are pushed
 *   for the still-open instances on the settled stack. Deferred instances hold no entry, so
 *   the landing sweep cannot touch them.
 * - Double-close: on the user's back, the instance's entry id is cleared BEFORE onClose fires;
 *   the host's open→false then finds no live entry and consumes nothing. On a programmatic
 *   close, the flush checks the marker is actually the CURRENT entry before back(), and the
 *   resulting popstate resolves against the pending consumption instead of firing onClose.
 * - Forward-button ghost reopen: sheet visibility is component state, never derived from
 *   history, so forward cannot reopen anything by construction; additionally, landing on a
 *   marker entry no live instance owns (a GHOST) continues the traversal past it — forward
 *   onto the entry beyond it when one exists, back onto the page beneath otherwise — so a
 *   traversal never parks on a ghost duplicate of the page (`traversePast`).
 * - Close-then-navigate (host closes the sheet and pushes a route in the same tick): the
 *   navigation's pushState lands before the close flush runs, the marker is no longer the
 *   current entry, and we DISOWN it instead of back()ing over the user's navigation; the
 *   buried marker is passed through whenever it is landed on — back from the navigation
 *   lands on the page beneath, forward from that page lands on the navigation again (the rule
 *   since 2026-09-18, a phone browser's menu sheet → the page its row opens: the forward swipe
 *   used to bounce BACK off the buried marker onto the page beneath). A navigation
 *   racing into the sub-frame window BETWEEN the flushed back() and its landing is stranded
 *   forward by call-time traversal semantics (see above) — unrecoverable at this layer,
 *   microtask-narrow, known, accepted. The hijack branch in handlePop covers engines that
 *   resolve traversals at execution time instead (landing on our own marker → the pushed
 *   navigation was consumed → forward() restores it).
 * - Simultaneous user-back + programmatic close (same frame): two queued traversals pop two
 *   entries. Untangling would require cancelling a queued traversal, which the history API
 *   cannot do; the window is one frame on conflicting user input. Known, accepted.
 */
export function useSheetHistory({ open, onClose, enabled }: SheetHistoryOptions): void {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const instanceRef = useRef<SheetHistoryInstance | null>(null);
  const active = open && enabled;
  useEffect(() => {
    if (!active) {
      return;
    }
    if (!instanceRef.current) {
      instanceRef.current = {
        open: false,
        entryId: null,
        consuming: false,
        onClose: (event) => closeRef.current(event),
      };
    }
    // The instance object persists across open cycles: a consumption still in flight from the
    // previous cycle is what tells the coordinator to DEFER this cycle's push (rapid reopen).
    const instance = instanceRef.current;
    const coordinator = browserCoordinator();
    instance.open = true;
    coordinator.register(instance);
    coordinator.opened(instance);
    return () => {
      instance.open = false;
      coordinator.unregister(instance);
    };
  }, [active]);
}

/**
 * Minimal history surface the coordinator drives — injected so the machinery is testable in
 * node against a fake (traversals queue asynchronously there, mirroring real browsers).
 */
export interface SheetHistoryEnv {
  getState(): unknown;
  /** Same-URL push (history.pushState(state, '')). */
  pushState(state: Record<string, unknown>): void;
  /** Same-URL replace (history.replaceState(state, '')) — the handoff transfer channel. */
  replaceState(state: Record<string, unknown>): void;
  back(): void;
  forward(): void;
  /** Microtask scheduling seam (queueMicrotask in the browser; synchronous-controllable in tests). */
  defer(task: () => void): void;
  /**
   * The UA's own session-history position — the Navigation API's `currentEntry.index` over
   * `entries().length` (the contiguous same-origin run this document sits in; updated before
   * popstate fires), or null where the UA has no Navigation API. The coordinator reads a ghost
   * landing's DIRECTION and BOUNDS from it (`traversePast`); the router's `idx` cannot answer
   * either — it counts this document's entries only and says nothing about what lies beyond.
   */
  traversal(): { index: number; length: number } | null;
}

/** One mounted useSheetHistory call. Fields are owned by the coordinator. */
export interface SheetHistoryInstance {
  /** Latest open&&enabled — read when a deferred push resolves. */
  open: boolean;
  /** Id of the history entry this instance owns, when one is live. */
  entryId: string | null;
  /** True while this instance's programmatic back() traversal is in flight. */
  consuming: boolean;
  /** The user popped this instance's entry — told with the popstate event. */
  onClose: (event: Event) => void;
}

/**
 * Page-wide coordinator: ONE popstate listener and one ownership registry for every sheet
 * instance. Centralizing (instead of per-instance listeners) is what makes the hard cases
 * fall out: nested sheets close top-down, a consumption initiated by a shell that unmounts
 * mid-traversal (hosts that unmount their shell on close) still resolves, and orphaned marker
 * entries are recognized against the full ownership set.
 */
export class SheetHistoryCoordinator {
  private readonly instances = new Set<SheetHistoryInstance>();
  /** At most one programmatic consumption is ever in flight (the flush only initiates when
   *  the closing instance's marker is the CURRENT entry, and it can't be twice). */
  private consumingInstance: SheetHistoryInstance | null = null;
  /** Closes parked until the microtask flush — the transfer window: an open arriving in the
   *  same task takes over the closer's entry instead of a back()+push traversal pair. */
  private pendingCloses: SheetHistoryInstance[] = [];
  private flushScheduled = false;
  /** Opens deferred while a consumption traversal is in flight; pushed on landing. */
  private pendingOpens: SheetHistoryInstance[] = [];
  /** THE STACK DISCIPLINE: the push order of every live entry id (a transfer inherits the
   *  donor's place). A landing closes exactly the sheets ABOVE the entry landed on — never one
   *  beneath it. Before this, the sweep closed every sheet whose entry was not the CURRENT
   *  one, so with three sheets up (a rail drawer, a row's menu sheet, the menu's child sheet;
   *  the table stage, a header menu, its submenu) closing the top landed on the middle and
   *  closed the BOTTOM — the stage or drawer collapsed under a still-open sheet, and its
   *  unmount then consumed the rest. Two-deep stacks never showed it (nothing is beneath the
   *  entry landed on), which is why every earlier round passed. */
  private readonly order = new Map<string, number>();
  private nextSeq = 0;
  /** The UA position last observed here (every landing, every own push, every close flush) —
   *  a ghost landing's direction is its position against this. Null until the UA reports one. */
  private lastIndex: number | null;

  constructor(private readonly env: SheetHistoryEnv) {
    this.lastIndex = this.env.traversal()?.index ?? null;
  }

  register(instance: SheetHistoryInstance): void {
    this.instances.add(instance);
  }

  /** Unmount/disable path: consume (or disown) the entry, then drop the instance. The
   *  pending-close/consuming references keep the entry's consumption alive past removal. */
  unregister(instance: SheetHistoryInstance): void {
    this.closed(instance);
    this.instances.delete(instance);
    this.pendingOpens = this.pendingOpens.filter((i) => i !== instance);
  }

  /** open→true: claim a history entry. Idempotent — a live entry (or one whose consumption
   *  is still in flight, which defers to handlePop) never stacks another. */
  opened(instance: SheetHistoryInstance): void {
    // Reopen while its own close is still parked: cancel the close — the live entry simply
    // stays claimed, zero traversals.
    const parkedSelf = this.pendingCloses.indexOf(instance);
    if (parkedSelf !== -1 && instance.entryId !== null) {
      this.pendingCloses.splice(parkedSelf, 1);
    }
    if (instance.entryId !== null || instance.consuming) {
      return;
    }
    // Handoff transfer: a sibling close is parked in this task and its entry is the current
    // one — take the entry over (marker swap in place). No traversal is queued, so there is
    // no window for the round-18 race to exist in.
    const donorIndex = this.pendingCloses.findIndex((c) => c.entryId !== null && c.entryId === this.currentMarker());
    if (donorIndex !== -1) {
      const donor = this.pendingCloses[donorIndex];
      this.pendingCloses.splice(donorIndex, 1);
      const state = this.env.getState();
      const base = state && typeof state === 'object' ? (state as Record<string, unknown>) : {};
      const id = this.mintId();
      this.env.replaceState({ ...base, [SHEET_HISTORY_STATE_KEY]: id });
      this.order.set(id, this.order.get(donor.entryId!)!);
      this.disown(donor);
      instance.entryId = id;
      this.observePosition();
      return;
    }
    if (this.consumingInstance !== null) {
      this.pendingOpens.push(instance);
      return;
    }
    this.pushEntry(instance);
  }

  /** open→false: park the close for the microtask flush (the transfer window). The flush
   *  consumes the entry if it is still current, else disowns it (buried under a navigation
   *  — the ghost rule in handlePop consumes it whenever it is landed on). */
  closed(instance: SheetHistoryInstance): void {
    if (instance.consuming || instance.entryId === null || this.pendingCloses.includes(instance)) {
      return;
    }
    this.pendingCloses.push(instance);
    if (!this.flushScheduled) {
      this.flushScheduled = true;
      this.env.defer(() => {
        this.flushScheduled = false;
        this.flushCloses();
      });
    }
  }

  /** The one popstate handler. Bound so `window.addEventListener('popstate', handlePop)`
   *  and the test fakes can take it directly.
   *
   *  ORDER OF BUSINESS (the hang of 2026-09-13 — a row-menu sheet's close handler threw
   *  inside this sweep and the sweep died mid-loop: the sheets beneath kept entries the stack
   *  no longer held, the ghost rule never ran, deferred opens never pushed, parked closes never
   *  resumed): the coordinator's OWN bookkeeping — disowning every popped-past entry, the ghost
   *  rule, the deferred pushes, the parked closes — settles FIRST; the consumers are told LAST,
   *  every one of them, and the first consumer error surfaces only after all are told (the
   *  listener-dispatch convention). A consumer's bug can then never leave the stack half-swept. */
  handlePop = (event: Event): void => {
    let marker = this.currentMarker();
    const consuming = this.consumingInstance;
    if (consuming) {
      this.consumingInstance = null;
      consuming.consuming = false;
      if (marker !== null && marker === consuming.entryId) {
        // Execution-time-resolving engines only (see the hook doc): something was pushed on
        // top after our back() was queued, and the traversal consumed THAT entry instead of
        // ours. Restore the user's navigation and disown our now-buried marker (the ghost
        // rule collects it later).
        this.disown(consuming);
        this.observePosition();
        this.env.forward();
        return;
      }
      // Consumption landed: swallow (no onClose — the sheet already closed programmatically).
      this.disown(consuming);
      if (consuming.open) {
        // Reopened while the consumption was in flight — push the deferred entry now, and
        // re-read the marker so the sweep below sees the fresh entry as current.
        this.pushEntry(consuming);
        marker = this.currentMarker();
      }
    }
    // Ghost rule: landing on a marker entry no live instance owns (forward onto a dismissed
    // sheet's entry, or a marker orphaned under a navigation) passes it through — the stack
    // never parks on a duplicate of the page beneath. Nothing closes here: the sheets still up
    // are beneath a dead entry, and the landing the traversal produces judges them on its own.
    const landed = marker === null ? -1 : this.order.get(marker);
    if (landed === undefined) {
      this.traversePast();
      return;
    }
    // Every sheet ABOVE the entry landed on was popped past (single back, or one go(-n) across
    // several sheets): disown each now, tell each once, below. Sheets beneath it stay. Deferred
    // opens hold no entry yet, so the sweep cannot touch them.
    const popped: SheetHistoryInstance[] = [];
    for (const instance of Array.from(this.instances)) {
      if (instance.entryId !== null && this.order.get(instance.entryId)! > landed) {
        this.disown(instance);
        popped.push(instance);
      }
    }
    // The stack is settled: push entries for opens that deferred behind the consumption,
    // then resume any closes that queued behind it.
    const deferred = this.pendingOpens;
    this.pendingOpens = [];
    for (const instance of deferred) {
      if (instance.open && instance.entryId === null && !instance.consuming) {
        this.pushEntry(instance);
      }
    }
    if (this.pendingCloses.length > 0) {
      this.flushCloses();
    }
    this.observePosition();
    this.notifyPopped(popped, event);
  };

  /**
   * THE GHOST RULE'S ROAD: a landing on a marker entry no live instance owns continues the
   * traversal in ITS OWN DIRECTION — back past a dead marker onto the page beneath; forward past
   * a marker buried under a navigation onto that navigation. The rule since 2026-09-18, on a
   * phone browser: open a page from a menu sheet, swipe back from the left edge, then swipe
   * forward from the right edge — forward returns to that page. The sheet's row closes the sheet
   * and pushes the page in one handler, so the sheet's marker stays buried beneath the page
   * ([home, marker, page]); the rule read every ghost landing as a back road, and the forward
   * swipe onto the marker was bounced BACK onto home. Direction = the UA's position against the
   * position last observed here (every landing, every own push, every close flush): a router push
   * in between can only raise the position above the last observation, never carry it across a
   * surviving ghost (a push beneath a ghost truncates the ghost), so the comparison is exact.
   * Forward only when an entry exists beyond the ghost — the top of the stack is never a ghost
   * park. Without the UA position (no Navigation API) the road is back in every direction: the
   * pre-2026-09 rule, the safe side, the named case.
   */
  private traversePast(): void {
    const position = this.env.traversal();
    const forward =
      position !== null &&
      this.lastIndex !== null &&
      position.index > this.lastIndex &&
      position.index < position.length - 1;
    this.observePosition();
    if (forward) {
      this.env.forward();
    } else {
      this.env.back();
    }
  }

  /** Every popped-past sheet is told, whatever any one of them does; a consumer's error
   *  surfaces after all are told — never by skipping a sibling. */
  private notifyPopped(popped: SheetHistoryInstance[], event: Event): void {
    let error: unknown;
    let threw = false;
    for (const instance of popped) {
      try {
        instance.onClose(event);
      } catch (thrown) {
        if (!threw) {
          threw = true;
          error = thrown;
        }
      }
    }
    if (threw) {
      throw error;
    }
  }

  /** Consume parked closes: at most one traversal in flight — the rest resume on landing. */
  private flushCloses(): void {
    this.observePosition();
    while (this.pendingCloses.length > 0) {
      if (this.consumingInstance !== null) {
        return;
      }
      const instance = this.pendingCloses.shift()!;
      if (instance.entryId === null) {
        continue;
      }
      if (this.currentMarker() === instance.entryId) {
        instance.consuming = true;
        this.consumingInstance = instance;
        this.env.back();
        return;
      }
      this.disown(instance);
    }
  }

  /** The one door out of the stack: the entry leaves the order with its instance. */
  private disown(instance: SheetHistoryInstance): void {
    if (instance.entryId !== null) {
      this.order.delete(instance.entryId);
      instance.entryId = null;
    }
  }

  private pushEntry(instance: SheetHistoryInstance): void {
    const state = this.env.getState();
    const base = state && typeof state === 'object' ? (state as Record<string, unknown>) : {};
    const idx = typeof base.idx === 'number' ? base.idx : 0;
    // Spread + idx+1 keeps the router's usr/key/idx bookkeeping exact — see the hook doc.
    const id = this.mintId();
    this.env.pushState({ ...base, idx: idx + 1, [SHEET_HISTORY_STATE_KEY]: id });
    this.order.set(id, this.nextSeq);
    this.nextSeq += 1;
    instance.entryId = id;
    this.observePosition();
  }

  /** The UA position, as of now — kept where a UA without the Navigation API reports none. */
  private observePosition(): void {
    const position = this.env.traversal();
    if (position !== null) {
      this.lastIndex = position.index;
    }
  }

  private mintId(): string {
    return Math.random().toString(36).slice(2, 10);
  }

  private currentMarker(): string | null {
    const state = this.env.getState();
    if (!state || typeof state !== 'object') {
      return null;
    }
    const marker = (state as Record<string, unknown>)[SHEET_HISTORY_STATE_KEY];
    return typeof marker === 'string' ? marker : null;
  }
}

/**
 * The page's coordinator, keyed on window (not a module local): workspace symlink drift can
 * bundle two copies of this package, and two coordinators would treat each other's live entries
 * as ghosts and consume them. The invariant is one coordinator per PAGE, so the page carries
 * it. Installed lazily on first active use — desktop (enabled: false everywhere) never
 * installs the listener.
 */
const COORDINATOR_KEY = '__sheetHistoryCoordinator';

/** The slice of `window.navigation` the env reads. */
interface NavigationLike {
  currentEntry: { index: number } | null;
  entries(): unknown[];
}

function browserCoordinator(): SheetHistoryCoordinator {
  const host = window as unknown as Record<string, unknown>;
  let coordinator = host[COORDINATOR_KEY] as SheetHistoryCoordinator | undefined;
  if (!coordinator) {
    coordinator = new SheetHistoryCoordinator({
      getState: () => window.history.state,
      pushState: (state) => window.history.pushState(state, ''),
      replaceState: (state) => window.history.replaceState(state, ''),
      back: () => window.history.back(),
      forward: () => window.history.forward(),
      defer: (task) => queueMicrotask(task),
      traversal: () => {
        // The Navigation API (Chromium 102+, Safari 26+; typed structurally — the DOM lib this
        // package compiles against predates it). A document outside any entry reports -1.
        const navigation = (window as unknown as { navigation?: NavigationLike }).navigation;
        const current = navigation?.currentEntry;
        if (!navigation || !current || current.index < 0) {
          return null;
        }
        return { index: current.index, length: navigation.entries().length };
      },
    });
    host[COORDINATOR_KEY] = coordinator;
    window.addEventListener('popstate', coordinator.handlePop);
  }
  return coordinator;
}
