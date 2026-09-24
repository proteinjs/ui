/**
 * @jest-environment jsdom
 *
 * Long-content fields: every multiline field carries ONE expand affordance ("Open"); values over
 * the inline bound (INLINE_EDIT_MAX_CHARS) render as a clamped preview instead of an inline editor.
 *
 * Open is a READ (founder, 2026-09-24: "when you open things like output in the migration form,
 * that full-screen view keeps the kb open and you can't close it … the kb is covering the buttons
 * at the bottom"; "there should probably be copy buttons on views like that"):
 *  - opening raises no keyboard — the viewer's content is a read-only pane of selectable text, and
 *    nothing inside it (or left behind it) holds an input's focus;
 *  - its controls sit in a top bar the keyboard can never cover: Close, and Copy (the whole value
 *    to the clipboard, confirmed by the house toast "Copied");
 *  - Escape, and on the phone the back gesture (the viewer is a history entry while open), close it;
 *  - an editable field's value is edited by choice — Edit turns the pane into the editor; Done
 *    commits the draft through the field's onChange, the close control discards it.
 */
import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { textField, INLINE_EDIT_MAX_CHARS, PREVIEW_CHARS } from '../src/form/fields/TextField';
import type { FieldComponent, Fields } from '../src/form/Field';

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

const clipboardWrites: string[] = [];
beforeAll(() => {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: async (text: string) => {
        clipboardWrites.push(text);
      },
    },
  });
});

/** Let MUI's enter/exit transitions and queued history traversals settle. */
const settle = async (ms = 400) => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
};

