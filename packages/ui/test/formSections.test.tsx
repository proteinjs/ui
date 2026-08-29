/**
 * @jest-environment jsdom
 *
 * Form sections (round 2): fieldLayout accepts FormFieldSection[] — labeled groups of field
 * rows. Sections render in order with their quiet labels; flat layouts (the pre-section
 * contract) still render as one unlabeled section; phone collapses rows to single-column
 * WITHIN sections so grouping survives the form factor.
 */
import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';
import { FormComponent, FormFieldSection } from '../src/form/Form';
import { textField } from '../src/form/fields/TextField';
import type { Fields } from '../src/form/Field';
import type { FormButtons } from '../src/form/FormButton';

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('form sections', () => {
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

  const createFields = () => ({
    name: textField({ name: 'name', value: 'A record' }),
    description: textField({ name: 'description', value: 'About it', multiline: true }),
    status: textField({ name: 'status', value: 'active' }),
    duration: textField({ name: 'duration', value: '4s' }),
  });

  const buttons: FormButtons<Fields> = {};

  const mount = async (fieldLayout: any, isPhone = false) => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <FormComponent
            createFields={createFields as any}
            fieldLayout={fieldLayout}
            buttons={buttons}
            isPhone={isPhone}
          />
        </MemoryRouter>
      );
    });
  };

  const sectionedLayout: FormFieldSection<any>[] = [
    { fields: ['name'] },
    { label: 'Content', fields: ['description'] },
    { label: 'Details', fields: [['status', 'duration']] },
  ];

  it('renders sections in order with their labels; the unlabeled identity section has none', async () => {
    await mount(sectionedLayout);

    const sections = Array.from(container.querySelectorAll('[data-form-section]'));
    expect(sections.length).toBe(3);

    const labels = Array.from(container.querySelectorAll('[data-form-section-label]')).map((el) => el.textContent);
    expect(labels).toEqual(['Content', 'Details']);

    // Order: the identity section (no label) leads, then Content, then Details.
    expect(sections[0].querySelector('[data-form-section-label]')).toBeNull();
    expect(sections[1].textContent).toContain('Content');
    expect(sections[2].textContent).toContain('Details');
  });

  it('multi-field rows inside a section share one row', async () => {
    await mount(sectionedLayout);

    const detailsSection = Array.from(container.querySelectorAll('[data-form-section]'))[2];
    const rows = detailsSection.querySelectorAll('[data-form-field-row]');
    expect(rows.length).toBe(1);
    expect(rows[0].querySelectorAll('input').length).toBe(2);
  });

  it('phone collapses rows to single-column WITHIN sections — grouping survives', async () => {
    await mount(sectionedLayout, true);

    const sections = Array.from(container.querySelectorAll('[data-form-section]'));
    expect(sections.length).toBe(3);
    // The section LABELS survive the phone fork — a collapsed layout is still grouped.
    expect(Array.from(container.querySelectorAll('[data-form-section-label]')).map((el) => el.textContent)).toEqual([
      'Content',
      'Details',
    ]);
    const detailsSection = sections[2];
    // The two-column details row splits into two single-field rows, still inside Details.
    expect(detailsSection.textContent).toContain('Details');
    expect(detailsSection.querySelectorAll('[data-form-field-row]').length).toBe(2);
  });

  it('flat layouts (the pre-section contract) still render, as one unlabeled section', async () => {
    await mount(['name', 'status']);

    expect(container.querySelectorAll('[data-form-section]').length).toBe(1);
    expect(container.querySelectorAll('[data-form-section-label]').length).toBe(0);
    expect(container.querySelectorAll('[data-form-field-row]').length).toBe(2);
  });
});
