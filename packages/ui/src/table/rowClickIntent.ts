/**
 * Distinguishes "the user clicked this row" from "the user was selecting text in this row".
 *
 * Clickable table rows make text unselectable: press, drag across a cell, release — and the browser
 * fires a `click` on the row, so the row's action (usually navigation) runs and the selection is
 * thrown away. Copying a value out of a cell becomes impossible.
 *
 * The decision is kept as a pure function so it can be tested without a DOM, and so the row
 * component stays a thin wiring layer over it.
 */

/**
 * Pointer travel (in CSS px) between `pointerdown` and `click` that still counts as a click.
 * Small enough that a real drag is never mistaken for a click, large enough to tolerate the
 * few pixels of movement in an ordinary click (especially on a trackpad or touch).
 */
export const ROW_CLICK_DRAG_THRESHOLD_PX = 5;

export type PointerPosition = {
  x: number;
  y: number;
};

export type RowClickIntent = {
  /**
   * Pointer position at `pointerdown`. Absent when the click did not originate from a pointer
   * gesture at all — a keyboard activation (Enter/Space on a focused row) or a programmatic
   * `.click()` produces a click with no preceding pointerdown, and those are always real clicks.
   */
  pointerDownAt?: PointerPosition;
  /** Pointer position at `click`. */
  clickAt: PointerPosition;
  /** True when a non-collapsed text selection currently sits inside the clicked row. */
  hasTextSelectionInRow: boolean;
};

/**
 * Returns true when a row's click action should run.
 *
 * Two independent signals suppress it, because neither covers the other:
 * - an active text selection inside the row (the user selected something and released here)
 * - pointer travel past the drag threshold (a drag that produced no selection, e.g. across a
 *   checkbox or an empty cell, which would otherwise navigate on release)
 */
export function shouldRunRowClickAction(intent: RowClickIntent): boolean {
  if (intent.hasTextSelectionInRow) {
    return false;
  }

  if (!intent.pointerDownAt) {
    return true;
  }

  return pointerTravel(intent.pointerDownAt, intent.clickAt) <= ROW_CLICK_DRAG_THRESHOLD_PX;
}

function pointerTravel(from: PointerPosition, to: PointerPosition): number {
  return Math.hypot(to.x - from.x, to.y - from.y);
}

/**
 * Reads whether the current document selection is a non-collapsed range anchored inside `row`.
 *
 * Anchoring matters: with text selected in row A, clicking row B should still open row B. Only the
 * row the selection actually lives in suppresses its own click.
 */
export function hasTextSelectionInRow(row: Node | null, selection: Selection | null): boolean {
  if (!row || !selection || selection.isCollapsed || selection.rangeCount === 0) {
    return false;
  }

  return row.contains(selection.anchorNode) || row.contains(selection.focusNode);
}
