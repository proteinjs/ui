/**
 * @jest-environment jsdom
 *
 * Form's phone layout (task #53: admin surfaces work on mobile). Below the phone line the form
 * presents single-column: every field takes its own full-width row (a 2-col fieldLayout
 * collapses in order), the container narrows to the xs cap, and the action row becomes ONE
 * wrapping stack (the desktop xs=6 halves overflowed a 375px screen with three buttons).
 * Desktop keeps the multi-column layout and split button halves unchanged.
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

let phoneMode = true;
beforeAll(() => {
  (window as any).matchMedia = (query: string) => ({
    matches: phoneMode,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  });
});

/** Emotion under jest injects rules via CSSOM; collect the cssText of rules targeting the
 *  element's generated classes so style assertions read the ACTUAL styles. */
const cssFor = (el: Element): string => {
  const classes = Array.from(el.classList).filter((cls) => cls.startsWith('css-'));
  const out: string[] = [];
  Array.from(document.querySelectorAll('style')).forEach((styleEl) => {
    const rules = styleEl.sheet?.cssRules ?? ([] as unknown as CSSRuleList);
    Array.from(rules).forEach((rule) => {
      if (classes.some((cls) => rule.cssText.includes(`.${cls}`))) {
        out.push(rule.cssText);
      }
    });
  });
  return out.join('\n');
};

describe('Form phone layout', () => {
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

  const mount = async () => {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/record/form']}>
          <Form
            name='Migration'
            createFields={() => ({
              a: textField({ name: 'a' }),
              b: textField({ name: 'b' }),
              c: textField({ name: 'c' }),
              d: textField({ name: 'd' }),
            })}
            fieldLayout={[
              ['a', 'b'],
              ['c', 'd'],
            ]}
            buttons={{
              retire: { name: 'Retire', style: { variant: 'text' }, onClick: async () => 'Retired' },
              run: { name: 'Run', style: {}, onClick: async () => 'Started migration' },
              save: { name: 'Save', style: {}, onClick: async () => 'Saved' },
            }}
          />
        </MemoryRouter>
      );
    });
  };

  const fieldRows = () => Array.from(container.querySelectorAll('[data-form-field-row]'));
  const inputsIn = (row: Element) => row.querySelectorAll('input').length;

  it('phone: every field takes its own row (the 2-col layout collapses in order)', async () => {
    phoneMode = true;
    await mount();
    const rows = fieldRows();
    expect(rows.length).toBe(4);
    rows.forEach((row) => expect(inputsIn(row)).toBe(1));
  });

  it('phone: the container narrows to the xs cap even for a would-be sm layout', async () => {
    phoneMode = true;
    await mount();
    expect(container.querySelector('.MuiContainer-maxWidthXs')).toBeTruthy();
    expect(container.querySelector('.MuiContainer-maxWidthSm')).toBeNull();
  });

  it('phone: the action row is ONE wrapping stack, not xs=6 halves', async () => {
    phoneMode = true;
    await mount();
    const stack = container.querySelector('[data-form-buttons]') as HTMLElement;
    expect(stack).toBeTruthy();
    expect(cssFor(stack)).toContain('flex-wrap: wrap');
    // all three buttons live in the one stack
    const names = Array.from(stack.querySelectorAll('button')).map((b) => b.textContent);
    expect(names).toEqual(['Retire', 'Run', 'Save']);
    // the split halves are gone on the phone face
    expect(container.querySelector('.MuiGrid-grid-xs-6')).toBeNull();
  });

  it('desktop: the multi-column layout and split button halves stay unchanged', async () => {
    phoneMode = false;
    await mount();
    const rows = fieldRows();
    expect(rows.length).toBe(2);
    rows.forEach((row) => expect(inputsIn(row)).toBe(2));
    expect(container.querySelector('.MuiContainer-maxWidthSm')).toBeTruthy();
    expect(container.querySelectorAll('.MuiGrid-grid-xs-6').length).toBe(2);
  });
});
