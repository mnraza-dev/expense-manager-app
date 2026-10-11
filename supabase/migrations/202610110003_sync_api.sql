create function public.validate_cloud_graph(who uuid) returns void language plpgsql security definer set search_path='' as $$
declare r record; s record; field record; v jsonb; target text; n numeric; d numeric;c numeric; tx record;j record; debit_target uuid;credit_target uuid;
begin
 for r in select * from public.cloud_records where owner_id=who and not deleted loop
  select * into s from public.cloud_schema where entity=r.entity;
  if not found or jsonb_typeof(r.data)<>'object' or (select count(*) from jsonb_object_keys(r.data))<>(select count(*) from jsonb_object_keys(s.columns)) then raise exception 'invalid_schema';end if;
  for field in select key,value from jsonb_each(s.columns) loop
   v=r.data->field.key;
   if v is null then raise exception 'missing_field';end if;
   if v='null'::jsonb then if not (field.value->>'nullable')::boolean then raise exception 'null_field';end if;continue;end if;
   target=field.value->>'type';
   if target='integer' then if jsonb_typeof(v)<>'number' or v::text !~ '^-?[0-9]+$' or abs((v::text)::numeric)>9007199254740991 then raise exception 'invalid_integer';end if;
   elsif target='uuid' then if jsonb_typeof(v)<>'string' or (v#>>'{}') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'invalid_uuid';end if;
   elsif jsonb_typeof(v)<>'string' then raise exception 'invalid_text';end if;
   if field.key in ('date','start_date','end_date','scheduled_date','due_date','history_start','period_start','period_end') and ((v#>>'{}') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or to_char((v#>>'{}')::date,'YYYY-MM-DD')<>(v#>>'{}')) then raise exception 'invalid_date';end if;
   if field.key in ('amount','opening_balance','debit','credit','credit_limit','minimum_payment','principal','interest','fees','origination_fees','limit_minor','total_limit_minor') and (abs((v::text)::numeric)>1000000000000 or (field.key<>'opening_balance' and (v::text)::numeric<0)) then raise exception 'invalid_money';end if;
  end loop;
  if r.data ? 'id' and (r.data->>'id')::uuid<>r.id then raise exception 'id_mismatch';end if;
  for field in select key,value from jsonb_each_text(s.refs) loop
   if r.data->>field.key is not null and not exists(select 1 from public.cloud_records parent where parent.owner_id=who and parent.entity=field.value and parent.id=(r.data->>field.key)::uuid and not parent.deleted) then raise exception 'invalid_reference';end if;
  end loop;
  if r.data ? 'currency' and r.data->>'currency'<>'INR' or r.data ? 'currency_code' and r.data->>'currency_code'<>'INR' then raise exception 'unsupported_currency';end if;
  if r.entity='app_settings' and (r.data->>'key' not in ('theme','currency','categories_seeded','ledger_converted','budget_warning_percent')) then raise exception 'invalid_preference';end if;
  if r.entity='transactions' then
   if r.data->>'type' not in ('income','expense','transfer') or r.data->>'status' not in ('posted','void') or (r.data->>'amount')::numeric<=0 or r.data->>'component' not in ('standard','principal','interest','fee') then raise exception 'invalid_transaction';end if;
   if r.data->>'type'='transfer' then if r.data->>'destination_account_id' is null or r.data->>'destination_account_id'=r.data->>'account_id' or r.data->>'category_id' is not null then raise exception 'invalid_transfer';end if;
   else if r.data->>'destination_account_id' is not null or not exists(select 1 from public.cloud_records cat where cat.owner_id=who and cat.id=(r.data->>'category_id')::uuid and cat.data->>'type'=r.data->>'type' and not cat.deleted) then raise exception 'invalid_category';end if;end if;
  end if;
  if r.entity='ledger_lines' and not (((r.data->>'debit')::numeric>0 and (r.data->>'credit')::numeric=0) or ((r.data->>'credit')::numeric>0 and (r.data->>'debit')::numeric=0)) then raise exception 'invalid_line';end if;
  if r.entity='ledger_journals' then
   select count(*),sum((data->>'debit')::numeric),sum((data->>'credit')::numeric) into n,d,c from public.cloud_records where owner_id=who and entity='ledger_lines' and not deleted and data->>'journal_id'=r.id::text;
   if r.data->>'status'<>'posted' or n<2 or d is distinct from c or coalesce(d,0)<=0 then raise exception 'unbalanced_journal';end if;
  end if;
 end loop;
 -- Account classification and balances are validated from the graph, never a client total.
 if exists(select 1 from public.cloud_records a where a.owner_id=who and a.entity='accounts' and not a.deleted and (not exists(select 1 from public.cloud_records role where role.owner_id=who and role.entity='account_roles' and not role.deleted and role.data->>'account_id'=a.id::text) or not exists(select 1 from public.cloud_records ledger where ledger.owner_id=who and ledger.entity='ledger_accounts' and not ledger.deleted and ledger.data->>'account_id'=a.id::text))) then raise exception 'missing_account_mapping';end if;
 for tx in select * from public.cloud_records where owner_id=who and entity='transactions' and not deleted loop
  select count(*) into n from public.cloud_records ref join public.cloud_records journal on journal.owner_id=who and journal.id=(ref.data->>'journal_id')::uuid where ref.owner_id=who and ref.entity='transaction_journals' and not ref.deleted and ref.data->>'transaction_id'=tx.id::text and not exists(select 1 from public.cloud_records rev where rev.owner_id=who and rev.entity='ledger_journals' and not rev.deleted and rev.data->>'reversal_of'=journal.id::text);
  if (tx.data->>'status'='posted' and n<>1) or (tx.data->>'status'='void' and n<>0) then raise exception 'transaction_posting_mismatch';end if;
  if tx.data->>'status'='void' then continue;end if;
  select journal.* into j from public.cloud_records ref join public.cloud_records journal on journal.owner_id=who and journal.id=(ref.data->>'journal_id')::uuid where ref.owner_id=who and ref.entity='transaction_journals' and not ref.deleted and ref.data->>'transaction_id'=tx.id::text order by (ref.data->>'version')::integer desc limit 1;
  if j.data->>'transaction_id'<>tx.id::text or j.data->>'date'<>tx.data->>'date' then raise exception 'journal_transaction_mismatch';end if;
  select id into debit_target from public.cloud_records where owner_id=who and entity='ledger_accounts' and not deleted and case when tx.data->>'type'='expense' then data->>'category_id'=tx.data->>'category_id' when tx.data->>'type'='income' then data->>'account_id'=tx.data->>'account_id' else data->>'account_id'=tx.data->>'destination_account_id' end;
  select id into credit_target from public.cloud_records where owner_id=who and entity='ledger_accounts' and not deleted and case when tx.data->>'type'='income' then data->>'category_id'=tx.data->>'category_id' else data->>'account_id'=tx.data->>'account_id' end;
  if (select count(*) from public.cloud_records where owner_id=who and entity='ledger_lines' and not deleted and data->>'journal_id'=j.id::text)<>2 or not exists(select 1 from public.cloud_records where owner_id=who and entity='ledger_lines' and not deleted and data->>'journal_id'=j.id::text and data->>'ledger_account_id'=debit_target::text and data->>'debit'=tx.data->>'amount') or not exists(select 1 from public.cloud_records where owner_id=who and entity='ledger_lines' and not deleted and data->>'journal_id'=j.id::text and data->>'ledger_account_id'=credit_target::text and data->>'credit'=tx.data->>'amount') then raise exception 'transaction_lines_mismatch';end if;
 end loop;
 if exists(select 1 from public.cloud_records b where owner_id=who and entity='budgets' and not deleted and (select coalesce(sum((a.data->>'limit_minor')::numeric),0) from public.cloud_records a where a.owner_id=who and a.entity='budget_categories' and not a.deleted and a.data->>'budget_id'=b.id::text)>(b.data->>'total_limit_minor')::numeric) then raise exception 'budget_overallocated';end if;
 if exists(select 1 from public.cloud_records occ where owner_id=who and entity='recurring_occurrences' and not deleted and ((data->>'status'='completed' and ((data->>'transaction_id' is null)=(data->>'loan_payment_id' is null))) or (data->>'status'<>'completed' and (data->>'transaction_id' is not null or data->>'loan_payment_id' is not null)))) then raise exception 'occurrence_links';end if;
end $$;
revoke all on function public.validate_cloud_graph(uuid) from public,anon,authenticated;

create function public.apply_sync(operation jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare who uuid=auth.uid(); op uuid; fingerprint text; receipt jsonb; change jsonb; old public.cloud_records; head bigint; conflict uuid; reason text; result jsonb;
begin
 if who is null or not public.cloud_allowed('multi_device_sync') then raise exception 'cloud_access_required';end if;
 if operation->>'schema_version'<>'4' or jsonb_typeof(operation->'changes')<>'array' or jsonb_array_length(operation->'changes') not between 1 and 10000 or octet_length(operation::text)>20000000 then raise exception 'unsupported_operation';end if;
 op=(operation->>'id')::uuid;fingerprint=encode(sha256(convert_to(operation::text,'UTF8')),'hex');
 insert into public.cloud_heads(owner_id) values(who) on conflict do nothing;
 select revision into head from public.cloud_heads where owner_id=who for update;
 select o.result into receipt from public.cloud_operations o where owner_id=who and id=op and o.fingerprint=fingerprint;
 if found then return receipt;end if;
 if exists(select 1 from public.cloud_operations where owner_id=who and id=op) then raise exception 'idempotency_payload_mismatch';end if;
 begin
  for change in select value from jsonb_array_elements(operation->'changes') loop
   select * into old from public.cloud_records where owner_id=who and id=(change->>'id')::uuid;
   if coalesce(old.revision,0)<>(change->>'expected_revision')::bigint or (old.id is not null and old.entity<>change->>'entity') then raise exception 'revision_conflict';end if;
   if old.id is not null and old.entity in ('ledger_journals','ledger_lines','transaction_journals') and ((change->>'deleted')::boolean or old.data is distinct from change->'data') then raise exception 'immutable_accounting_history';end if;
   insert into public.cloud_records(owner_id,id,entity,data,revision,deleted) values(who,(change->>'id')::uuid,change->>'entity',coalesce(nullif(change->'data','null'::jsonb),old.data),head+1,(change->>'deleted')::boolean) on conflict(owner_id,id) do update set data=excluded.data,revision=excluded.revision,deleted=excluded.deleted,updated_at=now();
  end loop;
  perform public.validate_cloud_graph(who);
  update public.cloud_heads set revision=head+1 where owner_id=who;
  result=jsonb_build_object('status','applied','revision',head+1,'record_count',(select count(*) from public.cloud_records where owner_id=who and not deleted));
 exception when others then
  reason=case when sqlstate='23505' then 'duplicate_business_key' else sqlerrm end;
  insert into public.cloud_conflicts(owner_id,operation_id,proposal,current_records,reason) values(who,op,operation,coalesce((select jsonb_agg(to_jsonb(r)) from public.cloud_records r where owner_id=who and id in(select (value->>'id')::uuid from jsonb_array_elements(operation->'changes'))),'[]'::jsonb),reason) returning id into conflict;
  result=jsonb_build_object('status','conflict','conflict_id',conflict,'reason',reason,'revision',head);
 end;
 insert into public.cloud_operations(owner_id,id,fingerprint,result) values(who,op,fingerprint,result);
 return result;
end $$;
revoke all on function public.apply_sync(jsonb) from public,anon;
grant execute on function public.apply_sync(jsonb) to authenticated;

create function public.cloud_snapshot(after_revision bigint default 0) returns jsonb language plpgsql security definer set search_path='' as $$
declare who uuid=auth.uid();begin
 if who is null then raise exception 'authentication_required';end if;
 return jsonb_build_object('schema_version',4,'revision',coalesce((select revision from public.cloud_heads where owner_id=who),0),'record_count',(select count(*) from public.cloud_records where owner_id=who and not deleted),'records',coalesce((select jsonb_agg(jsonb_build_object('id',id,'entity',entity,'data',data,'revision',revision,'deleted',deleted)) from public.cloud_records where owner_id=who and revision>after_revision),'[]'::jsonb));
end $$;
revoke all on function public.cloud_snapshot(bigint) from public,anon;
grant execute on function public.cloud_snapshot(bigint) to authenticated;
create function public.resolve_cloud_conflicts() returns void language sql security definer set search_path='' as $$ update public.cloud_conflicts set resolution='cloud_adopted' where owner_id=auth.uid() and resolution is null; $$;
revoke all on function public.resolve_cloud_conflicts() from public,anon;
grant execute on function public.resolve_cloud_conflicts() to authenticated;
