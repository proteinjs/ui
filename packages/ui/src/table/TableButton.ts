import React from 'react';
import { NavigateFunction } from 'react-router';
import { ConfirmationConfig } from '../components/ConfirmationDialog';

export type TableButton<T> = {
  name: string;
  icon: React.ComponentType;
  visibility: {
    showWhenRowsSelected: boolean;
    showWhenNoRowsSelected: boolean;
  };
  /**
   * When provided, clicking the button opens a confirmation dialog instead of acting; `onClick`
   * only runs after the user confirms. Cancelling is a no-op. Receives the rows the click would
   * act on (empty when shown with no selection).
   */
  confirm?: (selectedRows: T[]) => ConfirmationConfig;
  onClick: (selectedRows: T[], navigate: NavigateFunction) => Promise<void>;
};
