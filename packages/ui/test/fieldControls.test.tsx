/**
 * @jest-environment jsdom
 *
 * Field controls (task #53 part 2, items 3 and 7 seams):
 *  - readonly text fields render as a text ROW (round 2): no input chrome at all — the value
 *    is selectable text with a copy control, so readonly values (ids, timestamps) stay
 *    copyable without wearing an input border.
 *  - checkboxField renders a real checkbox and reports a boolean value.
 *  - dateField renders a native date input ('datetime-local' with includeTime).
 */
import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { textField } from '../src/form/fields/TextField';
import { checkboxField } from '../src/form/fields/CheckboxField';
import { dateField } from '../src/form/fields/DateField';
import type { FieldComponent, Fields } from '../src/form/Field';

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('field controls', () => {
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

  it('readonly text fields render as a text row — no input chrome, value present and copyable', async () => {
    await mount(textField({ name: 'id', value: 'record-123', accessibility: { readonly: true } }));

    // No input element at all: the value is a text row, not a disabled/readOnly control.
    expect(container.querySelector('input')).toBeNull();
    const row = container.querySelector('[data-readonly-value-row]')!;
    expect(row).not.toBeNull();
    expect(row.textContent).toContain('record-123');
    expect(container.querySelector('button[aria-label="Copy Id"]')).not.toBeNull();
  });

  it('readonly text fields present their description inline (the relative-time suffix on timestamps)', async () => {
    await mount(
      textField({
        name: 'created',
        value: 'Aug 12, 2026, 9:14 AM',
        description: '16 days ago',
        accessibility: { readonly: true },
      })
    );

    const row = container.querySelector('[data-readonly-value-row]')!;
    expect(row.textContent).toContain('Aug 12, 2026, 9:14 AM');
    expect(row.textContent).toContain('16 days ago');
  });

  it('editable text fields are neither disabled nor readOnly', async () => {
    await mount(textField({ name: 'title', value: 't' }));

    const input = container.querySelector('input')!;
    expect(input.disabled).toBe(false);
    expect(input.readOnly).toBe(false);
  });

  it('checkboxField renders a checkbox reflecting the boolean value and reports booleans', async () => {
    const field = checkboxField({ name: 'active', value: false });
    const onChange = await mount(field);

    const input = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.checked).toBe(false);

    await act(async () => {
      input.click();
    });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][1]).toBe(true);
  });

  it('checkboxField renders checked for a true value', async () => {
    await mount(checkboxField({ name: 'active', value: true }));
    const input = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(input.checked).toBe(true);
  });

  it('dateField renders a native date input', async () => {
    await mount(dateField({ name: 'dueDate', value: '2026-08-15' }));

    const input = container.querySelector('input[type="date"]') as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.value).toBe('2026-08-15');
  });

  it('dateField with includeTime renders a native datetime-local input', async () => {
    await mount(dateField({ name: 'archivedAt', value: '2026-08-15T10:30', includeTime: true }));

    const input = container.querySelector('input[type="datetime-local"]') as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.value).toBe('2026-08-15T10:30');
  });
});
