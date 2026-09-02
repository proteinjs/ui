/**
 * @jest-environment jsdom
 */
import type { History } from '@remix-run/router';
import {
  decorateHistoryWithViewTransitions,
  getActiveViewTransition,
  HistoryUpdate,
  RouteTransitionPolicy,
} from '../src/router/ViewTransitionHistory';

type StartViewTransition = (cb: () => void) => { finished: Promise<unknown> };

/** Minimal fake history: listen registers ONE listener; push/pop drive it like the real
 *  @remix-run/router (location updates BEFORE the notification). */
function fakeHistory() {
  let listener: ((update: HistoryUpdate) => void) | null = null;
  const state = {
    action: 'POP' as HistoryUpdate['action'],
    location: { pathname: '/', search: '', hash: '', state: null, key: 'init' } as HistoryUpdate['location'],
  };
  const history = {
    get action() {
      return state.action;
    },
    get location() {
      return state.location;
    },
    createHref: () => '',
    createURL: () => new URL('http://localhost/'),
    encodeLocation: (to: unknown) => to,
    push: (to: string) => {
      state.action = 'PUSH' as HistoryUpdate['action'];
      state.location = { ...state.location, pathname: to, key: to };
      listener?.({ action: state.action, location: state.location, delta: null });
    },
    replace: () => {},
    go: (delta: number) => {
      state.action = 'POP' as HistoryUpdate['action'];
      state.location = { ...state.location, pathname: '/popped', key: 'popped' };
      listener?.({ action: state.action, location: state.location, delta });
    },
    listen: (l: (update: HistoryUpdate) => void) => {
      listener = l;
      return () => {
        listener = null;
      };
    },
  } as unknown as History;
  return history;
}

const withStartViewTransition = (impl: StartViewTransition | undefined) => {
  (document as Document & { startViewTransition?: StartViewTransition }).startViewTransition = impl as never;
};

afterEach(() => {
  withStartViewTransition(undefined);
  delete document.documentElement.dataset.routeTransition;
});

describe('decorateHistoryWithViewTransitions', () => {
  it('dispatches synchronously and untouched when the policy declines', () => {
    const seen: string[] = [];
    const policy: RouteTransitionPolicy = () => null;
    const decorated = decorateHistoryWithViewTransitions(fakeHistory(), policy);
    decorated.listen((u) => seen.push(u.location.pathname));
    decorated.push('/space');
    expect(seen).toEqual(['/space']);
    expect(document.documentElement.dataset.routeTransition).toBeUndefined();
  });

  it('dispatches synchronously when the View Transitions API is absent, even if the policy would approve', () => {
    const seen: string[] = [];
    const policy: RouteTransitionPolicy = () => 'push';
    const decorated = decorateHistoryWithViewTransitions(fakeHistory(), policy);
    decorated.listen((u) => seen.push(u.location.pathname));
    decorated.push('/space');
    expect(seen).toEqual(['/space']);
    expect(document.documentElement.dataset.routeTransition).toBeUndefined();
  });

  it('runs the approved dispatch INSIDE startViewTransition and stamps the direction', async () => {
    const order: string[] = [];
    let finish: () => void = () => {};
    withStartViewTransition((cb) => {
      order.push('vt-start');
      cb(); // browsers invoke the update callback; the DOM commit must happen inside it
      order.push('vt-callback-done');
      return { finished: new Promise((resolve) => (finish = () => resolve(undefined))) };
    });
    const policy: RouteTransitionPolicy = () => 'push';
    const decorated = decorateHistoryWithViewTransitions(fakeHistory(), policy);
    decorated.listen((u) => order.push('commit:' + u.location.pathname));
    decorated.push('/space');
    expect(order).toEqual(['vt-start', 'commit:/space', 'vt-callback-done']);
    expect(document.documentElement.dataset.routeTransition).toBe('push');
    expect(getActiveViewTransition()).not.toBeNull();
    finish();
    await Promise.resolve();
    await Promise.resolve();
    expect(document.documentElement.dataset.routeTransition).toBeUndefined();
    expect(getActiveViewTransition()).toBeNull();
  });

  it("stamps a 'morph' verdict like any direction — the stamp is generic, the vocabulary is the seam's", async () => {
    // A shared-element morph between surfaces (the desktop home → draft-chat convergence) is a
    // third verdict beside push/pop: no directional root motion, but still a router-run view
    // transition. The theme scopes its rules to html[data-route-transition="morph"].
    let finish: () => void = () => {};
    withStartViewTransition((cb) => {
      cb();
      return { finished: new Promise((resolve) => (finish = () => resolve(undefined))) };
    });
    const policy: RouteTransitionPolicy = () => 'morph';
    const decorated = decorateHistoryWithViewTransitions(fakeHistory(), policy);
    decorated.listen(() => {});
    decorated.push('/chat');
    expect(document.documentElement.dataset.routeTransition).toBe('morph');
    finish();
    await Promise.resolve();
    await Promise.resolve();
    expect(document.documentElement.dataset.routeTransition).toBeUndefined();
  });

  it('hands the policy the DEPARTING location, the new one, and the pop delta', () => {
    withStartViewTransition(() => ({ finished: Promise.resolve() }));
    const navs: { from: string; to: string; action: string; delta: number | null }[] = [];
    const policy: RouteTransitionPolicy = (nav) => {
      navs.push({ from: nav.from.pathname, to: nav.to.pathname, action: nav.action, delta: nav.delta });
      return null;
    };
    const decorated = decorateHistoryWithViewTransitions(fakeHistory(), policy);
    decorated.listen(() => {});
    decorated.push('/space');
    decorated.go(-1);
    expect(navs).toEqual([
      { from: '/', to: '/space', action: 'PUSH', delta: null },
      { from: '/space', to: '/popped', action: 'POP', delta: -1 },
    ]);
  });

  it('reports uaVisualTransition to the policy when the popstate carried it', () => {
    withStartViewTransition(() => ({ finished: Promise.resolve() }));
    const flags: boolean[] = [];
    const policy: RouteTransitionPolicy = (nav) => {
      flags.push(nav.uaVisualTransition);
      return null;
    };
    const decorated = decorateHistoryWithViewTransitions(fakeHistory(), policy);
    decorated.listen(() => {});
    const popstate = new PopStateEvent('popstate');
    Object.defineProperty(popstate, 'hasUAVisualTransition', { value: true });
    window.dispatchEvent(popstate);
    decorated.go(-1); // the dispatch right after the flagged popstate
    decorated.push('/next'); // flag must not leak to later navigations
    expect(flags).toEqual([true, false]);
  });

  it('delegates live action/location to the underlying history', () => {
    const decorated = decorateHistoryWithViewTransitions(fakeHistory(), () => null);
    decorated.listen(() => {});
    expect(decorated.location.pathname).toBe('/');
    decorated.push('/space');
    expect(decorated.location.pathname).toBe('/space');
    expect(decorated.action).toBe('PUSH');
  });
});
