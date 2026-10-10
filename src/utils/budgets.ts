export const DEFAULT_WARNING_PERCENT = 80;
export function budgetStatus(limit:number, spent:number, warning=DEFAULT_WARNING_PERCENT) {
 if(!Number.isFinite(warning)||warning<1||warning>100) throw new Error('Warning threshold must be between 1 and 100%.');
 if(limit<=0)return {percent:0,bar:0,remaining:0,excess:spent,status:'unbudgeted' as const};
 const percent=spent/limit*100;
 return {percent,bar:Math.max(0,Math.min(100,percent)),remaining:Math.max(0,limit-spent),excess:Math.max(0,spent-limit),status:spent>limit?'exceeded' as const:percent>=warning?'warning' as const:'normal' as const};
}
export function percentage(amount:number,total:number) {return total>0?amount/total*100:0;}
