import React from 'react';
import { Route, Routes } from 'react-router';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Page, getPages } from './Page';
import { createUrlParams } from './createUrlParams';
import { NotFound } from './NotFound';

export type AppOptions = {
  pageContainer?: React.ComponentType<{ page: Page }>;
  pageNotFound?: React.ComponentType;
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
      <BrowserRouter>
        <AppRoutes pages={props.pages} options={props.options} />
      </BrowserRouter>
    </div>
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
