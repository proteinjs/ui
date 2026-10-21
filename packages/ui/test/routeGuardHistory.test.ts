/**
 * @jest-environment jsdom
 *
 * The route guard decorator (RouteGuardHistory): one verdict function consulted at the ONE place every
 * navigation already passes — the router's history — on the initial location at construction and on
 * every update inside `listen`. A verdict REPLACES the un-admitted location in place, before the app
 * renders it: the refused location never stands in history and never reaches a listener. Absent a
 * verdict the dispatch is byte-identical to the undecorated history.
 *
 * The fixture is the view-transition harness's fakeHistory (viewTransitionHistory.test.ts) with a REAL
 * stack: push appends an entry, replace overwrites the current one with action REPLACE (the original's
 * replace was a no-op, which would hide the swallow-and-replace this suite pins), go moves the index.
 * The underlying history updates its own location BEFORE notifying, as @remix-run/router does.
 */
import type { History } from '@remix-run/router';
import { decorateHistoryWithRouteGuard, RouteGuard, RouteGuardNavigation } from '../src/router/RouteGuardHistory';
import {
  decorateHistoryWithViewTransitions,
  HistoryUpdate,
  RouteTransitionPolicy,
} from '../src/router/ViewTransitionHistory';

type Entry = { pathname: string; state: unknown; key: string };

/** A fake history with a real entry stack, so "never stands in history" is an outcome on the stack. */
function stackHistory(initialPath = '/') {
  let listener: ((update: HistoryUpdate) => void) | null = null;
  let keySeq = 0;
  const entries: Entry[] = [{ pathname: initialPath, state: null, key: 'init' }];
  let index = 0;
  let action: HistoryUpdate['action'] = 'POP' as HistoryUpdate['action'];
  const replaceCalls: Array<{ to: unknown; state: unknown }> = [];
  const locationOf = (entry: Entry): HistoryUpdate['location'] =>
    ({
      pathname: entry.pathname,
      search: '',
      hash: '',
      state: entry.state,
      key: entry.key,
    }) as HistoryUpdate['location'];
  const notify = (delta: number | null) => listener?.({ action, location: locationOf(entries[index]), delta });
  const history = {
    get action() {
      return action;
    },
    get location() {
      return locationOf(entries[index]);
    },
    createHref: (to: unknown) => `href:${String(to)}`,
    createURL: (to: unknown) => new URL(`http://localhost${String(to)}`),
    encodeLocation: (to: unknown) => to,
    push: (to: string, state?: unknown) => {
      action = 'PUSH' as HistoryUpdate['action'];
      entries.splice(index + 1);
      entries.push({ pathname: to, state: state ?? null, key: `k${++keySeq}` });
      index = entries.length - 1;
      notify(null);
    },
    replace: (to: string, state?: unknown) => {
      replaceCalls.push({ to, state });
      action = 'REPLACE' as HistoryUpdate['action'];
      entries[index] = { pathname: to, state: state ?? null, key: `k${++keySeq}` };
      notify(null);
    },
    go: (delta: number) => {
      action = 'POP' as HistoryUpdate['action'];
      index = Math.max(0, Math.min(entries.length - 1, index + delta));
      notify(delta);
    },
    listen: (l: (update: HistoryUpdate) => void) => {
      listener = l;
      return () => {
        listener = null;
      };
    },
  } as unknown as History;
  return { history, entries, replaceCalls, indexOf: () => index, hasListener: () => listener !== null };
}

const DEAD = '/dead';
const LANDING = '/landing';

/** Refuses DEAD and nothing else. */
const refuseDead: RouteGuard = (nav) => (nav.to.pathname === DEAD ? { replace: LANDING } : null);

const seenPaths = (updates: HistoryUpdate[]) => updates.map((u) => `${u.action} ${u.location.pathname}`);

