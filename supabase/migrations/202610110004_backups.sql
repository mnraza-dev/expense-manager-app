insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('finance-backups','finance-backups',false,20000000,array['application/json']) on conflict(id) do update set public=false,file_size_limit=20000000,allowed_mime_types=array['application/json'];
create policy backup_owned_read on storage.objects for select to authenticated using(bucket_id='finance-backups' and (storage.foldername(name))[1]=auth.uid()::text and exists(select 1 from public.cloud_backups b where b.owner_id=auth.uid() and b.object_path=name));
create policy backup_owned_insert on storage.objects for insert to authenticated with check(bucket_id='finance-backups' and (storage.foldername(name))[1]=auth.uid()::text and public.cloud_allowed('cloud_backup') and exists(select 1 from public.cloud_backups b where b.owner_id=auth.uid() and b.object_path=name and b.status='pending'));
-- No client UPDATE/DELETE policy: verified backup objects are immutable. Deletion is server-controlled.
create function public.begin_cloud_backup(backup_id uuid,snapshot_id uuid,checksum text,bytes integer,app_version text,schema_version integer) returns text language plpgsql security definer set search_path='' as $$
declare who uuid=auth.uid();cap integer;path text;begin
 if who is null or not public.cloud_allowed('cloud_backup') then raise exception 'cloud_access_required';end if;
 insert into public.cloud_heads(owner_id) values(who) on conflict do nothing;
 perform 1 from public.cloud_heads where owner_id=who for update;
 if exists(select 1 from public.cloud_backups where owner_id=who and id=backup_id) then return (select object_path from public.cloud_backups where owner_id=who and id=backup_id and sha256=checksum and byte_size=bytes);end if;
 select case when exists(select 1 from public.cloud_entitlements where owner_id=who and name='extended_backup_history' and active and (expires_at is null or expires_at>now())) then extended_backup_limit else backup_limit end into cap from public.cloud_policy;
 if (select count(*) from public.cloud_backups where owner_id=who)>=cap then raise exception 'backup_retention_limit: delete an old or incomplete backup before uploading';end if;
 path=who::text||'/'||backup_id::text||'.json';
 insert into public.cloud_backups(owner_id,id,object_path,snapshot_id,sha256,byte_size,app_version,schema_version) values(who,backup_id,path,snapshot_id,checksum,bytes,app_version,schema_version);
 return path;
end $$;
revoke all on function public.begin_cloud_backup(uuid,uuid,text,integer,text,integer) from public,anon;
grant execute on function public.begin_cloud_backup(uuid,uuid,text,integer,text,integer) to authenticated;
