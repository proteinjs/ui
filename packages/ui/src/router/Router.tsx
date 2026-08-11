import React from 'react';
import { Route, Routes } from 'react-router';
import { createRoot } from 'react-dom/client';
import { Router as LowLevelRouter } from 'react-router-dom';
import { createBrowserHistory, type Action, type History, type Location } from '@remix-run/router';
import { Page, getPages } from './Page';
import { createUrlParams } from './createUrlParams';
import { NotFound } from './NotFound';
import { decorateHistoryWithViewTransitions, RouteTransitionPolicy } from './ViewTransitionHistory';

export type AppOptions = {
  pageContainer?: React.ComponentType<{ page: Page }>;
  pageNotFound?: React.ComponentType;
  /**
   * Optional route-transition policy (MOBILE_POLISH T2): when provided, route commits the
   * policy approves run inside document.startViewTransition (see ViewTransitionHistory).
   * The router is the ONE place every navigation dispatches, so this is the app's single
   * transition seam. Absent → byte-identical to the plain BrowserRouter this replaced.
   */
  routeTransitions?: RouteTransitionPolicy;
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
  // mode. The app's ThemeProvider owns the baseline (see @n3xah/util-ui ThemeProvider).
  return (
    <div>
      <HistoryRouter routeTransitions={props.options.routeTransitions}>
        <AppRoutes pages={props.pages} options={props.options} />
      </HistoryRouter>
    </div>
  );
}

/**
 * BrowserRouter's own ~10 lines (react-router-dom 6.16: createBrowserHistory({window,
 * v5Compat}) + listen→setState), inlined so the history is OURS to decorate — react-router
 * 6.16 has no view-transition support and BrowserRouter hides its history. With no policy
 * the undecorated history dispatches identically to BrowserRouter.
 */
function HistoryRouter(props: { routeTransitions?: RouteTransitionPolicy; children: React.ReactNode }) {
  const historyRef = React.useRef<History | null>(null);
  if (historyRef.current == null) {
    const history = createBrowserHistory({ window, v5Compat: true });
    historyRef.current = props.routeTransitions
      ? decorateHistoryWithViewTransitions(history, props.routeTransitions)
      : history;
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
  const PageNotFound = options.pageNotFound ?? NotFound;
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
      <Route path='*' element={<PageNotFound />} />
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