describe('decorateHistoryWithRouteGuard — swallow and replace at the history', () => {
  it('a refused PUSH lands at the verdict with action REPLACE, the pushed URL nowhere in the stack, the listener never seeing it', () => {
    const fixture = stackHistory();
    const decorated = decorateHistoryWithRouteGuard(fixture.history, refuseDead);
    const updates: HistoryUpdate[] = [];
    decorated.listen((u) => updates.push(u));

    decorated.push('/space');
    decorated.push(DEAD);

    expect(seenPaths(updates)).toEqual(['PUSH /space', `REPLACE ${LANDING}`]);
    expect(decorated.location.pathname).toBe(LANDING);
    expect(decorated.action).toBe('REPLACE');
    expect(fixture.entries.map((e) => e.pathname)).toEqual(['/', '/space', LANDING]);
    // The net stack is one entry at the landing: Back returns to where the person was.
    decorated.go(-1);
    expect(decorated.location.pathname).toBe('/space');
  });

  it('a refused POP — a back gesture into a dead entry — is redirected in place exactly like a tap', () => {
    const fixture = stackHistory();
    // The dead entry stands in the stack from before the guard's time (admitted everything then).
    fixture.history.push(DEAD);
    fixture.history.push('/after');
    const decorated = decorateHistoryWithRouteGuard(fixture.history, refuseDead);
    const updates: HistoryUpdate[] = [];
    decorated.listen((u) => updates.push(u));

    decorated.go(-1);

    expect(seenPaths(updates)).toEqual([`REPLACE ${LANDING}`]);
    expect(fixture.entries.map((e) => e.pathname)).toEqual(['/', LANDING, '/after']);
    expect(fixture.indexOf()).toBe(1);
  });

  it('the initial location is consulted at construction (from null) and replaced before any listener is registered', () => {
    const fixture = stackHistory(DEAD);
    const consultations: RouteGuardNavigation[] = [];
    const guard: RouteGuard = (nav) => {
      consultations.push(nav);
      return nav.to.pathname === DEAD ? { replace: LANDING, state: { why: 'not here' } } : null;
    };

    const decorated = decorateHistoryWithRouteGuard(fixture.history, guard);

    // Replaced synchronously inside the decorate call, with nothing listening yet: the page the
    // phone cannot show never paints a frame.
    expect(fixture.hasListener()).toBe(false);
    expect(decorated.location.pathname).toBe(LANDING);
    expect(decorated.location.state).toEqual({ why: 'not here' });
    expect(decorated.action).toBe('REPLACE');
    expect(fixture.entries.map((e) => e.pathname)).toEqual([LANDING]);
    expect(consultations).toHaveLength(1);
    expect(consultations[0]).toMatchObject({ from: null, action: 'POP', delta: null });
    expect(consultations[0].to.pathname).toBe(DEAD);
    // A listener registered after the construction sees nothing of the initial pass.
    const updates: HistoryUpdate[] = [];
    decorated.listen((u) => updates.push(u));
    expect(updates).toEqual([]);
  });

  it('a guard that admits everything dispatches byte-identical updates to the undecorated history, and never replaces', () => {
    const script = (history: History) => {
      history.push('/space');
      history.push('/thought');
      history.go(-1);
      history.replace('/thought-renamed');
      history.go(1);
    };
    const plain = stackHistory();
    const plainUpdates: HistoryUpdate[] = [];
    plain.history.listen((u) => plainUpdates.push(u));
    script(plain.history);

    const guarded = stackHistory();
    const decorated = decorateHistoryWithRouteGuard(guarded.history, () => null);
    const guardedUpdates: HistoryUpdate[] = [];
    decorated.listen((u) => guardedUpdates.push(u));
    script(decorated);

    expect(guardedUpdates).toEqual(plainUpdates);
    expect(guarded.entries).toEqual(plain.entries);
    // The script's own replace is the only replace the underlying history saw.
    expect(guarded.replaceCalls).toHaveLength(1);
  });

  it("a redirect's landing is committed without a second consultation — a guard that would refuse its own landing still lands it", () => {
    const fixture = stackHistory();
    let consultations = 0;
    // Refuses EVERYTHING, the landing included: only the no-second-consultation contract makes this terminate.
    const refuseAll: RouteGuard = () => {
      consultations++;
      return { replace: LANDING };
    };
    const decorated = decorateHistoryWithRouteGuard(fixture.history, refuseAll);
    const initialConsultations = consultations; // the construction pass judged '/'
    const updates: HistoryUpdate[] = [];
    decorated.listen((u) => updates.push(u));

    decorated.push(DEAD);

    expect(consultations - initialConsultations).toBe(1);
    expect(seenPaths(updates)).toEqual([`REPLACE ${LANDING}`]);
    expect(fixture.replaceCalls.filter((call) => call.to === LANDING).length).toBe(initialConsultations + 1);
  });

  it('the verdict carries its state onto the landing entry, and the guard sees the departing location', () => {
    const fixture = stackHistory();
    const navs: Array<{ from: string | null; to: string; action: string; delta: number | null }> = [];
    const guard: RouteGuard = (nav) => {
      navs.push({ from: nav.from?.pathname ?? null, to: nav.to.pathname, action: nav.action, delta: nav.delta });
      return nav.to.pathname === DEAD ? { replace: LANDING, state: { surfaceKey: 'thought:x' } } : null;
    };
    const decorated = decorateHistoryWithRouteGuard(fixture.history, guard);
    const updates: HistoryUpdate[] = [];
    decorated.listen((u) => updates.push(u));

    decorated.push('/space');
    decorated.push(DEAD);
    decorated.go(-1);

    expect(updates[1].location.state).toEqual({ surfaceKey: 'thought:x' });
    expect(navs).toEqual([
      { from: null, to: '/', action: 'POP', delta: null },
      { from: '/', to: '/space', action: 'PUSH', delta: null },
      { from: '/space', to: DEAD, action: 'PUSH', delta: null },
      // The departing location of the next navigation is the LANDING, never the ghost.
      { from: LANDING, to: '/space', action: 'POP', delta: -1 },
    ]);
  });

  it('composed under the view-transition decorator, the policy sees only the replaced location, as a REPLACE', () => {
    const fixture = stackHistory();
    const guarded = decorateHistoryWithRouteGuard(fixture.history, refuseDead);
    const policyNavs: Array<{ from: string; to: string; action: string }> = [];
    const policy: RouteTransitionPolicy = (nav) => {
      policyNavs.push({ from: nav.from.pathname, to: nav.to.pathname, action: nav.action });
      return null;
    };
    (document as Document & { startViewTransition?: unknown }).startViewTransition = (cb: () => void) => {
      cb();
      return { finished: Promise.resolve() };
    };
    try {
      const composed = decorateHistoryWithViewTransitions(guarded, policy);
      const updates: HistoryUpdate[] = [];
      composed.listen((u) => updates.push(u));

      composed.push('/space');
      composed.push(DEAD);

      expect(policyNavs).toEqual([
        { from: '/', to: '/space', action: 'PUSH' },
        { from: '/space', to: LANDING, action: 'REPLACE' },
      ]);
      expect(seenPaths(updates)).toEqual(['PUSH /space', `REPLACE ${LANDING}`]);
    } finally {
      delete (document as Document & { startViewTransition?: unknown }).startViewTransition;
    }
  });

  it('every other member delegates untouched to the underlying history', () => {
    const fixture = stackHistory();
    const decorated = decorateHistoryWithRouteGuard(fixture.history, () => null);
    expect(decorated.createHref('/x' as never)).toBe('href:/x');
    expect(decorated.createURL('/y' as never).href).toBe('http://localhost/y');
    expect(decorated.encodeLocation('/z' as never)).toBe('/z');
    decorated.push('/a', { s: 1 });
    expect(fixture.entries[1]).toMatchObject({ pathname: '/a', state: { s: 1 } });
    decorated.replace('/b', { s: 2 });
    expect(fixture.entries[1]).toMatchObject({ pathname: '/b', state: { s: 2 } });
    decorated.go(-1);
    expect(decorated.location.pathname).toBe('/');
    expect(decorated.action).toBe('POP');
  });
});
