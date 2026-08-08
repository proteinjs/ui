import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { PageContainer } from '../src/container/PageContainer';
import { AccountAuth } from '../src/container/AccountAuth';
import { UnauthorizedPageProps } from '../src/container/DefaultUnauthorizedPage';
import { Page } from '../src/router/Page';

const DEFAULT_CARD_COPY = 'have access to this page';
const PAGE_CONTENT = 'restricted-page-content';

const restrictedPage: Page = {
  name: 'Restricted area',
  path: 'restricted-area',
  component: () => <div>{PAGE_CONTENT}</div>,
};

function makeAuth(overrides: Partial<AccountAuth> = {}): AccountAuth {
  return {
    isLoggedIn: true,
    canViewPage: () => false,
    login: '/login',
    logout: async () => '/login',
    ...overrides,
  };
}

function render(auth: AccountAuth, unauthorizedPage?: React.ComponentType<UnauthorizedPageProps>) {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={['/restricted-area']}>
      <PageContainer page={restrictedPage} auth={auth} unauthorizedPage={unauthorizedPage} />
    </MemoryRouter>
  );
}

describe('unauthorized page rendering', () => {
  it('renders the default unauthorized card (not a blank page) when logged in without access', () => {
    const html = render(makeAuth());
    expect(html).toContain(DEFAULT_CARD_COPY);
    expect(html).not.toContain(PAGE_CONTENT);
  });

  it('renders the registered unauthorizedPage override instead of the default card', () => {
    const Custom = ({ page }: UnauthorizedPageProps) => <div>custom-unauthorized:{page.name}</div>;
    const html = render(makeAuth(), Custom);
    expect(html).toContain('custom-unauthorized:Restricted area');
    expect(html).not.toContain(DEFAULT_CARD_COPY);
  });

  it('renders the page itself when the user has access', () => {
    const html = render(makeAuth({ canViewPage: () => true }));
    expect(html).toContain(PAGE_CONTENT);
    expect(html).not.toContain(DEFAULT_CARD_COPY);
  });

  it('does not render the unauthorized card for logged-out users (login flow unchanged)', () => {
    const html = render(makeAuth({ isLoggedIn: false }));
    expect(html).not.toContain(DEFAULT_CARD_COPY);
    expect(html).not.toContain(PAGE_CONTENT);
  });
});
