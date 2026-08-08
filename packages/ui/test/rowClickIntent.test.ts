import {
  hasTextSelectionInRow,
  ROW_CLICK_DRAG_THRESHOLD_PX,
  shouldRunRowClickAction,
} from '../src/table/rowClickIntent';

/**
 * Guards the click-vs-selection decision for clickable table rows.
 *
 * The bug: a clickable row runs its action on any click, so press-drag-release to select text in a
 * cell navigates away and discards the selection — text in a record table cannot be copied.
 *
 * These are the outcomes that matter: a drag never runs the action, a plain click always does, and
 * a selection living in *this* row suppresses only this row's action.
 */

const at = (x: number, y: number) => ({ x, y });

describe('shouldRunRowClickAction', () => {
  it('runs the action for a click that did not move', () => {
    expect(
      shouldRunRowClickAction({
        pointerDownAt: at(100, 100),
        clickAt: at(100, 100),
        hasTextSelectionInRow: false,
      })
    ).toBe(true);
  });

  it('runs the action for the small jitter of an ordinary click', () => {
    expect(
      shouldRunRowClickAction({
        pointerDownAt: at(100, 100),
        clickAt: at(102, 101),
        hasTextSelectionInRow: false,
      })
    ).toBe(true);
  });

  it('runs the action exactly at the drag threshold', () => {
    expect(
      shouldRunRowClickAction({
        pointerDownAt: at(100, 100),
        clickAt: at(100 + ROW_CLICK_DRAG_THRESHOLD_PX, 100),
        hasTextSelectionInRow: false,
      })
    ).toBe(true);
  });

  it('suppresses the action for a horizontal drag across a cell', () => {
    expect(
      shouldRunRowClickAction({
        pointerDownAt: at(100, 100),
        clickAt: at(180, 100),
        hasTextSelectionInRow: false,
      })
    ).toBe(false);
  });

  it('suppresses the action just past the drag threshold', () => {
    expect(
      shouldRunRowClickAction({
        pointerDownAt: at(100, 100),
        clickAt: at(100 + ROW_CLICK_DRAG_THRESHOLD_PX + 1, 100),
        hasTextSelectionInRow: false,
      })
    ).toBe(false);
  });

  it('measures travel diagonally, not per-axis', () => {
    // 4px on each axis is under the threshold per-axis but ~5.66px of actual travel.
    expect(
      shouldRunRowClickAction({
        pointerDownAt: at(100, 100),
        clickAt: at(104, 104),
        hasTextSelectionInRow: false,
      })
    ).toBe(false);
  });

  it('suppresses the action when text is selected in the row, even without pointer travel', () => {
    // A double-click selects a word with no measurable drag; the click must not navigate away.
    expect(
      shouldRunRowClickAction({
        pointerDownAt: at(100, 100),
        clickAt: at(100, 100),
        hasTextSelectionInRow: true,
      })
    ).toBe(false);
  });

  it('runs the action for a keyboard or programmatic click, which has no pointerdown', () => {
    expect(
      shouldRunRowClickAction({
        pointerDownAt: undefined,
        clickAt: at(0, 0),
        hasTextSelectionInRow: false,
      })
    ).toBe(true);
  });
});

describe('hasTextSelectionInRow', () => {
  /** Minimal Node stand-ins: `contains` is the only thing the function asks of the row. */
  const node = (name: string) => ({ name }) as unknown as Node;

  const rowContaining = (...descendants: Node[]) =>
    ({
      contains: (candidate: Node | null) => !!candidate && descendants.includes(candidate),
    }) as unknown as Node;

  const selection = (overrides: Partial<Selection>) =>
    ({
      isCollapsed: false,
      rangeCount: 1,
      anchorNode: null,
      focusNode: null,
      ...overrides,
    }) as unknown as Selection;

  it('reports a selection anchored inside the row', () => {
    const cell = node('cell');
    expect(hasTextSelectionInRow(rowContaining(cell), selection({ anchorNode: cell, focusNode: cell }))).toBe(true);
  });

  it('reports a selection that started in the row and ran outside it', () => {
    const cell = node('cell');
    expect(
      hasTextSelectionInRow(rowContaining(cell), selection({ anchorNode: cell, focusNode: node('elsewhere') }))
    ).toBe(true);
  });

  it('reports a selection dragged backwards, ending in the row', () => {
    // Selecting upward from a lower row puts the anchor outside and the focus inside this row.
    const cell = node('cell');
    expect(
      hasTextSelectionInRow(rowContaining(cell), selection({ anchorNode: node('elsewhere'), focusNode: cell }))
    ).toBe(true);
  });

  it('ignores a selection living in a different row, so that row still opens', () => {
    expect(
      hasTextSelectionInRow(
        rowContaining(node('my-cell')),
        selection({ anchorNode: node('other-row-cell'), focusNode: node('other-row-cell') })
      )
    ).toBe(false);
  });

  it('ignores a collapsed selection (a caret is not a selection)', () => {
    const cell = node('cell');
    expect(
      hasTextSelectionInRow(rowContaining(cell), selection({ isCollapsed: true, anchorNode: cell, focusNode: cell }))
    ).toBe(false);
  });

  it('ignores an empty selection and a missing row', () => {
    expect(hasTextSelectionInRow(rowContaining(), selection({ rangeCount: 0 }))).toBe(false);
    expect(hasTextSelectionInRow(null, selection({}))).toBe(false);
    expect(hasTextSelectionInRow(rowContaining(), null)).toBe(false);
  });
});