describe('field expand — the long-value viewer', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    phoneMode = false;
    clipboardWrites.length = 0;
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

  const mount = async (
    fieldComponent: FieldComponent<any, Fields>,
    onChange: jest.Mock = jest.fn(async () => undefined)
  ) => {
    await act(async () => {
      root.render(<fieldComponent.component field={fieldComponent.field} onChange={onChange} />);
    });
    return onChange;
  };

  const click = async (element: Element) => {
    await act(async () => {
      element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
  };

  const openButton = () => Array.from(document.querySelectorAll('button')).find((b) => b.textContent === 'Open');
  /** The open viewer — read after `settle()`, once a closed one's exit transition has unmounted it. */
  const viewer = () => (document.querySelector('[role="dialog"]') as HTMLElement | null) ?? undefined;
  const control = (label: string) => viewer()?.querySelector(`button[aria-label="${label}"]`) as HTMLElement | null;
  const typingTarget = () => {
    const active = document.activeElement;
    return !!active && (active.tagName === 'TEXTAREA' || active.tagName === 'INPUT');
  };

  it('short multiline values keep an inline editor AND the Open affordance', async () => {
    await mount(textField({ name: 'description', value: 'short text', multiline: true }));

    expect(container.querySelector('textarea')).not.toBeNull();
    expect(openButton()).not.toBeNull();
    expect(container.querySelector('[data-field-preview]')).toBeNull();
  });

  it('single-line fields carry no Open affordance', async () => {
    await mount(textField({ name: 'name', value: 'a name' }));
    expect(openButton()).toBeUndefined();
  });

  it('values over the inline bound render a clamped preview, not an inline editor', async () => {
    const long = 'x'.repeat(INLINE_EDIT_MAX_CHARS + 100);
    await mount(textField({ name: 'stack', value: long, multiline: true }));

    expect(container.querySelector('textarea')).toBeNull();
    const preview = container.querySelector('[data-field-preview]')!;
    expect(preview).not.toBeNull();
    // The preview renders only the head of the value — a doorway, not a viewport.
    expect(preview.textContent!.length).toBe(PREVIEW_CHARS);
    // The helper tells the truth about what is shown.
    expect(container.textContent).toContain('characters — showing the first lines');
  });

  it('Open is a read: the full value in a read-only pane, no input in the viewer, no input holding focus', async () => {
    const long = 'y'.repeat(INLINE_EDIT_MAX_CHARS + 50);
    await mount(textField({ name: 'output', label: 'Output', value: long, multiline: true, monospace: true }));

    await click(container.querySelector('[data-field-preview]')!);
    await settle();

    const open = viewer()!;
    expect(open).toBeDefined();
    expect(open.querySelector('textarea, input')).toBeNull();
    const pane = open.querySelector('[data-field-viewer-pane]') as HTMLElement;
    expect(pane.textContent).toBe(long);
    // The pane is the viewer's scroller: long content scrolls inside it, under the top bar.
    expect(getComputedStyle(pane).overflowY).toBe('auto');
    expect(typingTarget()).toBe(false);
  });

  it('opening from a focused inline editor lets the keyboard go: the editor is blurred', async () => {
    await mount(textField({ name: 'description', value: 'being typed', multiline: true }));
    const inline = container.querySelector('textarea')!;
    act(() => {
      inline.focus();
    });
    expect(document.activeElement).toBe(inline);

    await click(openButton()!);
    await settle();

    expect(viewer()).toBeDefined();
    expect(typingTarget()).toBe(false);
  });

  it('the top bar carries Close; Close and Escape each close the viewer', async () => {
    await mount(textField({ name: 'description', label: 'Description', value: 'read me', multiline: true }));

    await click(openButton()!);
    await settle();
    expect(control('Close')).not.toBeNull();
    await click(control('Close')!);
    await settle();
    expect(viewer()).toBeUndefined();

    await click(openButton()!);
    await settle();
    expect(viewer()).toBeDefined();
    await act(async () => {
      viewer()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    await settle();
    expect(viewer()).toBeUndefined();
  });

  it('on the phone the viewer is a history entry: back closes it, and a Close consumes the entry', async () => {
    phoneMode = true;
    await mount(textField({ name: 'output', label: 'Output', value: '{"rows": 3}', multiline: true }));
    const depthBefore = window.history.length;

    await click(openButton()!);
    await settle();
    expect(viewer()).toBeDefined();
    expect(window.history.length).toBe(depthBefore + 1);

    // The OS back gesture / the shell's back: a history pop (its popstate lands a task later).
    await act(async () => {
      window.history.back();
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    await settle();
    expect(viewer()).toBeUndefined();

    // A Close consumes the entry it pushed (history lands back on the page's own entry).
    await click(openButton()!);
    await settle();
    expect(viewer()).toBeDefined();
    const pageState = window.history.state;
    await click(control('Close')!);
    await settle();
    expect(viewer()).toBeUndefined();
    expect(Object.keys(window.history.state ?? {})).not.toContain('sheetHistoryEntry');
    expect(pageState).not.toBeNull();
  });

  it('Copy puts the whole value on the clipboard and confirms with the house toast', async () => {
    const long = 'z'.repeat(INLINE_EDIT_MAX_CHARS + 10);
    await mount(textField({ name: 'output', label: 'Output', value: long, multiline: true }));

    await click(container.querySelector('[data-field-preview]')!);
    await settle();
    await click(control('Copy')!);
    await settle(50);

    expect(clipboardWrites).toEqual([long]);
    const toast = document.querySelector('.MuiSnackbar-root') as HTMLElement;
    expect(toast).not.toBeNull();
    expect(toast.textContent).toContain('Copied');
  });

  it('Edit turns the pane into the editor; Done commits the draft through onChange', async () => {
    const long = 'y'.repeat(INLINE_EDIT_MAX_CHARS + 50);
    const onChange = await mount(textField({ name: 'stack', label: 'Stack', value: long, multiline: true }));

    await click(container.querySelector('[data-field-preview]')!);
    await settle();
    await click(control('Edit')!);

    const editor = viewer()!.querySelector('textarea')!;
    expect(editor.value).toBe(long);
    // Typing is now the act: the editor takes focus.
    expect(document.activeElement).toBe(editor);

    await act(async () => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        'value'
      )!.set!;
      nativeInputValueSetter.call(editor, 'edited value');
      editor.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const done = Array.from(viewer()!.querySelectorAll('button')).find((b) => b.textContent === 'Done')!;
    await click(done);
    await settle();

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][1]).toBe('edited value');
    expect(viewer()).toBeUndefined();
  });

  it('closing the editor discards the draft — no onChange, and reopening reads the stored value', async () => {
    const onChange = await mount(
      textField({ name: 'description', label: 'Description', value: 'keep me', multiline: true })
    );

    await click(openButton()!);
    await settle();
    await click(control('Edit')!);
    const editor = viewer()!.querySelector('textarea')!;
    await act(async () => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        'value'
      )!.set!;
      nativeInputValueSetter.call(editor, 'discarded draft');
      editor.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await click(control('Close')!);
    await settle();

    expect(onChange).not.toHaveBeenCalled();

    await click(openButton()!);
    await settle();
    expect((viewer()!.querySelector('[data-field-viewer-pane]') as HTMLElement).textContent).toBe('keep me');
  });

  it('a read-only field’s viewer offers Copy and Close, never Edit', async () => {
    await mount(
      textField({
        name: 'stack',
        label: 'Stack',
        value: 'a stored stack',
        multiline: true,
        accessibility: { readonly: true },
      })
    );

    await click(openButton()!);
    await settle();

    expect(control('Copy')).not.toBeNull();
    expect(control('Close')).not.toBeNull();
    expect(control('Edit')).toBeNull();
  });
});
