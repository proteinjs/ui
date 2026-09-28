/**
 * @jest-environment jsdom
 *
 * The two seams a consumer application plugs its own chrome into (the rule since 2026-09-27: a
 * framework surface never re-implements what the application already owns — its modal shell, its
 * transient notice):
 *  - the modal shell: the long-value viewer presents through the shell the application supplies
 *    (`ModalShellProvider`), handing it the title, the length caption, its own controls and the
 *    pane; the shell's close closes the viewer. With no provider, the framework's own shell stands.
 *  - the status notice: Copy's confirmation and a form button's result present through the
 *    application's presenter (`StatusNoticeProvider`) — and then the framework renders no toast of
 *    its own. With no provider, the framework's own toast stands (fieldExpand / formStatusToast).
 */
import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';
import { textField, INLINE_EDIT_MAX_CHARS } from '../src/form/fields/TextField';
import { Form } from '../src/form/Form';
import { ModalShellProvider, ModalShellProps } from '../src/components/ModalShell';
import { StatusNoticeProvider, StatusNotice } from '../src/components/StatusNotice';
import type { FieldComponent, Fields } from '../src/form/Field';

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

beforeAll(() => {
  (window as any).matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  });
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: async () => undefined },
  });
});

/** The application's shell, as a stub: its own frame, the pieces the framework hands it in named slots. */
function StubShell({ onClose, title, meta, actions, children }: ModalShellProps) {
  return (
    <div role='dialog' data-stub-shell>
      <div data-stub-title>{title}</div>
      <div data-stub-meta>{meta}</div>
      <div data-stub-actions>{actions}</div>
      <button aria-label='stub close' onClick={onClose} />
      <div data-stub-content>{children}</div>
    </div>
  );
}

const settle = async (ms = 400) => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
};

describe('the framework seams — the application’s shell and notice', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    act(() => {
      root.unmount();
    });
    container.remove();
    await settle(50);
  });

  const render = async (element: React.ReactElement) => {
    await act(async () => {
      root.render(element);
    });
  };

  const click = async (element: Element) => {
    await act(async () => {
      element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
  };

  const field = (fieldComponent: FieldComponent<any, Fields>) => (
    <fieldComponent.component field={fieldComponent.field} onChange={jest.fn(async () => undefined)} />
  );

  const long = 'q'.repeat(INLINE_EDIT_MAX_CHARS + 10);

  it('the viewer presents through the application’s shell: title, length, controls and pane in its slots; its close closes the viewer', async () => {
    await render(
      <ModalShellProvider shell={StubShell}>
        {field(textField({ name: 'output', label: 'Output', value: long, multiline: true }))}
      </ModalShellProvider>
    );
    await click(container.querySelector('[data-field-preview]')!);
    await settle();

    const shell = document.querySelector('[data-stub-shell]') as HTMLElement;
    expect(shell).not.toBeNull();
    expect(shell.querySelector('[data-stub-title]')!.textContent).toBe('Output');
    expect(shell.querySelector('[data-stub-meta]')!.textContent).toContain('characters');
    expect(shell.querySelector('[data-stub-actions] button[aria-label="Copy"]')).not.toBeNull();
    expect(shell.querySelector('[data-stub-content] [data-field-viewer-pane]')!.textContent).toBe(long);
    // No framework dialog of its own beside the application's shell.
    expect(document.querySelectorAll('[role="dialog"]').length).toBe(1);

    await click(shell.querySelector('button[aria-label="stub close"]')!);
    await settle();
    expect(document.querySelector('[data-stub-shell]')).toBeNull();
  });

  it('Copy confirms through the application’s presenter, and the framework renders no toast of its own', async () => {
    const present = jest.fn<void, [StatusNotice]>();
    await render(
      <StatusNoticeProvider present={present}>
        {field(textField({ name: 'output', label: 'Output', value: long, multiline: true }))}
      </StatusNoticeProvider>
    );
    await click(container.querySelector('[data-field-preview]')!);
    await settle();
    await click(document.querySelector('[role="dialog"] button[aria-label="Copy"]')!);
    await settle(50);

    expect(present).toHaveBeenCalledTimes(1);
    expect(present.mock.calls[0][0]).toEqual({ message: 'Copied' });
    expect(document.querySelector('.MuiSnackbar-root')).toBeNull();
  });

  it('a form button’s result presents through the application’s presenter — success and error alike, no toast of the framework’s own', async () => {
    const present = jest.fn<void, [StatusNotice]>();
    let outcome: () => Promise<string> = async () => 'Started migration';
    await render(
      <MemoryRouter initialEntries={['/record/form']}>
        <StatusNoticeProvider present={present}>
          <Form
            name='Migration'
            createFields={() => ({ a: textField({ name: 'a', layout: { row: 0, width: 12 } }) })}
            buttons={{ run: { name: 'Run', style: {}, onClick: () => outcome() } }}
          />
        </StatusNoticeProvider>
      </MemoryRouter>
    );
    const run = () => Array.from(document.querySelectorAll('button')).find((b) => b.textContent === 'Run')!;
    await click(run());
    expect(present).toHaveBeenLastCalledWith({ message: 'Started migration', isError: false });

    outcome = async () => {
      throw new Error('Migration failed to start');
    };
    await click(run());
    expect(present).toHaveBeenLastCalledWith({ message: 'Migration failed to start', isError: true });
    expect(document.querySelector('.MuiSnackbar-root')).toBeNull();
    expect(document.querySelector('.MuiAlert-root')).toBeNull();
  });
});
