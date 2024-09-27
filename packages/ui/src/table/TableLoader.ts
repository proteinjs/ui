import { v1 as uuidv1 } from 'uuid';

export type RowWindow<T> = {
  rows: T[];
  totalCount: number;
};

export function generateDefaultReactQueryKeys(): ReactQueryKeys {
  return {
    dataKey: uuidv1(),
    dataQueryKey: uuidv1(),
  };
}

export type ReactQueryKeys = {
  /** Unique name of data set */
  dataKey: string;
  /** Unique name to differentiate between queries on the data set */
  dataQueryKey: string;
};

export interface TableLoader<T> {
  /**
   * Query keys are used in React Query to uniquely identify and manage cached data fetched from an API.
   * If you do not want to set your own query keys, extend `BaseTableLoader` and it will implement defaults for you.
   * */
  reactQueryKeys: ReactQueryKeys;
  load: (startIndex: number, endIndex: number, skipRowCount?: boolean) => Promise<RowWindow<T>>;
}

export abstract class BaseTableLoader<T> implements TableLoader<T> {
  readonly reactQueryKeys: ReactQueryKeys;

  constructor() {
    this.reactQueryKeys = generateDefaultReactQueryKeys();
  }

  abstract load(startIndex: number, endIndex: number, skipRowCount?: boolean): Promise<RowWindow<T>>;
}

export class StaticTableLoader<T> implements TableLoader<T> {
  constructor(
    private list: T[],
    public reactQueryKeys: TableLoader<T>['reactQueryKeys']
  ) {
    if (!this.reactQueryKeys) {
      this.reactQueryKeys = generateDefaultReactQueryKeys();
    }
  }

  async load(startIndex: number, endIndex: number) {
    return {
      rows: this.list.slice(startIndex, endIndex),
      totalCount: this.list.length,
    };
  }
}
