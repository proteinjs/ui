import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { AppRoutes, AppOptions } from '../src/router/Router';
import { Page } from '../src/router/Page';

const PAGE_CONTENT = 'home-page-content';

const homePage: Page = {
  name: 'Home',
  path: '/',
  component: () => <div>{PAGE_CONTENT}</div>,
};

function render(path: string, options: AppOptions = {}) {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes pages={[homePage]} options={options} />
    </MemoryRouter>
  );
}

describe('route table 404 handling', () => {
  it('renders the default NotFound page (not a blank screen) for an unmatched path', () => {
    const html = render('/no-such-page');
    expect(html).toContain('Page not found');
    expect(html).toContain('Go home');
  });

  it('renders the registered pageNotFound override for an unmatched path', () => {
    const Custom = () => <div>custom-not-found</div>;
    const html = render('/no-such-page', { pageNotFound: Custom });
    expect(html).toContain('custom-not-found');
    expect(html).not.toContain('Page not found');
  });

  it('routes the 404 through the app page container so the app chrome renders', () => {
    const Container = ({ page }: { page: Page }) => (
      <div>
        page-container-chrome
        <page.component urlParams={{}} />
      </div>
    );
    const html = render('/no-such-page', { pageContainer: Container });
    expect(html).toContain('page-container-chrome');
    expect(html).toContain('Page not found');
  });

  it('still renders a registered page for a matched path', () => {
    const html = render('/');
    expect(html).toContain(PAGE_CONTENT);
    expect(html).not.toContain('Page not found');
  });
});
