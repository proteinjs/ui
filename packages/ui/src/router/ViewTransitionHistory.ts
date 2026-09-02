import type { Action, History, Location } from '@remix-run/router';
import { flushSync } from 'react-dom';

/**
 * Direction vocabulary for a route transition. 'push' | 'pop' mirror native navigation
 * semantics (directional root motion); 'morph' is a shared-element morph between two surfaces
 * with NO directional root motion — the app's policy names it for commits where a named
 * element on the departing page becomes a named element on the arriving one (the desktop
 * home → draft-chat convergence). The router treats every verdict identically: run the commit
 * inside a view transition and stamp the verdict for the theme to scope its rules on.
 */
export type RouteTransitionDirection = 'push' | 'pop' | 'morph';

/** The history notification shape (@remix-run/router's Update — not exported from its root). */
export interface HistoryUpdate {
  action: Action;
  location: Location;
  delta: number | null;
}

/** Everything a policy can see about one navigation before it commits. */
export interface RouteTransitionNavigation {
  /** Location the app is leaving. */
  from: Location;
  /** Location the app is entering. */
  to: Location;
  /** History action ('PUSH' | 'POP' | 'REPLACE'). */
  action: Action;
  /** History stack index delta on POP (null when unknown / not a POP). */
  delta: number | null;
  /** The triggering popstate carried hasUAVisualTransition — the browser already animated
   *  this navigation itself (iOS edge-swipe back); animating again would double-play. */
  uaVisualTransition: boolean;
}

/**
 * App-supplied policy: return a direction to run this route commit inside a view
 * transition, or null for today's instant swap. The policy is consulted ONLY when
 * document.startViewTransition exists — returning a direction is always safe.
 */
export type RouteTransitionPolicy = (navigation: RouteTransitionNavigation) => RouteTransitionDirection | null;

type DocumentWithViewTransition = Document & {
  startViewTransition?: (updateCallback: () => void) => ViewTransitionLike;
};

/** Structural subset of the DOM ViewTransition (lib.dom may predate the API). */
export interface ViewTransitionLike {
  finished: Promise<unknown>;
  skipTransition?: () => void;
}

/** The stamp CSS keys off: html[data-route-transition='push'|'pop'|'morph'] scopes the
 *  ::view-transition-old/new(root) animations to router-driven transitions only. */
export const ROUTE_TRANSITION_DATA_ATTR = 'routeTransition';

let activeViewTransition: ViewTransitionLike | null = null;

/** The in-flight router view transition, if any — T1 sequencing reads this (e.g. defer a
 *  composer autofocus until `finished` so the keyboard rises after the morph lands). */
export function getActiveViewTransition(): ViewTransitionLike | null {
  return activeViewTransition;
}

/**
 * Decorates a history's `listen` so route commits can ride the View Transitions API
 * (MOBILE_POLISH T2). This is THE choke point: every navigation in an app — scattered
 * navigate() pushes/replaces AND browser back/forward popstates — dispatches through the
 * router's single history listener, so wrapping the dispatch here catches all of them with
 * zero call-site migration.
 *
 * The listener runs inside `document.startViewTransition(() => flushSync(...))` when the
 * policy returns a direction: flushSync commits the new page synchronously inside the
 * update callback, so the 'new' snapshot is the final layout (anything less is the
 * wrong-then-right transient class). When the policy returns null, or the API is absent,
 * the dispatch is byte-identical to an undecorated history.
 *
 * Every other history member delegates untouched (getters included — action/location are
 * live properties on the underlying history).
 */
export function decorateHistoryWithViewTransitions(history: History, policy: RouteTransitionPolicy): History {
  // hasUAVisualTransition rides the popstate event, which fires BEFORE the history
  // listener dispatch — capture it here for the imminent notification.
  let uaVisualTransition = false;
  window.addEventListener(
    'popstate',
    (e: PopStateEvent & { hasUAVisualTransition?: boolean }) => {
      uaVisualTransition = e.hasUAVisualTransition === true;
    },
    true
  );

  // The underlying history updates its own location BEFORE notifying listeners, so the
  // departing location is tracked here, not read off `history.location` at dispatch time.
  let lastLocation = history.location;
  const dispatchThroughViewTransition = (listener: (update: HistoryUpdate) => void, update: HistoryUpdate): void => {
    const doc = document as DocumentWithViewTransition;
    const from = lastLocation;
    lastLocation = update.location;
    const direction = doc.startViewTransition
      ? policy({
          from,
          to: update.location,
          action: update.action,
          delta: update.delta,
          uaVisualTransition,
        })
      : null;
    uaVisualTransition = false;
    if (!direction || !doc.startViewTransition) {
      listener(update);
      return;
    }
    document.documentElement.dataset[ROUTE_TRANSITION_DATA_ATTR] = direction;
    const viewTransition = doc.startViewTransition(() => {
      flushSync(() => listener(update));
    });
    activeViewTransition = viewTransition;
    void viewTransition.finished.finally(() => {
      if (activeViewTransition === viewTransition) {
        activeViewTransition = null;
      }
      delete document.documentElement.dataset[ROUTE_TRANSITION_DATA_ATTR];
    });
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
    listen: (listener) => history.listen((update) => dispatchThroughViewTransition(listener, update)),
  };
}
