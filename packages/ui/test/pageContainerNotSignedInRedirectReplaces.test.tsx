/**
 * @jest-environment jsdom
 *
 * PageContainer's not-signed-in redirect REPLACES the page it leaves in history; it never PUSHES the
 * login page on top of it.
 *
 * The class this pins down: a signed-out visitor reaching a page they cannot see is sent to the
 * login page. Pushed, the login page sits one history entry AFTER a page the visitor never saw
 * render (it rendered nothing), and after they sign in the auth page's document is left one
 * back-forward entry behind the app — where a back gesture restores it, landing a signed-in person
 * on the login form. Replaced, the login page takes that entry's place: back from the login page
 * lands where the visitor was BEFORE the page they could not see, and a signed-in person's history
 * never carries the login page.
 *
 * Assertions are OUTCOMES on the router's history: the redirect's disposition is a REPLACE, and
 * going back from the login page lands on the entry before the restricted page — never on the
 * restricted page (which would only redirect again) and never on the login page again.
 */
import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter, Route, Routes, useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import { PageContainer } from '../src/container/PageContainer';
import { AccountAuth } from '../src/container/AccountAuth';
import { Page } from '../src/router/Page';

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const HOME = '/home';
const RESTRICTED = '/restricted-area';
const LOGIN = '/login';

const restrictedPage: Page = {
  name: 'Restricted area',
  path: 'restricted-area',
  component: () => <div>restricted-page-content</div>,
};

const signedOut: AccountAuth = {
  isLoggedIn: false,
  canViewPage: () => false,
  login: LOGIN,
  logout: async () => LOGIN,
};

/** Reads the router's history: where it is, how it got there, and a way back. */
const HistoryProbe = () => {
  const location = useLocation();
  const navigationType = useNavigationType();
  const navigate = useNavigate();
  return (
    <div>
      <div data-testid='pathname'>{location.pathname}</div>
      <div data-testid='navigation-type'>{navigationType}</div>
      <button data-testid='back' onClick={() => navigate(-1)}>
        back
      </button>
    </div>
  );
};

describe('PageContainer: the not-signed-in redirect replaces the page in history', () => {
  let container: HTMLDivElement;
  let root: Root;
  let log: jest.SpyInstance;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    log = jest.spyOn(console, 'log').mockImplementation(() => undefined); // the redirect's own line
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    log.mockRestore();
  });

  const read = (id: string) => container.querySelector(`[data-testid="${id}"]`)!.textContent;

  /** A visitor at HOME who then arrives at the restricted page, signed out. */
  const arriveSignedOut = async () => {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={[HOME, RESTRICTED]} initialIndex={1}>
          <Routes>
            <Route path={HOME} element={<div>home</div>} />
            <Route path={RESTRICTED} element={<PageContainer page={restrictedPage} auth={signedOut} />} />
            <Route path={LOGIN} element={<div>login</div>} />
          </Routes>
          <HistoryProbe />
        </MemoryRouter>
      );
    });
  };

  const goBack = async () => {
    await act(async () => {
      (container.querySelector('[data-testid="back"]') as HTMLButtonElement).click();
    });
  };

  it('sends a signed-out visitor to the login page by REPLACING the restricted page, not pushing over it', async () => {
    await arriveSignedOut();
    expect(read('pathname')).toBe(LOGIN);
    expect(read('navigation-type')).toBe('REPLACE');
  });

  it('back from the login page lands where the visitor was before the restricted page', async () => {
    await arriveSignedOut();
    expect(read('pathname')).toBe(LOGIN);
    await goBack();
    expect(read('pathname')).toBe(HOME);
  });
});
