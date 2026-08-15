/**
 * @jest-environment jsdom
 *
 * Confirmation gating at the Form layer (task #53 part 2, item 2): a FormButton that declares
 * `confirm` must not act on click — the click opens a ConfirmationDialog, and only the dialog's
 * confirm runs the button's onClick/redirect. Cancel is a full no-op (no service call AND no
 * redirect — the reason this gate lives in Form: onClick-level confirmation could not stop the
 * unconditional redirect that follows).
 */
import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { Form } from '../src/form/Form';
import { textField } from '../src/form/fields/TextField';

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const LocationProbe = () => {
  const location = useLocation();
  return <div data-testid='location-probe'>{location.pathname}</div>;
};

describe('Form confirmation gating', () => {
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

  const mount = async (buttons: any) => {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/record/form']}>
          <Form
            name='Test form'
            createFields={() => ({ title: textField({ name: 'title', layout: { row: 0, width: 12 } }) })}
            buttons={buttons}
          />
          <LocationProbe />
        </MemoryRouter>
      );
    });
  };

  const findButton = (name: string) => {
    const button = Array.from(document.querySelectorAll('button')).find((b) => b.textContent === name);
    if (!button) {
      throw new Error(`Button not rendered: ${name}`);
    }

    return button;
  };

  const dialog = () => document.querySelector('[role="dialog"]');
  const currentPath = () => document.querySelector('[data-testid="location-probe"]')!.textContent;

  const click = async (element: Element) => {
    await act(async () => {
      element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
  };

  const gatedDeleteButton = (serviceCall: jest.Mock) => ({
    delete: {
      name: 'Delete',
      style: {},
      confirm: () => ({ title: 'Delete this record?', confirmButtonText: 'Delete' }),
      onClick: serviceCall,
      redirect: async () => ({ path: '/record/table' }),
    },
  });

  it('does not act on click; the action runs only after the dialog confirms (the immediate-delete repro)', async () => {
    const serviceCall = jest.fn(async () => 'Deleted');
    await mount(gatedDeleteButton(serviceCall));

    await click(findButton('Delete'));
    expect(serviceCall).not.toHaveBeenCalled();
    expect(dialog()).not.toBeNull();
    expect(dialog()!.textContent).toContain('Delete this record?');

    await click(dialogConfirmButton());
    expect(serviceCall).toHaveBeenCalledTimes(1);
    expect(dialog()).toBeNull();
    expect(currentPath()).toBe('/record/table');
  });

  it('cancel is a no-op: no service call, no redirect', async () => {
    const serviceCall = jest.fn(async () => 'Deleted');
    await mount(gatedDeleteButton(serviceCall));

    await click(findButton('Delete'));
    await click(dialogCancelButton());

    expect(serviceCall).not.toHaveBeenCalled();
    expect(dialog()).toBeNull();
    expect(currentPath()).toBe('/record/form');
  });

  it('buttons without confirm act immediately (no gate for ungated actions)', async () => {
    const serviceCall = jest.fn(async () => 'Saved');
    await mount({ save: { name: 'Save', style: {}, onClick: serviceCall } });

    await click(findButton('Save'));

    expect(serviceCall).toHaveBeenCalledTimes(1);
    expect(dialog()).toBeNull();
  });

  function dialogConfirmButton() {
    const buttons = Array.from(dialog()!.querySelectorAll('button'));
    const confirm = buttons.find((b) => b.textContent === 'Delete');
    if (!confirm) {
      throw new Error('Confirm button not rendered in dialog');
    }

    return confirm;
  }

  function dialogCancelButton() {
    const buttons = Array.from(dialog()!.querySelectorAll('button'));
    const cancel = buttons.find((b) => b.textContent === 'Cancel');
    if (!cancel) {
      throw new Error('Cancel button not rendered in dialog');
    }

    return cancel;
  }
});
