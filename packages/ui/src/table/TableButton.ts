import React from 'react'
import { NavigateFunction } from 'react-router'

export type TableButton<T> = {
  name: string,
  icon: React.ComponentType,
  visibility: {
    showWhenRowsSelected: boolean,
    showWhenNoRowsSelected: boolean,
  },
  onClick: (selectedRows: T[], navigate: NavigateFunction) => Promise<void>,
}