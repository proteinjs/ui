import { useQuery, useMutation, useQueryClient, UseQueryResult, UseMutationResult } from 'react-query';
import { TableLoader, RowWindow } from './TableLoader';

type QueryKeyType = [string, string, number, number];

export const useTableQuery = <T>(
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
      keepPreviousData: true,
    }
  );
};

export const useTableMutation = <T>(
  tableLoader: TableLoader<T>,
  mutationFn: (data: T | T[]) => Promise<void>
): UseMutationResult<void, Error, T | T[], unknown> => {
  const queryClient = useQueryClient();
  const { reactQueryKeys } = tableLoader;

  if (!reactQueryKeys) {
    throw new Error('TableLoader must have reactQueryKeys defined to use with react-query');
  }

  const { dataKey } = reactQueryKeys;

  return useMutation<void, Error, T | T[], unknown>(mutationFn, {
    onSuccess: (): void => {
      // Invalidate and refetch
      queryClient.invalidateQueries({ queryKey: [dataKey] });
    },
    onError: (error: Error): void => {
      // Handle the error, e.g., show a notification
      console.error('Mutation failed:', error);
    },
  });
};
