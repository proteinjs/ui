import React from 'react';
import { Route, Routes } from 'react-router';
import { createRoot } from 'react-dom/client';
import { Router as LowLevelRouter } from 'react-router-dom';
import { createBrowserHistory, type Action, type History, type Location } from '@remix-run/router';
import { Page, PageComponentProps, getPages } from './Page';
import { createUrlParams } from './createUrlParams';
import { NotFound } from './NotFound';
import { decorateHistoryWithViewTransitions, RouteTransitionPolicy } from './ViewTransitionHistory';
import { decorateHistoryWithRouteGuard, RouteGuard } from './RouteGuardHistory';

export type AppOptions = {
  pageContainer?: React.ComponentType<{ page: Page }>;
  /** Rendered for unmatched routes. Routed through `pageContainer` like any other page. */
  pageNotFound?: React.ComponentType<PageComponentProps>;
  /**
   * Optional route-transition policy: when provided, route commits the
   * policy approves run inside document.startViewTransition (see ViewTransitionHistory).
   * The router is the ONE place every navigation dispatches, so this is the app's single
   * transition seam. Absent → byte-identical to the plain BrowserRouter this replaced.
   */
  routeTransitions?: RouteTransitionPolicy;
  /**
   * Optional navigation guard: consulted for every navigation the router dispatches, the initial
   * location included, at the same seam (see RouteGuardHistory). A verdict replaces the un-admitted
   * location in place before the app renders it. Composed nearest the raw history, so the
   * transition policy only ever sees the location that commits. Absent → byte-identical to today.
   */
  routeGuard?: RouteGuard;
};

export function loadApp(options: AppOptions = {}) {
  const container = document.getElementById('app');
  const root = createRoot(container!);
  root.render(<Router pages={getPages()} options={options} />);
}

export function Router(props: { pages: Page[]; options: AppOptions }) {
  // NOTE: no CssBaseline here — this Router renders OUTSIDE any app ThemeProvider, so a baseline
  // at this level styles <body> with MUI's DEFAULT theme (light text color, white background,
  // Roboto). Every `color: inherit` in the app then bottoms out at light-mode black even in dark
  // mode. The app's own ThemeProvider owns the baseline.
  return (
    <div>
      <HistoryRouter routeGuard={props.options.routeGuard} routeTransitions={props.options.routeTransitions}>
        <AppRoutes pages={props.pages} options={props.options} />
      </HistoryRouter>
    </div>
  );
}

/**
 * BrowserRouter's own ~10 lines (react-router-dom 6.16: createBrowserHistory({window,
 * v5Compat}) + listen→setState), inlined so the history is OURS to decorate — react-router
 * 6.16 has no view-transition support and BrowserRouter hides its history. With no policy
 * and no guard the undecorated history dispatches identically to BrowserRouter. The guard
 * sits nearer the raw history than the view-transition policy, so the policy only ever sees
 * the location that commits; the guard's initial pass runs here, at construction, before the
 * state below seeds from `history.location`.
 */
function HistoryRouter(props: {
  routeGuard?: RouteGuard;
  routeTransitions?: RouteTransitionPolicy;
  children: React.ReactNode;
}) {
  const historyRef = React.useRef<History | null>(null);
  if (historyRef.current == null) {
    let history: History = createBrowserHistory({ window, v5Compat: true });
    if (props.routeGuard) {
      history = decorateHistoryWithRouteGuard(history, props.routeGuard);
    }
    if (props.routeTransitions) {
      history = decorateHistoryWithViewTransitions(history, props.routeTransitions);
    }
    historyRef.current = history;
  }
  const history = historyRef.current;
  const [state, setState] = React.useState<{ action: Action; location: Location }>({
    action: history.action,
    location: history.location,
  });
  React.useLayoutEffect(() => history.listen(setState), [history]);
  return (
    <LowLevelRouter location={state.location} navigationType={state.action} navigator={history}>
      {props.children}
    </LowLevelRouter>
  );
}

export function AppRoutes(props: { pages: Page[]; options: AppOptions }) {
  const { pages, options } = props;
  // The catch-all is a real Page routed through the normal page container, so the 404 renders
  // inside the app chrome (theme, nav) like any other surface. Public: a signed-out visitor on
  // a dead link sees the 404, not a login redirect.
  const notFoundPage: Page = {
    name: 'Page not found',
    path: '*',
    component: options.pageNotFound ?? NotFound,
    auth: { public: true },
  };
  const routes: React.ReactElement[] = [];
  let key = 0;
  for (const page of pages) {
    const paths = typeof page.path === 'string' ? [page.path] : page.path;
    for (const path of paths) {
      routes.push(
        <Route key={key++} path={getPath(path)} element={<ContainerizedComponent options={options} page={page} />} />
      );
    }
  }

  return (
    <Routes>
      {routes}
      <Route path='*' element={<ContainerizedComponent options={options} page={notFoundPage} />} />
    </Routes>
  );
}

function ContainerizedComponent(props: { options: AppOptions; page: Page }) {
  const urlParams = createUrlParams();
  if (props.options.pageContainer && !props.page.noPageContainer) {
    return <props.options.pageContainer page={props.page} />;
  }

  return <props.page.component urlParams={urlParams} />;
}

function getPath(path: string) {
  if (path.startsWith('/')) {
    return path;
  }

  return `/${path}`;
}
