import type { DB } from '../db/adapter';
import { TABLES,type Dataset,type Table,type Row } from '../services/backup';
import { canonicalize,localKey,type Mapping,type Change,type Operation } from './model';
import { uuidSQL } from './localSchema';
export async function readDataset(db:DB) {const data={} as Dataset;for(const t of TABLES)data[t]=await db.getAllAsync<Row>(`SELECT * FROM ${t}`);return data;}
export async function mapDataset(db:DB,data:Dataset) {
 for(const entity of TABLES)for(const row of data[entity])await db.runAsync(`INSERT OR IGNORE INTO sync_mappings(entity,local_key,global_id) VALUES(?,?,${uuidSQL})`,entity,localKey(entity,row));
 return db.getAllAsync<Mapping>('SELECT * FROM sync_mappings');
}
export async function captureOutbox(db:DB) {
 if(!await db.getFirstAsync("SELECT name FROM sqlite_master WHERE name='sync_config'"))return;
 const config=await db.getFirstAsync<{owner:string|null;enabled:number;applying:number}>('SELECT * FROM sync_config WHERE id=1');
 if(!config?.enabled||config.applying||!config.owner)return;
 const dirty=await db.getAllAsync<{entity:Table;local_key:string;deleted:number}>('SELECT * FROM sync_dirty');if(!dirty.length)return;
 const dataset=await readDataset(db),mappings=await mapDataset(db,dataset),changes:Change[]=[];
 for(const item of dirty){let mapping=mappings.find(m=>m.entity===item.entity&&m.local_key===item.local_key);if(!mapping){await db.runAsync(`INSERT INTO sync_mappings VALUES(?,?,${uuidSQL})`,item.entity,item.local_key);mapping=(await db.getFirstAsync<Mapping>('SELECT * FROM sync_mappings WHERE entity=? AND local_key=?',item.entity,item.local_key))!;mappings.push(mapping);}
 const row=dataset[item.entity].find(r=>localKey(item.entity,r)===item.local_key);
 const known=await db.getFirstAsync<{revision:number}>('SELECT revision FROM sync_remote WHERE id=?',mapping.global_id);
 // Pending earlier operations will establish this revision. A negative sentinel is resolved only after their receipt.
 const earlier=await db.getFirstAsync<{n:number}>("SELECT count(*) n FROM sync_outbox WHERE EXISTS(SELECT 1 FROM json_each(json_extract(payload,'$.changes')) WHERE json_extract(value,'$.id')=?)",mapping.global_id);
 changes.push({id:mapping.global_id,entity:item.entity,data:row?canonicalize(item.entity,row,mappings):null,deleted:!row,expected_revision:earlier?.n?-1:known?.revision??0});
 }
 const id=(await db.getFirstAsync<{id:string}>(`SELECT ${uuidSQL} id`))!.id;
 const op:Operation={id,changes,schema_version:4};
 await db.runAsync('INSERT INTO sync_outbox(id,owner,payload,created_at) VALUES(?,?,?,?)',id,config.owner,JSON.stringify(op),new Date().toISOString());await db.runAsync('DELETE FROM sync_dirty');
}
// Only outer SQLite transactions capture deltas. All writes and outbox state commit together.
export function withOutbox(db:DB):DB {
 let depth=0;
 const wrapped:DB={execAsync:s=>db.execAsync(s),getAllAsync:(s,...p)=>db.getAllAsync(s,...p),getFirstAsync:(s,...p)=>db.getFirstAsync(s,...p),runAsync:async(s,...p)=>{if(depth)return db.runAsync(s,...p);let result:unknown;await wrapped.withTransactionAsync(async()=>{result=await db.runAsync(s,...p);});return result;},withTransactionAsync:async task=>{if(depth){await task();return;}await db.withTransactionAsync(async()=>{depth++;try{await task();await captureOutbox(db);}finally{depth--;}});}};return wrapped;
}
