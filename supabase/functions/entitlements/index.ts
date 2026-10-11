import { authenticate,reply,headers } from '../_shared/auth.ts';
import { refreshRevenueCat } from '../_shared/revenuecat.ts';
Deno.serve(async request=>{if(request.method==='OPTIONS')return new Response(null,{headers});try{const {user,admin}=await authenticate(request);return reply({entitlements:await refreshRevenueCat(admin,user.id)});}catch{return reply({error:'Entitlement verification unavailable. Existing local records remain accessible.'},503);}});
