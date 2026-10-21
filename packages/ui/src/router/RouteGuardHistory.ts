import type { Action, History, Location, To } from '@remix-run/router';
import type { HistoryUpdate } from './ViewTransitionHistory';

/** Everything a guard can see about one navigation before it commits. */
export interface RouteGuardNavigation {
  /** The location the app is leaving; null on the initial location — a cold open or a full reload. */
  from: Location | null;
  /** The location the navigation would commit. */
  to: Location;
  /** History action ('PUSH' | 'POP' | 'REPLACE'). */
  action: Action;
  /** History stack index delta on POP (null when unknown / not a POP). */
  delta: number | null;
}

/**
 * null = commit as is. `{ replace }` = the entry this navigation produced is REPLACED in place with
 * `replace` (carrying `state`) before the app renders it: the un-admitted location never stands in
 * history and never reaches a listener. A verdict is synchronous by type — a navigation never waits
 * on one (a verdict that had to be fetched would hold the page for the fetch's whole series).
 */
export type RouteGuardVerdict = null | { replace: To; state?: unknown };

/** App-supplied guard: consulted for every navigation the router dispatches, the initial location included. */
export type RouteGuard = (navigation: RouteGuardNavigation) => RouteGuardVerdict;

/**
 * Decorates a history with a navigation guard at the ONE place every navigation already passes — the
 * router's history (the same choke point the view-transition decorator wraps, ViewTransitionHistory):
 * scattered navigate() pushes and replaces, browser back/forward popstates, a shell's deep links and
 * the boot location all dispatch through it, so one guard catches all of them with zero call-site
 * migration. The library knows nothing of why a location is refused; the guard is the app's policy.
 *
 * Two hook points. (1) The INITIAL location is never dispatched through `listen` (the router seeds
 * its state from `history.location`), so the guard is consulted at construction and a verdict is
 * applied with `history.replace` synchronously — no listener is registered yet, so the replace is
 * silent and the router's seed reads the replaced location: the refused page never paints a frame.
 * (2) Inside `listen`, the decorator tracks the departing location itself (the underlying history
 * updates its own location BEFORE notifying) and runs the guard on each update. Null → the update is
 * forwarded. A verdict → the update is SWALLOWED (the listener never sees it) and `history.replace`
 * is issued; the underlying history notifies again, synchronously, inside that call, with the
 * replaced location, and the decorator forwards THAT update without consulting the guard — the
 * forward happens within the replace call's own dispatch (a scoped re-entrancy mark, not a persistent
 * flag), which is what makes a loop impossible by contract: the guard chose the landing, so the
 * landing is never judged. PUSH, REPLACE and POP all pass here, so a back gesture into a refused entry
 * is redirected in place exactly like a tap: a refused PUSH is a pushState then a replaceState inside
 * one synchronous dispatch, the net stack one entry at the landing, and Back returns to where the
 * person was.
 *
 * Every other member delegates untouched (getters included — action/location are live properties on
 * the underlying history). A guard that admits everything leaves the dispatch byte-identical.
 */
export function decorateHistoryWithRouteGuard(history: History, guard: RouteGuard): History {
  // The departing location, tracked here (see the doc): read off `history.location` at dispatch time
  // it would already be the arriving one.
  let lastLocation = history.location;

  const initialVerdict = guard({ from: null, to: history.location, action: history.action, delta: null });
  if (initialVerdict) {
    history.replace(initialVerdict.replace, initialVerdict.state);
    lastLocation = history.location;
  }

  // The re-entrancy mark: true only for the span of the decorator's own `replace`, whose dispatch is
  // the landing — forwarded as is, never judged.
  let forwardingLanding = false;

  const dispatchThroughGuard = (listener: (update: HistoryUpdate) => void, update: HistoryUpdate): void => {
    if (forwardingLanding) {
      lastLocation = update.location;
      listener(update);
      return;
    }
    const verdict = guard({ from: lastLocation, to: update.location, action: update.action, delta: update.delta });
    if (!verdict) {
      lastLocation = update.location;
      listener(update);
      return;
    }
    // Swallowed: the refused location reaches no listener; the replace below lands in its place and
    // its own dispatch (re-entrant, synchronous) is the one the listener sees.
    forwardingLanding = true;
    try {
      history.replace(verdict.replace, verdict.state);
    } finally {
      forwardingLanding = false;
    }
  };

  return {
    get action() {
      return history.action;
    },
    get location() {
      return history.location;
    },
    createHref: (to) => history.createHref(to),
    createURL: (to) => history.createURL(to),
    encodeLocation: (to) => history.encodeLocation(to),
    push: (to, state) => history.push(to, state),
    replace: (to, state) => history.replace(to, state),
    go: (delta) => history.go(delta),
    listen: (listener) => history.listen((update) => dispatchThroughGuard(listener, update)),
  };
}
