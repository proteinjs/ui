/**
 * @jest-environment jsdom
 *
 * The form's status message is a TOAST (task #53 rider: "Started migration" rendered as an
 * inline Alert inside the form card, inset by a nested Container's default gutters and
 * crowding the first field). House toast idiom — a floating Snackbar anchored bottom-center
 * wrapping a severity Alert (the OpsCockpit/ThoughtPage pattern) — on BOTH form factors:
 *  1. A button's returned message renders inside a bottom-center Snackbar, NOT inline in the
 *     form body (no layout shift when status appears).
 *  2. A thrown button error renders the same toast with error severity.
 */
import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';
import { Form } from '../src/form/Form';
import { textField } from '../src/form/fields/TextField';

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let phoneMode = false;
beforeAll(() => {
  (window as any).matchMedia = (query: string) => ({
    matches: phoneMode,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  });
});

describe('Form status toast', () => {
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

  const mount = async (onClick: () => Promise<string>) => {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/record/form']}>
          <Form
            name='Migration'
            createFields={() => ({ a: textField({ name: 'a', layout: { row: 0, width: 12 } }) })}
            buttons={{ run: { name: 'Run', style: {}, onClick } }}
          />
        </MemoryRouter>
      );
    });
  };

  const clickRun = async () => {
    const button = Array.from(document.querySelectorAll('button')).find((b) => b.textContent === 'Run')!;
    await act(async () => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
  };

  const assertSuccessToast = () => {
    const snackbar = document.querySelector('.MuiSnackbar-root') as HTMLElement;
    expect(snackbar).toBeTruthy();
    expect(snackbar.className).toContain('MuiSnackbar-anchorOriginBottomCenter');
    expect(snackbar.textContent).toContain('Started migration');
    expect(snackbar.querySelector('.MuiAlert-root')!.className).toContain('Success');
    // NOT inline in the form body: the <form> subtree carries neither the message nor an Alert
    const form = document.querySelector('form')!;
    expect(form.textContent).not.toContain('Started migration');
    expect(form.querySelector('.MuiAlert-root')).toBeNull();
  };

  it('desktop: success message renders as a bottom-center toast, not an inline banner', async () => {
    phoneMode = false;
    await mount(async () => 'Started migration');
    await clickRun();
    assertSuccessToast();
  });

  it('phone: the same toast idiom', async () => {
    phoneMode = true;
    await mount(async () => 'Started migration');
    await clickRun();
    assertSuccessToast();
  });

  it('a thrown button error renders the toast with error severity', async () => {
    phoneMode = false;
    await mount(async () => {
      throw new Error('Migration failed to start');
    });
    await clickRun();
    const snackbar = document.querySelector('.MuiSnackbar-root') as HTMLElement;
    expect(snackbar).toBeTruthy();
    expect(snackbar.textContent).toContain('Migration failed to start');
    expect(snackbar.querySelector('.MuiAlert-root')!.className).toContain('Error');
  });
});
