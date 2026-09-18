/**
 * @jest-environment jsdom
 *
 * Page.pageContainerSxProps resolves against the FORM FACTOR the container lays out on, not the
 * theme alone. A page whose presentation differs by form factor (a full-bleed phone surface under a
 * centred desktop card, say) declares its container's styles per posture — the ground the container
 * paints edge to edge — and the container hands it the same `useFormFactor` fork the page's own
 * component forks on. Outcomes, on the rendered container:
 *  1. Phone (coarse pointer, narrow window): the container paints the page's PHONE declaration.
 *  2. Desktop: the container paints the page's DESKTOP declaration.
 *  3. A page declaring against the theme alone (the one-argument form) keeps working unchanged.
 */
import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';
import { Theme, SxProps } from '@mui/material';
import { PageContainer } from '../src/container/PageContainer';
import { AccountAuth } from '../src/container/AccountAuth';
import { FormFactor } from '../src/hooks/useFormFactor';
import { Page } from '../src/router/Page';

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const PHONE_GROUND = 'rgb(40, 40, 40)';
const DESKTOP_GROUND = 'rgb(32, 32, 32)';
const THEME_ONLY_GROUND = 'rgb(1, 2, 3)';

let phoneMode = true;
beforeAll(() => {
  (window as any).matchMedia = (query: string) => ({
    // Phone: the form-factor fork ((pointer: coarse) AND (max-width|max-height below the line))
    // matches; desktop: nothing matches.
    matches: phoneMode && (query.includes('pointer: coarse') || query.includes('max-')),
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  });
});

/** Emotion under jest injects rules via CSSOM; collect the cssText of rules targeting the
 *  element's generated classes so style assertions read the ACTUAL styles. */
const cssFor = (el: Element): string => {
  const classes = Array.from(el.classList).filter((cls) => cls.startsWith('css-'));
  const out: string[] = [];
  Array.from(document.querySelectorAll('style')).forEach((styleEl) => {
    const rules = styleEl.sheet?.cssRules ?? ([] as unknown as CSSRuleList);
    Array.from(rules).forEach((rule) => {
      if (classes.some((cls) => rule.cssText.includes(`.${cls}`))) {
        out.push(rule.cssText);
      }
    });
  });
  return out.join('\n');
};

/** A page that presents differently per posture: its container's ground follows. */
const posturePage: Page = {
  name: 'Posture page',
  path: 'posture',
  component: () => <div>posture-content</div>,
  pageContainerSxProps: (_theme: Theme, { isPhone }: FormFactor): SxProps => ({
    backgroundColor: isPhone ? PHONE_GROUND : DESKTOP_GROUND,
  }),
};

/** The one-argument declaration every existing page carries. */
const themeOnlyPage: Page = {
  name: 'Theme-only page',
  path: 'theme-only',
  component: () => <div>theme-only-content</div>,
  pageContainerSxProps: (): SxProps => ({ backgroundColor: THEME_ONLY_GROUND }),
};

const auth: AccountAuth = {
  isLoggedIn: true,
  canViewPage: () => true,
  login: '/login',
  logout: async () => '/login',
};

describe('PageContainer hands the page its form factor', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  const mount = async (page: Page) => {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={[`/${page.path}`]}>
          <PageContainer page={page} auth={auth} />
        </MemoryRouter>
      );
    });
    return container.firstElementChild as Element;
  };

  it('phone: the container paints the declaration for the phone', async () => {
    phoneMode = true;
    const containerBox = await mount(posturePage);
    expect(cssFor(containerBox)).toContain(`background-color: ${PHONE_GROUND}`);
    expect(cssFor(containerBox)).not.toContain(`background-color: ${DESKTOP_GROUND}`);
  });

  it('desktop: the container paints the declaration for the desktop', async () => {
    phoneMode = false;
    const containerBox = await mount(posturePage);
    expect(cssFor(containerBox)).toContain(`background-color: ${DESKTOP_GROUND}`);
    expect(cssFor(containerBox)).not.toContain(`background-color: ${PHONE_GROUND}`);
  });

  it('a page declaring against the theme alone keeps its styles on both postures', async () => {
    for (const phone of [true, false]) {
      phoneMode = phone;
      const containerBox = await mount(themeOnlyPage);
      expect(cssFor(containerBox)).toContain(`background-color: ${THEME_ONLY_GROUND}`);
    }
  });
});
