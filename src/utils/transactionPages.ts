import type { Transaction } from '../types';
export interface LoadedTransactions {
  key: unknown;
  page: number;
  revision: number;
}
export function transactionRequest(
  key: unknown,
  page: number,
  revision: number,
  loaded: LoadedTransactions | null
) {
  const effectivePage = loaded && loaded.key !== key ? 0 : page;
  const append =
    !!loaded &&
    loaded.key === key &&
    loaded.revision === revision &&
    effectivePage === loaded.page + 1;
  return {
    page: effectivePage,
    append,
    offset: append ? effectivePage * 50 : 0,
    limit: append ? 50 : (effectivePage + 1) * 50,
  };
}
export function retainTransactions(previous: Transaction[], incoming: Transaction[]) {
  const old = new Map(previous.map((t) => [t.id, t]));
  return incoming.map((t) => {
    const row = old.get(t.id);
    if (!row) return t;
    const keys = Object.keys(t) as (keyof Transaction)[];
    return keys.length === Object.keys(row).length && keys.every((k) => t[k] === row[k]) ? row : t;
  });
}
