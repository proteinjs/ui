import React from 'react';
import { Route, Routes } from 'react-router';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, useNavigate, NavigateFunction } from 'react-router-dom';
import { CssBaseline } from '@mui/material';
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
  return (
    <div>
      <CssBaseline />
      <BrowserRouter>
        <RoutesComponent />
      </BrowserRouter>
    </div>
  );

  function RoutesComponent() {
    const navigate = useNavigate();
    return (
      <Routes>
        {(() => {
          const routes = [];
          let key = 0;
          for (const page of pages) {
            if (typeof page.path === 'string') routes.push(<Route key={key++} path={getPath(page.path)} element={<ContainerizedComponent options={options} page={page} navigate={navigate} />} />);
            else {
              const paths = page.path as string[];
              for (const path of paths) routes.push(<Route key={key++} path={getPath(path)} element={<ContainerizedComponent options={options} page={page} navigate={navigate} />} />);
            }
          }
          return routes;
        })()}
        <Route element={<PageNotFound pageNotFound={options.pageNotFound} />} />
      </Routes>
    );
  }

  function ContainerizedComponent(props: { options: AppOptions; page: Page; navigate: NavigateFunction }) {
    if (props.options.pageContainer && !props.page.noPageContainer) return <props.options.pageContainer page={props.page} />;

    return <props.page.component urlParams={createUrlParams()} navigate={props.navigate} />;
  }

  function PageNotFound(props: { pageNotFound: AppOptions['pageNotFound'] }) {
    if (props.pageNotFound) return <props.pageNotFound />;

    return <h1>404: Page not found</h1>;
  }
}

function getPath(path: string) {
  if (path.startsWith('/')) return path;

  return `/${path}`;
}
