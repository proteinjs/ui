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

export function useTableData<T>(
  tableLoader: TableLoader<T>,
  rowsPerPage: number,
  page: number,
  infiniteScroll: boolean
) {
  const startIndex = useMemo(() => page * rowsPerPage, [page, rowsPerPage]);
  const endIndex = useMemo(() => startIndex + rowsPerPage, [startIndex, rowsPerPage]);

  const {
    data: paginatedData,
    isLoading: isPaginatedLoading,
    isFetching: isPaginatedFetching,
    error: paginatedError,
    refetch: refetchPaginatedData,
  } = usePaginationTableQuery<T>(tableLoader, startIndex, endIndex);

  const {
    data: infiniteData,
    fetchNextPage,
    hasNextPage,
    isLoading: isInfiniteLoading,
    isFetchingNextPage,
    error: infiniteError,
    refetch: refetchInfiniteData,
  } = useInfiniteScrollTableQuery<T>(tableLoader, rowsPerPage, infiniteScroll);

  const rows = useMemo(
    () =>
      infiniteScroll
        ? (infiniteData?.pages || []).reduce((acc, page) => acc.concat(page.rows), [] as T[])
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
  endIndex: number
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
      refetchOnWindowFocus: false,
    }
  );
};

export const useInfiniteScrollTableQuery = <T>(
  tableLoader: TableLoader<T>,
  rowsPerPage: number,
  enabled = true
): UseInfiniteQueryResult<RowWindow<T>, Error> => {
  const { reactQueryKeys } = tableLoader;

  if (!reactQueryKeys) {
    throw new Error('TableLoader must have reactQueryKeys defined to use with react-query');
  }

  const fetchTableData = async ({
    pageParam = { startIndex: 0, endIndex: rowsPerPage },
  }: QueryFunctionContext<[string, string], { startIndex: number; endIndex: number }>) => {
    const { startIndex, endIndex } = pageParam;
    // veronica todo: prevent get row count for infinite scroll
    return await tableLoader.load(startIndex, endIndex);
  };

  const { dataKey, dataQueryKey } = reactQueryKeys;
  return useInfiniteQuery([dataKey, dataQueryKey], fetchTableData, {
    enabled,
    getNextPageParam: (lastPage, pages) => {
      if (lastPage.rows.length < rowsPerPage) {
        return undefined; // No more pages to load
      }
      const nextStartIndex = pages.reduce((acc, page) => acc + page.rows.length, 0);
      return {
        startIndex: nextStartIndex,
        endIndex: nextStartIndex + rowsPerPage,
      };
    },
    refetchOnWindowFocus: false,
  });
};

export const useTableMutation = <T, TVariables = unknown>(
  tableLoader: TableLoader<T>,
  mutationFn: (variables: TVariables) => Promise<void>
): UseMutationResult<void, Error, TVariables> => {
  const queryClient = useQueryClient();
  const { reactQueryKeys } = tableLoader;

  if (!reactQueryKeys) {
    throw new Error('TableLoader must have reactQueryKeys defined to use with react-query');
  }

  const { dataKey } = reactQueryKeys;

  return useMutation<void, Error, TVariables>(mutationFn, {
    onSuccess: (): void => {
      // Invalidate all tables that use the same data key
      queryClient.invalidateQueries({ queryKey: [dataKey] });
    },
    onError: (error: Error): void => {
      console.error('Mutation failed:', error);
    },
  });
};
