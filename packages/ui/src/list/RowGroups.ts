/** One consecutive run of rows sharing a group key. */
export type RowGroup<T> = {
  key: string;
  /** React key: the group key, disambiguated only when the same key recurs non-adjacently. */
  reactKey: string;
  rows: T[];
  /** The full-list index of the group's first row (threads `renderRow`'s global index). */
  startIndex: number;
};

/**
 * The one grouping rule of the list and the table: rows next to each other that share a key are one group, and a
 * key that comes back later is its own group (its own React identity, never merged into the earlier run and never
 * a duplicate key). The input order is the render order. Not exported from the package: the list and the table are
 * its readers.
 */
export class RowGroups {
  static consecutive<T>(rows: T[], groupKey: (row: T) => string): RowGroup<T>[] {
    const groups: RowGroup<T>[] = [];
    const runCounts: { [key: string]: number } = {};
    rows.forEach((row, index) => {
      const key = groupKey(row);
      const lastGroup = groups[groups.length - 1];
      if (lastGroup && lastGroup.key === key) {
        lastGroup.rows.push(row);
        return;
      }
      const runCount = (runCounts[key] = (runCounts[key] ?? 0) + 1);
      groups.push({ key, reactKey: runCount === 1 ? key : `${key}#${runCount}`, rows: [row], startIndex: index });
    });
    return groups;
  }
}
