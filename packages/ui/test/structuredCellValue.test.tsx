/**
 * @jest-environment jsdom
 *
 * Structured values as CONTENT (founder, R7 round 3: an object in a column "should display that
 * as content, but leverage the content size scalability features of the ui to not be a problem
 * if it's large"). Contract:
 *  1. The entry grammar: one line per top-level key (or array item); nested values read as a
 *     one-line summary (scalars, `—`, the first items of a scalar array, an array's count, an
 *     object's key names); a JSON string is read as its value.
 *  2. The cell renders those lines — never `[object Object]`, never one mono blob — collapsed to
 *     three at rest with "Show more (n)"; Show more expands IN PLACE and never fires the row's
 *     click; Show less collapses again. The whole JSON rides the title; null is the quiet dash.
 */
import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { JsonSnippetCellValue, STRUCTURED_CELL_COLLAPSED_LINES, structuredEntries } from '../src/table/cellValues';

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const proposal = {
  id: 'gpt-6',
  name: 'GPT-6',
  provider: 'openai',
  reasoningEfforts: ['auto', 'high'],
  pricing: { standard: { inputUsdPer1M: 1, outputUsdPer1M: 2 }, cached: null },
  notes: null,
  sources: [{ url: 'https://a' }, { url: 'https://b' }],
};

describe('structuredEntries — the entry grammar', () => {
  it('objects: one entry per top-level key; nested values summarize on one line', () => {
    expect(structuredEntries(proposal)).toEqual([
      { key: 'id', text: 'gpt-6' },
      { key: 'name', text: 'GPT-6' },
      { key: 'provider', text: 'openai' },
      { key: 'reasoningEfforts', text: 'auto, high' },
      { key: 'pricing', text: '{ standard, cached }' },
      { key: 'notes', text: '—' },
      { key: 'sources', text: '2 items' },
    ]);
  });

  it('arrays: one entry per item; scalar arrays cap at four; a JSON string reads as its value; a plain string is one line', () => {
    expect(structuredEntries(['a', 'b'])).toEqual([{ text: 'a' }, { text: 'b' }]);
    expect(structuredEntries({ tags: ['a', 'b', 'c', 'd', 'e', 'f'] })).toEqual([
      { key: 'tags', text: 'a, b, c, d, +2 more' },
    ]);
    expect(structuredEntries({ wide: { a: 1, b: 2, c: 3, d: 4, e: 5 } })).toEqual([
      { key: 'wide', text: '{ a, b, c, d, +1 more }' },
    ]);
    expect(structuredEntries('{"k":1}')).toEqual([{ key: 'k', text: '1' }]);
    expect(structuredEntries('plain text')).toEqual([{ text: 'plain text' }]);
    expect(structuredEntries({ empty: {}, none: [] })).toEqual([
      { key: 'empty', text: '{ }' },
      { key: 'none', text: '[ ]' },
    ]);
  });
});

describe('JsonSnippetCellValue — content sized for a row', () => {
  let container: HTMLDivElement;
  let root: Root;
  const rowClick = jest.fn();

  beforeEach(() => {
    rowClick.mockClear();
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

  const render = async (value: unknown) => {
    await act(async () => {
      root.render(
        // the row: a click anywhere on it navigates — the cell's own control must not
        <div data-row onClick={rowClick}>
          <JsonSnippetCellValue value={value} />
        </div>
      );
    });
  };

  const entries = () =>
    Array.from(container.querySelectorAll('[data-structured-cell-entry]')).map((e) => e.textContent);
  const toggle = () => container.querySelector('[data-structured-cell-toggle]') as HTMLButtonElement | null;
  const click = async (element: Element) => {
    await act(async () => {
      element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
  };

  it('renders one line per key, collapsed to three with "Show more (n)" — never [object Object]', async () => {
    await render(proposal);
    expect(container.textContent).not.toContain('[object Object]');
    expect(entries()).toEqual(['idgpt-6', 'nameGPT-6', 'provideropenai']);
    expect(entries()).toHaveLength(STRUCTURED_CELL_COLLAPSED_LINES);
    expect(toggle()?.textContent).toBe('Show more (4)');
    expect(toggle()?.getAttribute('aria-expanded')).toBe('false');
    expect(container.querySelector('[data-structured-cell]')?.getAttribute('title')).toBe(JSON.stringify(proposal));
  });

  it('Show more expands in place without firing the row click; Show less collapses again', async () => {
    await render(proposal);
    await click(toggle()!);
    expect(entries()).toHaveLength(7);
    expect(entries()[4]).toBe('pricing{ standard, cached }');
    expect(toggle()?.textContent).toBe('Show less');
    expect(rowClick).not.toHaveBeenCalled();

    await click(toggle()!);
    expect(entries()).toHaveLength(STRUCTURED_CELL_COLLAPSED_LINES);
    expect(rowClick).not.toHaveBeenCalled();
  });

  it('a value within three lines has no disclosure; null is the quiet dash', async () => {
    await render({ a: 1, b: 2 });
    expect(entries()).toEqual(['a1', 'b2']);
    expect(toggle()).toBeNull();

    await render(null);
    expect(container.querySelector('[data-structured-cell]')).toBeNull();
    expect(container.textContent).toBe('—');
  });
});
