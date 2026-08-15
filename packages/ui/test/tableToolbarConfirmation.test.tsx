/**
 * @jest-environment jsdom
 *
 * Confirmation gating at the TableToolbar layer (task #53 part 2, item 2): a TableButton that
 * declares `confirm` must not act on click — the toolbar opens a ConfirmationDialog and only its
 * confirm runs the button's onClick, on the rows captured at click time. This is the seam behind
 * the record table's bulk-delete, which previously deleted the selected rows immediately.
 */
import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';
import { Delete } from '@mui/icons-material';
import { TableToolbar } from '../src/table/TableToolbar';
import type { TableButton } from '../src/table/TableButton';

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

type Row = { id: string };

describe('TableToolbar confirmation gating', () => {
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

  const mount = async (button: TableButton<Row>, selectedRows: Row[]) => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <TableToolbar title='Users' selectedRows={selectedRows} buttons={[button]} />
        </MemoryRouter>
      );
    });
  };

  const toolbarButton = (name: string) => {
    const button = document.querySelector(`button[aria-label="${name}"]`);
    if (!button) {
      throw new Error(`Toolbar button not rendered: ${name}`);
    }

    return button;
  };

  const dialog = () => document.querySelector('[role="dialog"]');

  const click = async (element: Element) => {
    await act(async () => {
      element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
  };

  const deleteButton = (onClick: jest.Mock): TableButton<Row> => ({
    name: 'Delete selected rows',
    icon: Delete,
    visibility: { showWhenRowsSelected: true, showWhenNoRowsSelected: false },
    confirm: (selectedRows) => ({
      title: `Delete ${selectedRows.length} rows?`,
      confirmButtonText: 'Delete',
    }),
    onClick,
  });

  it('acts only after confirm, on the rows captured at click (the immediate bulk-delete repro)', async () => {
    const serviceCall: jest.Mock = jest.fn(async () => undefined);
    const rows = [{ id: 'a' }, { id: 'b' }];
    await mount(deleteButton(serviceCall), rows);

    await click(toolbarButton('Delete selected rows'));
    expect(serviceCall).not.toHaveBeenCalled();
    expect(dialog()).not.toBeNull();
    expect(dialog()!.textContent).toContain('Delete 2 rows?');

    const confirm = Array.from(dialog()!.querySelectorAll('button')).find((b) => b.textContent === 'Delete')!;
    await click(confirm);

    expect(serviceCall).toHaveBeenCalledTimes(1);
    expect(serviceCall.mock.calls[0][0]).toEqual(rows);
    expect(dialog()).toBeNull();
  });

  it('cancel is a no-op', async () => {
    const serviceCall = jest.fn(async () => undefined);
    await mount(deleteButton(serviceCall), [{ id: 'a' }]);

    await click(toolbarButton('Delete selected rows'));
    const cancel = Array.from(dialog()!.querySelectorAll('button')).find((b) => b.textContent === 'Cancel')!;
    await click(cancel);

    expect(serviceCall).not.toHaveBeenCalled();
    expect(dialog()).toBeNull();
  });

  it('buttons without confirm act immediately', async () => {
    const serviceCall = jest.fn(async () => undefined);
    const button: TableButton<Row> = {
      name: 'Delete selected rows',
      icon: Delete,
      visibility: { showWhenRowsSelected: true, showWhenNoRowsSelected: false },
      onClick: serviceCall,
    };
    await mount(button, [{ id: 'a' }]);

    await click(toolbarButton('Delete selected rows'));

    expect(serviceCall).toHaveBeenCalledTimes(1);
    expect(dialog()).toBeNull();
  });
});
