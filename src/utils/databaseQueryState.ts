export interface DatabaseQueryState<T> {
  key: unknown;
  dataKey: unknown;
  data: T | undefined;
  pending: boolean;
  error: string | null;
}
export function beginDatabaseQuery<T>(
  previous: DatabaseQueryState<T>,
  key: unknown,
  keepPreviousData: boolean
): DatabaseQueryState<T> {
  const keep = keepPreviousData || previous.key === key;
  return {
    key,
    dataKey: keep ? previous.dataKey : null,
    data: keep ? previous.data : undefined,
    pending: true,
    error: null,
  };
}
export function databaseQueryView<T>(
  state: DatabaseQueryState<T>,
  key: unknown,
  keepPreviousData: boolean
) {
  const current = state.key === key;
  const data = current || keepPreviousData ? state.data : undefined;
  const pending = !current || state.pending;
  return {
    data,
    loading: pending && data === undefined,
    refreshing: pending && data !== undefined,
    isPreviousData: data !== undefined && state.dataKey !== key,
    error: current ? state.error : null,
  };
}
