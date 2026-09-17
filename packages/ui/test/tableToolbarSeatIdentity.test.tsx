/**
 * @jest-environment jsdom
 *
 * The toolbar's action seat keeps its ELEMENT IDENTITY across the toolbar's re-renders. The
 * table re-renders on every data or layout state change; a seat whose buttons are unmounted and
 * remounted on each of those loses the pointer mid-click (mousedown on one node, mouseup on its
 * replacement — the browser fires no click) and drops the button's focus. Asserted as DOM
 * identity, focus survival, and a click that straddles a re-render still acting.
 */
import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';
import { Add } from '@mui/icons-material';
import { TableToolbar } from '../src/table/TableToolbar';
import type { TableButton } from '../src/table/TableButton';

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

type Row = { id: string };

describe('TableToolbar — the action seat survives the toolbar re-rendering', () => {
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

  const createButton = (onClick: jest.Mock): TableButton<Row> => ({
    name: 'Create row',
    icon: Add,
    visibility: { showWhenRowsSelected: false, showWhenNoRowsSelected: true },
    onClick,
  });

  /** Every render hands the toolbar fresh prop values, as a re-rendering table does. */
  const render = async (onClick: jest.Mock) => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <TableToolbar title='Rows' selectedRows={[]} buttons={[createButton(onClick)]} />
        </MemoryRouter>
      );
    });
  };

  const seatButton = () => {
    const button = container.querySelector('button[aria-label="Create row"]');
    if (!button) {
      throw new Error('seat button not rendered');
    }

    return button as HTMLButtonElement;
  };

  const dispatch = async (target: Element, type: string) => {
    await act(async () => {
      target.dispatchEvent(new MouseEvent(type, { bubbles: true }));
    });
  };

  it('a re-render keeps the same button element, and its focus', async () => {
    const onClick = jest.fn(async () => undefined);
    await render(onClick);
    const button = seatButton();
    act(() => {
      button.focus();
    });
    expect(document.activeElement).toBe(button);

    await render(onClick);

    expect(seatButton()).toBe(button);
    expect(document.activeElement).toBe(button);
  });

  it('a click that straddles a re-render still acts (mousedown before, mouseup and click after)', async () => {
    const onClick = jest.fn(async () => undefined);
    await render(onClick);
    const button = seatButton();

    await dispatch(button, 'mousedown');
    await render(onClick);
    await dispatch(button, 'mouseup');
    await dispatch(button, 'click');

    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
