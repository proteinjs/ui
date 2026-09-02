/**
 * @jest-environment jsdom
 *
 * Identifier-like text in a table cell wraps at its humps, never mid-word (founder finding
 * 2026-09-02, the Migrations table's new Name column: "BackfillUserStatusActive" rendered as
 * "Backfill / UserSt / atusA…" in a narrow column — the clamped cell's `overflow-wrap:
 * anywhere` last resort was the only break opportunity a class name offered). Contract as a
 * rendered OUTCOME: camelCase / snake_case / dotted tokens carry `<wbr>` opportunities before
 * each hump and after each separator; the textContent (copy, search) is byte-identical; prose
 * and hump-less runs are untouched (the anywhere fallback still guards genuinely unbreakable
 * runs such as URLs).
 */
import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { ClampedTextCellValue } from '../src/table/cellValues';

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('ClampedTextCellValue identifier break opportunities', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const render = async (text: string) => {
    await act(async () => {
      root.render(<ClampedTextCellValue>{text}</ClampedTextCellValue>);
    });
    return container.firstElementChild as HTMLElement;
  };

  it('a camelCase class name breaks at its humps — text content unchanged', async () => {
    const cell = await render('BackfillUserStatusActive');
    expect(cell.textContent).toBe('BackfillUserStatusActive');
    expect(cell.querySelectorAll('wbr')).toHaveLength(3);
  });

  it('each hump segment is an unbreakable atom, so a column is never narrower than its longest segment', async () => {
    // Without this the table's auto layout, seeing a break opportunity at every character
    // (the anywhere fallback), sized the Name column one character wide: "Truncat / e / Thou…".
    const cell = await render('TruncateThoughtCache');
    const atoms = Array.from(cell.querySelectorAll('span')).filter((span) => span.style.whiteSpace === 'nowrap');
    expect(atoms.map((atom) => atom.textContent)).toEqual(['Truncate', 'Thought', 'Cache']);
    // A pathological hump-less run inside an identifier stays breakable (no atom past the cap).
    const long = await render(`Backfill_${'a'.repeat(40)}`);
    const longAtoms = Array.from(long.querySelectorAll('span')).filter((span) => span.style.whiteSpace === 'nowrap');
    expect(longAtoms.map((atom) => atom.textContent)).toEqual(['Backfill_']);
  });

  it('snake_case and dotted names break after each separator', async () => {
    const cell = await render('agent_edit_note_title');
    expect(cell.textContent).toBe('agent_edit_note_title');
    expect(cell.querySelectorAll('wbr')).toHaveLength(3);
    const dotted = await render('@n3xa/app-server/BackfillOnboardingState');
    expect(dotted.textContent).toBe('@n3xa/app-server/BackfillOnboardingState');
    expect(dotted.querySelectorAll('wbr').length).toBeGreaterThanOrEqual(4);
  });

  it('prose, short words and hump-less runs are untouched', async () => {
    expect((await render('Truncate the cache table for every space')).querySelectorAll('wbr')).toHaveLength(0);
    expect((await render('isRoot')).querySelectorAll('wbr')).toHaveLength(0);
    expect((await render('a'.repeat(40))).querySelectorAll('wbr')).toHaveLength(0);
  });

  it('an identifier inside prose still gains its break (copy stays identical)', async () => {
    const cell = await render('Truncate the thought_cache_table now');
    expect(cell.textContent).toBe('Truncate the thought_cache_table now');
    expect(cell.querySelectorAll('wbr')).toHaveLength(2);
  });
});
