import { createClient } from 'npm:@supabase/supabase-js@2';
export const headers={'Content-Type':'application/json','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type'};
export const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
export async function authenticate(request:Request) {
 const token=request.headers.get('Authorization');if(!token?.startsWith('Bearer '))throw new Error('Authentication required.');
 const client=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:token}},auth:{persistSession:false}});
 const {data,error}=await client.auth.getUser();if(error||!data.user)throw new Error('Session expired. Sign in again.');
 const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
 return {user:data.user,client,admin};
}
