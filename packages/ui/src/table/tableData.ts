import {
  useQuery,
  useMutation,
  useQueryClient,
  UseQueryResult,
  UseMutationResult,
  useInfiniteQuery,
  UseInfiniteQueryResult,
  QueryFunctionContext,
} from 'react-query';
import { TableLoader, RowWindow } from './TableLoader';
import { useCallback, useMemo } from 'react';

export type InfiniteQueryData<T> = {
  pages: RowWindow<T>[];
  pageParams: any[];
};

export function useTableData<T>(
  tableLoader: TableLoader<T>,
  rowsPerPage: number,
  page: number,
  infiniteScroll: boolean,
  setRowCount?: React.Dispatch<React.SetStateAction<number | undefined>>,
  refetchOnWindowFocus = false
) {
  const startIndex = useMemo(() => page * rowsPerPage, [page, rowsPerPage]);
  const endIndex = useMemo(() => startIndex + rowsPerPage, [startIndex, rowsPerPage]);

  const {
    data: paginatedData,
    isLoading: isPaginatedLoading,
    error: paginatedError,
    refetch: refetchPaginatedData,
  } = usePaginationTableQuery<T>(tableLoader, startIndex, endIndex, !infiniteScroll, refetchOnWindowFocus);

  const {
    data: infiniteData,
    fetchNextPage,
    hasNextPage,
    isLoading: isInfiniteLoading,
    isFetchingNextPage,
    error: infiniteError,
    refetch: refetchInfiniteData,
  } = useInfiniteScrollTableQuery<T>(tableLoader, rowsPerPage, setRowCount, infiniteScroll, refetchOnWindowFocus);

  const rows = useMemo(
    () =>
      infiniteScroll
        ? (infiniteData?.pages || []).reduce((acc: T[], page: RowWindow<T>) => acc.concat(page.rows), [] as T[])
        : paginatedData?.rows || [],
    [infiniteScroll, infiniteData, paginatedData]
  );

  const totalRows = useMemo(() => paginatedData?.totalCount, [paginatedData]);

  const isLoading = useMemo(
    () => (infiniteScroll ? isInfiniteLoading : isPaginatedLoading),
    [infiniteScroll, isInfiniteLoading, isPaginatedLoading]
  );

  const error = useMemo(
    () => (infiniteScroll ? infiniteError : paginatedError),
    [infiniteScroll, infiniteError, paginatedError]
  );

  const memoizedFetchNextPage = useCallback(() => {
    if (infiniteScroll && !isFetchingNextPage && hasNextPage) {
      fetchNextPage();
    }
  }, [infiniteScroll, isFetchingNextPage, hasNextPage, fetchNextPage]);

  const resetQuery = useCallback(() => {
    if (infiniteScroll) {
      refetchInfiniteData();
    } else {
      refetchPaginatedData();
    }
  }, [infiniteScroll, refetchInfiniteData]);

  return {
    rows,
    totalRows,
    isLoading,
    error,
    fetchNextPage: memoizedFetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    resetQuery,
  };
}

type QueryKeyType = [string, string, number, number];

export const usePaginationTableQuery = <T>(
  tableLoader: TableLoader<T>,
  startIndex: number,
  endIndex: number,
  enabled = false,
  refetchOnWindowFocus = false
): UseQueryResult<RowWindow<T>, Error> => {
  const { reactQueryKeys } = tableLoader;

  if (!reactQueryKeys) {
    throw new Error('TableLoader must have reactQueryKeys defined to use with react-query');
  }

  const { dataKey, dataQueryKey } = reactQueryKeys;

  return useQuery<RowWindow<T>, Error, RowWindow<T>, QueryKeyType>(
    [dataKey, dataQueryKey, startIndex, endIndex],
    async () => await tableLoader.load(startIndex, endIndex),
    {
      enabled,
      refetchOnWindowFocus,
    }
  );
};

export const useInfiniteScrollTableQuery = <T>(
  tableLoader: TableLoader<T>,
  rowsPerPage: number,
  setRowCount?: React.Dispatch<React.SetStateAction<number | undefined>>,
  enabled = true,
  refetchOnWindowFocus = false
): UseInfiniteQueryResult<RowWindow<T>, Error> => {
  const { reactQueryKeys } = tableLoader;

  if (!reactQueryKeys) {
    throw new Error('TableLoader must have reactQueryKeys defined to use with react-query');
  }

  const fetchTableData = async ({
    pageParam = { startIndex: 0, endIndex: rowsPerPage },
  }: QueryFunctionContext<[string, string], { startIndex: number; endIndex: number }>) => {
    const { startIndex, endIndex } = pageParam;
    // skip row count query, unless setRowCount was provided, since it is not utilized in infinite scroll implementation
    const data = await tableLoader.load(startIndex, endIndex, setRowCount ? false : true);
    setRowCount && setRowCount(data.totalCount);
    return data;
  };

  const { dataKey, dataQueryKey } = reactQueryKeys;
  return useInfiniteQuery([dataKey, dataQueryKey], fetchTableData, {
    enabled,
    getNextPageParam: (lastPage: RowWindow<T>, pages: RowWindow<T>[]) => {
      if (lastPage.rows.length < rowsPerPage) {
        return undefined; // No more pages to load
      }
      const nextStartIndex = pages.reduce((acc, page) => acc + page.rows.length, 0);
      return {
        startIndex: nextStartIndex,
        endIndex: nextStartIndex + rowsPerPage,
      };
    },
    refetchOnWindowFocus,
  });
};

export const useTableMutation = <T, TVariables = unknown>(
  tableLoader: TableLoader<T> | null | undefined,
  mutationFn: (variables: TVariables) => Promise<void>
): UseMutationResult<void, Error, TVariables> => {
  const queryClient = useQueryClient();

  return useMutation<void, Error, TVariables>(
    async (variables: TVariables) => {
      if (tableLoader) {
        return mutationFn(variables);
      }
    },
    {
      onSuccess: (): void => {
        if (tableLoader?.reactQueryKeys) {
          queryClient.invalidateQueries({ queryKey: [tableLoader.reactQueryKeys.dataKey] });
        }
      },
      onError: (error: Error): void => {
        console.error('Mutation failed:', error);
      },
    }
  );
};
