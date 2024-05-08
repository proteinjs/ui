import React from 'react';
import S from 'string';

export type Field<T, F extends Fields> = {
  name: string;
  label?: string;
  description?: string;
  accessibility?: {
    required?: boolean;
    hidden?: boolean;
    readonly?: boolean;
  };
  layout?: {
    row: number;
    column?: number;
    width: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;
  };
  value?: T;
  displayValue?: (value: T) => string;
  onLoad?: (fields: F) => Promise<void>;
  onChange?: (value: T, fields: F, setFieldStatus: (message: string, isError: boolean) => void) => Promise<void>;
};

export type FieldComponentProps<T, F extends Fields> = {
  field: Field<T, F>;
  onChange: (field: Field<T, F>, value: T, setFieldStatus: (message: string, isError: boolean) => void) => Promise<void>;
  // focused: boolean
};

export type FieldComponent<T, F extends Fields> = {
  field: Field<T, F>;
  component: (props: FieldComponentProps<T, F>) => JSX.Element;
};

export abstract class Fields {
  [name: string]: FieldComponent<any, any>;
}

export function fieldLabel(field: Field<any, any>) {
  return field.label ? field.label : S(field.name).humanize().capitalize().s;
}

export function fieldDisplayValue(field: Field<any, any>) {
  let value = '';
  if (field.value) {
    if (field.displayValue) value = field.displayValue(field.value);
    else value = field.value;
  }

  return value;
}
