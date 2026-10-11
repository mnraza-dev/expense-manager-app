import { authenticate,reply,headers } from '../_shared/auth.ts';
Deno.serve(async request=>{
 if(request.method==='OPTIONS')return new Response(null,{headers});
 try {
  const {user,admin}=await authenticate(request),{action,id}=await request.json();
  if(!/^[a-f0-9-]{36}$/.test(id))return reply({error:'Invalid backup identifier.'},400);
  const {data:backup,error}=await admin.from('cloud_backups').select('*').eq('owner_id',user.id).eq('id',id).single();
  if(error||!backup)return reply({error:'Backup not found.'},404);
  if(action==='delete'){
   const removed=await admin.storage.from('finance-backups').remove([backup.object_path]);if(removed.error)throw new Error('Could not delete backup object. Retry.');
   const result=await admin.from('cloud_backups').delete().eq('owner_id',user.id).eq('id',id);if(result.error)throw new Error('Could not remove manifest. Retry.');return reply({deleted:true});
  }
  if(action!=='verify')return reply({error:'Unsupported operation.'},400);
  const object=await admin.storage.from('finance-backups').download(backup.object_path);if(object.error||!object.data)throw new Error('Upload has not completed. Retry verification.');
  const bytes=await object.data.arrayBuffer();if(bytes.byteLength!==backup.byte_size)throw new Error('Uploaded file length does not match manifest.');
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');if(hash!==backup.sha256)throw new Error('Uploaded file integrity check failed.');
  const envelope=JSON.parse(new TextDecoder().decode(bytes));if(envelope.format!=='pocketbook-backup'||envelope.formatVersion!==1||envelope.payload?.schemaVersion!==backup.schema_version)throw new Error('Unsupported backup envelope.');
  const verify=await admin.from('cloud_backups').update({status:'verified',verified_at:new Date().toISOString()}).eq('owner_id',user.id).eq('id',id);if(verify.error)throw new Error('Verification receipt could not be recorded. Retry.');return reply({verified:true});
 }catch{return reply({error:'Backup operation failed. Check your session, file integrity and connection, then retry.'},400);}
});
