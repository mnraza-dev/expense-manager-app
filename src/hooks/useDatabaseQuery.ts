import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useFinance } from '../store/useFinance';
export function useDatabaseQuery<T>(load:()=>Promise<T>, scope:'ledger'|'budget'|'both'='both') {
 const ledger=useFinance(s=>s.revision),budgets=useFinance(s=>s.budgetRevision);
 const [retryKey,setRetryKey]=useState(0);
 const [state,setState]=useState<{data:T|undefined;loading:boolean;error:string|null}>({data:undefined,loading:true,error:null});
 const revision=scope==='budget'?0:ledger,budgetRevision=scope==='ledger'?0:budgets;
 useFocusEffect(useCallback(()=>{
  let active=true;setState({data:undefined,loading:true,error:null});
  load().then(data=>{if(active)setState({data,loading:false,error:null});}).catch(()=>{if(active)setState({data:undefined,loading:false,error:'Unable to load local records. Please retry.'});});
  return ()=>{active=false;};
 },[load,revision,budgetRevision,retryKey]));
 return {...state,retry:()=>setRetryKey(n=>n+1)};
}
