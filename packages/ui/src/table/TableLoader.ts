export type RowWindow<T> = {
  rows: T[],
  totalCount: number,
}

export type TableLoader<T> = {
  load: (startIndex: number, endIndex: number) => Promise<RowWindow<T>>,
}

export class StaticTableLoader<T> implements TableLoader<T> {
  constructor(private list: T[]) {}

  async load(startIndex: number, endIndex: number) {
    return {
      rows: this.list.slice(startIndex, endIndex),
      totalCount: this.list.length,
    };
  }
}