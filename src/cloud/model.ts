import { TABLES, type Table, type Dataset, type Row } from '../services/backup';
export type CanonicalRecord={id:string;entity:Table;data:Row|null;revision:number;deleted:boolean};
export type Change={id:string;entity:Table;data:Row|null;expected_revision:number;deleted:boolean};
export type Operation={id:string;changes:Change[];schema_version:number};
export type Mapping={entity:Table;local_key:string;global_id:string};
export const references:Partial<Record<Table,Record<string,Table>>>= {
 account_roles:{account_id:'accounts'},ledger_accounts:{account_id:'accounts',category_id:'categories'},credit_cards:{account_id:'accounts',payment_account_id:'accounts'},loans:{account_id:'accounts',payment_account_id:'accounts',category_id:'categories'},transactions:{account_id:'accounts',destination_account_id:'accounts',category_id:'categories',loan_id:'loans'},budget_categories:{budget_id:'budgets',category_id:'categories'},card_statements:{account_id:'credit_cards'},ledger_journals:{transaction_id:'transactions',reversal_of:'ledger_journals'},ledger_lines:{journal_id:'ledger_journals',ledger_account_id:'ledger_accounts'},transaction_journals:{transaction_id:'transactions',journal_id:'ledger_journals'},loan_schedules:{loan_id:'loans'},loan_payments:{loan_id:'loans',principal_transaction_id:'transactions',interest_transaction_id:'transactions',fee_transaction_id:'transactions'},recurring_rules:{account_id:'accounts',category_id:'categories',loan_id:'loans'},recurring_occurrences:{rule_id:'recurring_rules',transaction_id:'transactions',loan_payment_id:'loan_payments'},
};
// card_statements refers to the card's account primary key, not the mapping UUID of its metadata row.
references.card_statements={account_id:'accounts'};
export function localKey(entity:Table,row:Row) {return entity==='app_settings'?String(row.key):entity==='account_roles'||entity==='credit_cards'?String(row.account_id):entity==='transaction_journals'?`${row.transaction_id}:${row.version}`:String(row.id);}
export function canonicalize(entity:Table,row:Row,mappings:Mapping[]):Row {
 const result={...row};const find=(target:Table,key:string)=>{const m=mappings.find(m=>m.entity===target&&m.local_key===key);if(!m)throw new Error(`Missing stable mapping for ${target}.`);return m.global_id;};
 if(Object.hasOwn(result,'id'))result.id=find(entity,localKey(entity,row));
 for(const [column,target] of Object.entries(references[entity]??{}))if(result[column]!==null)result[column]=find(target,String(row[column]));
 return result;
}
export function materialize(records:CanonicalRecord[],existing:Mapping[]):{tables:Dataset;mappings:Mapping[]} {
 const active=records.filter(r=>!r.deleted&&r.data!==null),mappings=existing.map(m=>({...m}));
 const tables=Object.fromEntries(TABLES.map(t=>[t,[]])) as unknown as Dataset;
 const next=new Map<Table,number>();
 for(const entity of TABLES)next.set(entity,Math.max(0,...mappings.filter(m=>m.entity===entity&&/^\d+$/.test(m.local_key)).map(m=>Number(m.local_key)))+1);
 // Assign numeric IDs before resolving references, including cycles.
 for(const record of active)if(Object.hasOwn(record.data!,'id')&&!mappings.some(m=>m.global_id===record.id)){const key=String(next.get(record.entity)!);next.set(record.entity,next.get(record.entity)!+1);mappings.push({entity:record.entity,local_key:key,global_id:record.id});}
 const find=(target:Table,id:string)=>{const m=mappings.find(m=>m.entity===target&&m.global_id===id);if(!m)throw new Error('Cloud record contains an unresolved reference.');return Number(m.local_key);};
 for(const record of active){const row={...record.data!};if(Object.hasOwn(row,'id'))row.id=find(record.entity,record.id);for(const [column,target]of Object.entries(references[record.entity]??{}))if(row[column]!==null)row[column]=find(target,String(row[column]));tables[record.entity].push(row);const key=localKey(record.entity,row);if(!mappings.some(m=>m.global_id===record.id))mappings.push({entity:record.entity,local_key:key,global_id:record.id});}
 return {tables,mappings};
}
