/**
 * @jest-environment jsdom
 *
 * Long-content fields (round 2): every multiline field carries ONE expand affordance ("Open")
 * that opens the focused editor dialog; values over the inline bound (INLINE_EDIT_MAX_CHARS)
 * render as a clamped preview instead of an inline editor and are editable only through the
 * dialog. Done commits the draft through the field's onChange; Cancel discards it.
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

describe('field expand', () => {
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
  const dialog = () => document.querySelector('[role="dialog"]');

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

  it('Open opens the dialog with the FULL value; Done commits the edit through onChange', async () => {
    const long = 'y'.repeat(INLINE_EDIT_MAX_CHARS + 50);
    const onChange = await mount(textField({ name: 'stack', value: long, multiline: true }));

    await click(container.querySelector('[data-field-preview]')!);
    expect(dialog()).not.toBeNull();

    const editor = dialog()!.querySelector('textarea')!;
    expect(editor.value).toBe(long);

    await act(async () => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        'value'
      )!.set!;
      nativeInputValueSetter.call(editor, 'edited value');
      editor.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const done = Array.from(dialog()!.querySelectorAll('button')).find((b) => b.textContent === 'Done')!;
    await click(done);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][1]).toBe('edited value');
  });

  it('Cancel discards the draft — no onChange, and reopening shows the stored value', async () => {
    const onChange = await mount(textField({ name: 'description', value: 'keep me', multiline: true }));

    await click(openButton()!);
    expect(dialog()).not.toBeNull();

    // Edit the draft, then cancel it.
    const editor = dialog()!.querySelector('textarea')!;
    await act(async () => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        'value'
      )!.set!;
      nativeInputValueSetter.call(editor, 'discarded draft');
      editor.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const cancel = Array.from(dialog()!.querySelectorAll('button')).find((b) => b.textContent === 'Cancel')!;
    await click(cancel);

    expect(onChange).not.toHaveBeenCalled();

    // Reopen: the discarded draft is gone — the editor re-seeds from the stored value.
    await click(openButton()!);
    const reopened = Array.from(document.querySelectorAll('[role="dialog"] textarea')).find(
      (t) => (t as HTMLTextAreaElement).value === 'keep me'
    );
    expect(reopened).not.toBeUndefined();
  });
});
