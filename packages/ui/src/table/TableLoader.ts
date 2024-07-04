import { v1 as uuidv1 } from 'uuid';

export type RowWindow<T> = {
  rows: T[];
  totalCount: number;
};

export type ReactQueryKeys = {
  /** Unique name of data set */
  dataKey: string;
  /** Unique name to differentiate between queries on the data set */
  dataQueryKey: string;
};

export type TableLoader<T> = {
  reactQueryKeys?: ReactQueryKeys;
  load: (startIndex: number, endIndex: number) => Promise<RowWindow<T>>;
};

export function generateDefaultReactQueryKeys(): ReactQueryKeys {
  return {
    dataKey: uuidv1(),
    dataQueryKey: uuidv1(),
  };
}

export class StaticTableLoader<T> implements TableLoader<T> {
  constructor(
    private list: T[],
    public reactQueryKeys?: TableLoader<T>['reactQueryKeys']
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
