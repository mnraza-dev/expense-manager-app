export interface DB {
 execAsync(sql:string):Promise<void>;
 runAsync(sql:string,...params:(string|number|null)[]):Promise<unknown>;
 getAllAsync<T>(sql:string,...params:(string|number|null)[]):Promise<T[]>;
 getFirstAsync<T>(sql:string,...params:(string|number|null)[]):Promise<T|null>;
 withTransactionAsync(task:()=>Promise<void>):Promise<void>;
}
