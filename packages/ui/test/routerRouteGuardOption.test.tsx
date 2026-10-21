/**
 * @jest-environment jsdom
 *
 * `AppOptions.routeGuard` at the router's own init block: the guard is composed onto the browser history
 * nearest the raw history, and its initial pass runs BEFORE the first render — a refused boot location is
 * replaced before `useState` seeds, so the page the guard refused never mounts. Absent, the router is
 * byte-identical to today (the refused page mounts as it always did).
 */
import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { Router } from '../src/router/Router';
import { Page } from '../src/router/Page';
import { RouteGuard } from '../src/router/RouteGuardHistory';

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let deadMounts = 0;
const DeadPage = () => {
  deadMounts++;
  return <div>dead-page</div>;
};
const LandingPage = () => <div>landing-page</div>;

const pages: Page[] = [
  { name: 'Dead', path: 'dead', component: DeadPage, auth: { public: true } },
  { name: 'Landing', path: 'landing', component: LandingPage, auth: { public: true } },
];

const refuseDead: RouteGuard = (nav) => (nav.to.pathname === '/dead' ? { replace: '/landing' } : null);

describe('Router — the routeGuard option', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    deadMounts = 0;
    window.history.replaceState(null, '', '/dead');
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    window.history.replaceState(null, '', '/');
  });

  it('a refused boot location is replaced before the first render: the refused page never mounts', () => {
    act(() => {
      root.render(<Router pages={pages} options={{ routeGuard: refuseDead }} />);
    });
    expect(container.textContent).toBe('landing-page');
    expect(deadMounts).toBe(0);
    expect(window.location.pathname).toBe('/landing');
  });

  it('absent, the router is byte-identical: the same boot location mounts its page', () => {
    act(() => {
      root.render(<Router pages={pages} options={{}} />);
    });
    expect(container.textContent).toBe('dead-page');
    expect(deadMounts).toBe(1);
    expect(window.location.pathname).toBe('/dead');
  });
});
