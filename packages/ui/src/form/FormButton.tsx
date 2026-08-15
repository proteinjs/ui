import React from 'react';
import { Fields } from './Field';
import { ConfirmationConfig } from '../components/ConfirmationDialog';

export type FormButton<F extends Fields> = {
  name: string;
  accessibility?: {
    disabled?: boolean;
    hidden?: boolean;
  };
  /**
   * When provided, clicking the button opens a confirmation dialog instead of acting; `onClick`,
   * `redirect`, and `clearFormOnClick` only run after the user confirms. Cancelling is a no-op.
   */
  confirm?: (fields: F) => ConfirmationConfig;
  style: {
    color?: 'inherit' | 'primary' | 'success' | 'warning' | 'secondary' | 'error' | 'info';
    variant?: 'text' | 'outlined' | 'contained';
    align?: 'right' | 'left';
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
