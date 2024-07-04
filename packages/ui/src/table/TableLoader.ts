export type RowWindow<T> = {
  rows: T[];
  totalCount: number;
};

export type TableLoader<T> = {
  // TODO: make this optional
  reactQueryKeys: {
    /** Unique name of data set */
    dataKey: string;
    /** Unique name to differentiate between queries on the data set */
    dataQueryKey: string;
  };
  load: (startIndex: number, endIndex: number) => Promise<RowWindow<T>>;
};

export class StaticTableLoader<T> implements TableLoader<T> {
  constructor(
    private list: T[],
    public reactQueryKeys: TableLoader<T>['reactQueryKeys']
  ) {}

  async load(startIndex: number, endIndex: number) {
    return {
      rows: this.list.slice(startIndex, endIndex),
      totalCount: this.list.length,
    };
  }
}
