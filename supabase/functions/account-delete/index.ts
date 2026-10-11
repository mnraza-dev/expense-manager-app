import { authenticate,reply,headers } from '../_shared/auth.ts';
Deno.serve(async request=>{
 if(request.method==='OPTIONS')return new Response(null,{headers});
 try{const {user,admin}=await authenticate(request);
 // Storage objects must be removed first. Do not delete auth identity on partial cleanup failure.
 for(;;){const page=await admin.storage.from('finance-backups').list(user.id,{limit:100});if(page.error)throw new Error('Storage cleanup failed.');if(!page.data?.length)break;const result=await admin.storage.from('finance-backups').remove(page.data.map(o=>`${user.id}/${o.name}`));if(result.error)throw new Error('Storage cleanup failed.');}
 const result=await admin.auth.admin.deleteUser(user.id);if(result.error)throw new Error('Account deletion failed.');return reply({deleted:true});
 }catch{return reply({error:'Account deletion did not complete. Retry cleanup; your local records remain available.'},400);}
});
