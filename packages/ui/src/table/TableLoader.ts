export type RowWindow<T> = {
  rows: T[];
  totalCount: number;
};

export type TableLoader<T> = {
  reactQueryKeys: {
    /** Unique name of data set */
    dataKey: string;
    /** Unique name of the query applied to the data */
    dataQueryKey: string;
    /** Unique property of each row object */
    rowKey: string;
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
