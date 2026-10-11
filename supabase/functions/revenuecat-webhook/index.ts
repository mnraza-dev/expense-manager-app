import { createClient } from 'npm:@supabase/supabase-js@2';
import { refreshRevenueCat } from '../_shared/revenuecat.ts';
Deno.serve(async request=>{
 const secret=Deno.env.get('REVENUECAT_WEBHOOK_AUTH');if(!secret||request.headers.get('Authorization')!==secret)return new Response('Unauthorized',{status:401});
 try{const body=await request.json();const owners=[body.event?.app_user_id,...(body.event?.transferred_from??[]),...(body.event?.transferred_to??[])].filter(id=>typeof id==='string'&&/^[a-f0-9-]{36}$/.test(id));
 const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
 for(const owner of new Set<string>(owners))await refreshRevenueCat(admin,owner);
 return new Response('OK');}catch{return new Response('Retry',{status:503});}
});
