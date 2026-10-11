export async function refreshRevenueCat(admin:any,owner:string) {
 const secret=Deno.env.get('REVENUECAT_SECRET_API_KEY');if(!secret)throw new Error('Billing is not configured.');
 const response=await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(owner)}`,{headers:{Authorization:`Bearer ${secret}`}});if(!response.ok)throw new Error('Billing verification unavailable.');
 const body=await response.json(),entitlements=body.subscriber?.entitlements??{};
 const names=['cloud_backup','multi_device_sync','extended_backup_history','advanced_reports'];
 const rows=names.map(name=>{const item=entitlements[name];const end=item?.expires_date??null;return {owner_id:owner,name,expires_at:end,active:!!item&&(!end||Date.parse(end)>Date.now()),verified_at:new Date().toISOString()};});
 const result=await admin.from('cloud_entitlements').upsert(rows);if(result.error)throw new Error('Could not record verified entitlements.');return rows;
}
