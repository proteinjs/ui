import React from 'react';
import { Fields } from './Field';

export type FormButton<F extends Fields> = {
  name: string;
  accessibility?: {
    disabled?: boolean;
    hidden?: boolean;
  };
  style: {
    color?: 'inherit' | 'primary' | 'success' | 'warning' | 'secondary' | 'error' | 'info';
    variant?: 'text' | 'outlined' | 'contained';
    icon?: React.ComponentType;
  };
  clearFormOnClick?: boolean;
  redirect?: (fields: F, buttons: FormButtons<F>) => Promise<{ path: string; props?: { [key: string]: any } }>;
  onClick?: (fields: F, buttons: FormButtons<F>) => Promise<string | void>;
  progressMessage?: (fields: F) => string;
};

export abstract class FormButtons<F extends Fields> {
  [name: string]: FormButton<F>;
}

export const clearButton: FormButton<any> = {
  name: 'Clear',
  style: {
    color: 'primary',
    variant: 'text',
  },
  clearFormOnClick: true,
};
