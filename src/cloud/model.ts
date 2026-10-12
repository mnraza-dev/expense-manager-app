import { TABLES, type Table, type Dataset, type Row } from '../services/backup';
export type CanonicalRecord = {
  id: string;
  entity: Table;
  data: Row | null;
  revision: number;
  deleted: boolean;
};
export type Change = {
  id: string;
  entity: Table;
  data: Row | null;
  expected_revision: number;
  deleted: boolean;
};
export type Operation = { id: string; changes: Change[]; schema_version: number };
export type Mapping = { entity: Table; local_key: string; global_id: string };
export const references: Partial<Record<Table, Record<string, Table>>> = {
  account_roles: { account_id: 'accounts' },
  ledger_accounts: { account_id: 'accounts', category_id: 'categories' },
  credit_cards: { account_id: 'accounts', payment_account_id: 'accounts' },
  loans: { account_id: 'accounts', payment_account_id: 'accounts', category_id: 'categories' },
  transactions: {
    account_id: 'accounts',
    destination_account_id: 'accounts',
    category_id: 'categories',
    loan_id: 'loans',
    refund_of_id: 'transactions',
  },
  expense_splits: { transaction_id: 'transactions', category_id: 'categories' },
  goal_contributions: { goal_id: 'savings_goals' },
  budget_categories: { budget_id: 'budgets', category_id: 'categories' },
  card_statements: { account_id: 'credit_cards' },
  ledger_journals: { transaction_id: 'transactions', reversal_of: 'ledger_journals' },
  ledger_lines: { journal_id: 'ledger_journals', ledger_account_id: 'ledger_accounts' },
  transaction_journals: { transaction_id: 'transactions', journal_id: 'ledger_journals' },
  loan_schedules: { loan_id: 'loans', payment_id_baseline: 'loan_payments' },
  loan_payments: {
    loan_id: 'loans',
    principal_transaction_id: 'transactions',
    interest_transaction_id: 'transactions',
    fee_transaction_id: 'transactions',
  },
  recurring_rules: { account_id: 'accounts', category_id: 'categories', loan_id: 'loans' },
  recurring_occurrences: {
    rule_id: 'recurring_rules',
    transaction_id: 'transactions',
    loan_payment_id: 'loan_payments',
  },
};
// card_statements refers to the card's account primary key, not the mapping UUID of its metadata row.
references.card_statements = { account_id: 'accounts' };
export function localKey(entity: Table, row: Row) {
  return entity === 'app_settings'
    ? String(row.key)
    : entity === 'account_roles' || entity === 'credit_cards'
      ? String(row.account_id)
      : entity === 'transaction_journals'
        ? `${row.transaction_id}:${row.version}`
        : String(row.id);
}
export type MappingResolver = (entity: Table, key: string) => string;
export function mappingResolver(mappings: Mapping[]): MappingResolver {
  const index = new Map(mappings.map((m) => [m.entity + '\0' + m.local_key, m.global_id]));
  return (entity, key) => {
    const id = index.get(entity + '\0' + key);
    if (!id) throw new Error(`Missing stable mapping for ${entity}.`);
    return id;
  };
}
export function canonicalize(entity: Table, row: Row, mappings: Mapping[] | MappingResolver): Row {
  const result = { ...row };
  const find = typeof mappings === 'function' ? mappings : mappingResolver(mappings);
  if (Object.hasOwn(result, 'id')) result.id = find(entity, localKey(entity, row));
  for (const [column, target] of Object.entries(references[entity] ?? {}))
    if (entity === 'loan_schedules' && column === 'payment_id_baseline' && row[column] === 0)
      result[column] = null;
    else if (result[column] !== null) result[column] = find(target, String(row[column]));
  if (entity === 'ledger_journals') {
    const key = String(row.posting_key);
    const match = /^(transaction|opening|reverse):(\d+)(.*)$/.exec(key);
    if (match)
      result.posting_key = `${match[1]}:${find(match[1] === 'transaction' ? 'transactions' : match[1] === 'opening' ? 'accounts' : 'ledger_journals', match[2])}${match[3]}`;
  }
  return result;
}
export function materialize(
  records: CanonicalRecord[],
  existing: Mapping[]
): { tables: Dataset; mappings: Mapping[] } {
  const active = records.filter((r) => !r.deleted && r.data !== null),
    mappings = existing.map((m) => ({ ...m }));
  const tables = Object.fromEntries(TABLES.map((t) => [t, []])) as unknown as Dataset;
  const byGlobal = new Map(mappings.map((m) => [m.global_id, m]));
  const next = new Map<Table, number>(TABLES.map((t) => [t, 1]));
  for (const m of mappings)
    if (/^\d+$/.test(m.local_key))
      next.set(m.entity, Math.max(next.get(m.entity) ?? 1, Number(m.local_key) + 1));
  for (const record of active) {
    if (!TABLES.includes(record.entity)) throw new Error('Unsupported cloud entity.');
    if (Object.hasOwn(record.data!, 'id') && !byGlobal.has(record.id)) {
      const key = String(next.get(record.entity)!);
      next.set(record.entity, next.get(record.entity)! + 1);
      const mapping = { entity: record.entity, local_key: key, global_id: record.id };
      mappings.push(mapping);
      byGlobal.set(record.id, mapping);
    }
  }
  const find = (target: Table, id: string) => {
    const m = byGlobal.get(id);
    if (!m || m.entity !== target)
      throw new Error('Cloud record contains an unresolved reference.');
    return Number(m.local_key);
  };
  for (const record of active) {
    const row = { ...record.data! };
    if (record.entity === 'transactions' && !Object.hasOwn(row, 'refund_of_id'))
      row.refund_of_id = null;
    if (Object.hasOwn(row, 'id')) row.id = find(record.entity, record.id);
    for (const [column, target] of Object.entries(references[record.entity] ?? {}))
      if (
        record.entity === 'loan_schedules' &&
        column === 'payment_id_baseline' &&
        row[column] === null
      )
        row[column] = 0;
      else if (row[column] !== null) row[column] = find(target, String(row[column]));
    if (record.entity === 'ledger_journals') {
      const key = String(row.posting_key);
      const match = /^(transaction|opening|reverse):([a-f0-9-]{36})(.*)$/.exec(key);
      if (match)
        row.posting_key = `${match[1]}:${find(match[1] === 'transaction' ? 'transactions' : match[1] === 'opening' ? 'accounts' : 'ledger_journals', match[2])}${match[3]}`;
    }
    tables[record.entity].push(row);
    const key = localKey(record.entity, row);
    if (!byGlobal.has(record.id)) {
      const m = { entity: record.entity, local_key: key, global_id: record.id };
      mappings.push(m);
      byGlobal.set(record.id, m);
    }
  }
  return { tables, mappings };
}
