import React from 'react';
import { Route, Routes } from 'react-router';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, useNavigate, NavigateFunction } from 'react-router-dom';
import { Page, getPages } from './Page';
import { createUrlParams } from './createUrlParams';

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
  const { pages, options } = props;
  // NOTE: no CssBaseline here — this Router renders OUTSIDE any app ThemeProvider, so a baseline
  // at this level styles <body> with MUI's DEFAULT theme (light text color, white background,
  // Roboto). Every `color: inherit` in the app then bottoms out at light-mode black even in dark
  // mode. The app's ThemeProvider owns the baseline (see @n3xah/util-ui ThemeProvider).
  return (
    <div>
      <BrowserRouter>
        <RoutesComponent />
      </BrowserRouter>
    </div>
  );

  function RoutesComponent() {
    return (
      <Routes>
        {(() => {
          const routes = [];
          let key = 0;
          for (const page of pages) {
            if (typeof page.path === 'string') {
              routes.push(
                <Route
                  key={key++}
                  path={getPath(page.path)}
                  element={<ContainerizedComponent options={options} page={page} />}
                />
              );
            } else {
              const paths = page.path as string[];
              for (const path of paths) {
                routes.push(
                  <Route
                    key={key++}
                    path={getPath(path)}
                    element={<ContainerizedComponent options={options} page={page} />}
                  />
                );
              }
            }
          }
          return routes;
        })()}
        <Route element={<PageNotFound pageNotFound={options.pageNotFound} />} />
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

  function PageNotFound(props: { pageNotFound: AppOptions['pageNotFound'] }) {
    if (props.pageNotFound) {
      return <props.pageNotFound />;
    }

    return <h1>404: Page not found</h1>;
  }
}

function getPath(path: string) {
  if (path.startsWith('/')) {
    return path;
  }

  return `/${path}`;
}
