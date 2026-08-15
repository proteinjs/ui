/**
 * @jest-environment jsdom
 *
 * Double-submit guard (admin record surfaces, task #53 part 2, item 1): Form showed progress
 * during a button's in-flight promise but never disabled the buttons, so two rapid clicks on
 * Save/Create/Delete ran the service call twice. Contract: while a button action is in flight,
 * buttons are disabled and a second click is a no-op — a click acts exactly once (outcome:
 * one service call). Also covers item 4: the status line renders as a MUI Alert whose severity
 * comes from the status (error vs success).
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

describe('Form button actions', () => {
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
        <MemoryRouter>
          <Form
            name='Test form'
            createFields={() => ({ title: textField({ name: 'title', layout: { row: 0, width: 12 } }) })}
            buttons={buttons}
          />
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

  const click = async (element: Element) => {
    await act(async () => {
      element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
  };

  it('runs the action exactly once for two rapid clicks (the double-submit repro)', async () => {
    let releaseAction!: () => void;
    const serviceCall = jest.fn(
      () =>
        new Promise<string>((resolve) => {
          releaseAction = () => resolve('Saved');
        })
    );
    await mount({ save: { name: 'Save', style: {}, onClick: serviceCall } });

    const saveButton = findButton('Save');
    await click(saveButton);
    await click(saveButton);

    expect(serviceCall).toHaveBeenCalledTimes(1);
    expect(saveButton.disabled).toBe(true);

    await act(async () => {
      releaseAction();
    });
    expect(findButton('Save').disabled).toBe(false);
  });

  it('disables every button while any action is in flight', async () => {
    let releaseAction!: () => void;
    const save = jest.fn(() => new Promise<void>((resolve) => (releaseAction = () => resolve())));
    const del = jest.fn(async () => undefined);
    await mount({
      save: { name: 'Save', style: {}, onClick: save },
      delete: { name: 'Delete', style: {}, onClick: del },
    });

    await click(findButton('Save'));
    expect(findButton('Delete').disabled).toBe(true);
    await click(findButton('Delete'));
    expect(del).not.toHaveBeenCalled();

    await act(async () => {
      releaseAction();
    });
    expect(findButton('Delete').disabled).toBe(false);
  });

  it('allows a second action after the first completes (the guard resets)', async () => {
    const serviceCall = jest.fn(async () => 'Saved');
    await mount({ save: { name: 'Save', style: {}, onClick: serviceCall } });

    await click(findButton('Save'));
    await click(findButton('Save'));

    expect(serviceCall).toHaveBeenCalledTimes(2);
  });

  it('renders a success status as a success Alert', async () => {
    await mount({ save: { name: 'Save', style: {}, onClick: async () => 'Saved the record' } });

    await click(findButton('Save'));

    const alert = document.querySelector('.MuiAlert-standardSuccess');
    expect(alert).not.toBeNull();
    expect(alert!.textContent).toContain('Saved the record');
  });

  it('renders a thrown error as an error Alert', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    await mount({
      save: {
        name: 'Save',
        style: {},
        onClick: async () => {
          throw new Error('write rejected');
        },
      },
    });

    await click(findButton('Save'));

    const alert = document.querySelector('.MuiAlert-standardError');
    expect(alert).not.toBeNull();
    expect(alert!.textContent).toContain('write rejected');
    consoleError.mockRestore();
  });
});
