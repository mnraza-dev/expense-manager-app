create function public.cloud_entity_valid(entity text,d jsonb) returns boolean language sql immutable set search_path='' as $$
select case entity
when 'accounts' then length(trim(d->>'name'))>0 and d->>'type' in ('cash','bank','savings','wallet','other') and d->>'archived' in ('0','1')
when 'categories' then length(trim(d->>'name'))>0 and d->>'type' in ('income','expense') and d->>'archived' in ('0','1')
when 'account_roles' then d->>'historical_assumption' in ('0','1') and ((d->>'kind'='asset' and d->>'subtype' in ('standard','loan_receivable')) or (d->>'kind'='liability' and d->>'subtype' in ('credit_card','loan_payable')))
when 'ledger_accounts' then d->>'kind' in ('asset','liability','income','expense','equity') and length(trim(d->>'name'))>0
when 'credit_cards' then (d->>'credit_limit')::numeric>0 and (d->>'closing_day')::integer between 1 and 31 and (d->>'due_day')::integer between 1 and 31
when 'card_statements' then (d->>'period_start')::date<=(d->>'period_end')::date and (d->>'due_date')::date>(d->>'period_end')::date
when 'budgets' then d->>'period_type'='monthly' and extract(day from (d->>'period_start')::date)=1 and (d->>'period_end')::date=((d->>'period_start')::date+interval '1 month'-interval '1 day')::date and (d->>'total_limit_minor')::numeric>0 and length(trim(d->>'name'))>0
when 'budget_categories' then (d->>'limit_minor')::numeric>0
when 'loans' then d->>'direction' in ('borrowed','lent') and d->>'label' in ('personal','other') and (d->>'principal')::numeric>0 and d->>'status' in ('active','closed') and d->>'interest_method' in ('none','flat','reducing') and (d->>'annual_rate_bps' is null or (d->>'annual_rate_bps')::integer between 0 and 10000) and d->>'frequency' in ('monthly','quarterly','yearly') and (d->>'term_months' is null or ((d->>'term_months')::integer between 1 and 600 and (d->>'term_months')::integer % case d->>'frequency' when 'monthly' then 1 when 'quarterly' then 3 else 12 end=0)) and length(trim(d->>'name'))>0
when 'loan_schedules' then d->>'status' in ('scheduled','superseded') and (d->>'version')::integer>0 and (d->>'paid_principal_baseline')::numeric>=0 and (d->>'paid_interest_baseline')::numeric>=0
when 'loan_payments' then d->>'status' in ('posted','void') and (d->>'principal')::numeric+(d->>'interest')::numeric+(d->>'fees')::numeric>0
when 'recurring_rules' then d->>'type' in ('income','expense','loan_payment') and (d->>'amount')::numeric>0 and d->>'frequency' in ('daily','weekly','monthly','quarterly','yearly') and d->>'status' in ('enabled','paused','cancelled') and (d->>'next_index')::numeric>=0 and (d->>'end_date' is null or (d->>'end_date')::date>=(d->>'start_date')::date) and ((d->>'type'='loan_payment' and d->>'loan_id' is not null and d->>'category_id' is null) or (d->>'type'<>'loan_payment' and d->>'loan_id' is null and d->>'category_id' is not null))
when 'recurring_occurrences' then d->>'status' in ('scheduled','completed','skipped','cancelled') and (d->>'occurrence_index')::numeric>=0
when 'transaction_journals' then (d->>'version')::integer>0
else true end $$;
revoke all on function public.cloud_entity_valid(text,jsonb) from public,anon,authenticated;

create function public.validate_cloud_graph(who uuid) returns void language plpgsql security definer set search_path='' as $$
declare r record; spec record; field record; v jsonb; target text; n numeric; d numeric;c numeric; tx record;j record; debit_target uuid;credit_target uuid;
begin
 if (select count(*) from public.cloud_records where owner_id=who and not deleted)>10000 then raise exception 'dataset_size_limit';end if;
 for r in select * from public.cloud_records where owner_id=who and not deleted loop
  select * into spec from public.cloud_schema where entity=r.entity;
  if not found or jsonb_typeof(r.data)<>'object' or (select count(*) from jsonb_object_keys(r.data))<>(select count(*) from jsonb_object_keys(spec.columns)) then raise exception 'invalid_schema';end if;
  for field in select key,value from jsonb_each(spec.columns) loop
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
  if public.cloud_entity_valid(r.entity,r.data) is not true then raise exception 'invalid_financial_fields';end if;
  if r.data ? 'id' and (r.data->>'id')::uuid<>r.id then raise exception 'id_mismatch';end if;
  for field in select key,value from jsonb_each_text(spec.refs) loop
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
 if exists(select 1 from public.cloud_records role join public.cloud_records a on a.owner_id=who and a.entity='ledger_accounts' and not a.deleted and a.data->>'account_id'=role.data->>'account_id' where role.owner_id=who and role.entity='account_roles' and not role.deleted and role.data->>'kind'<>a.data->>'kind') then raise exception 'account_role_mismatch';end if;
 if exists(select 1 from public.cloud_records a join public.cloud_records cat on cat.owner_id=who and cat.id=(a.data->>'category_id')::uuid where a.owner_id=who and a.entity='ledger_accounts' and not a.deleted and a.data->>'category_id' is not null and a.data->>'kind'<>cat.data->>'type') then raise exception 'category_mapping_mismatch';end if;
 if exists(select 1 from public.cloud_records card where card.owner_id=who and card.entity='credit_cards' and not card.deleted and not exists(select 1 from public.cloud_records role where role.owner_id=who and role.entity='account_roles' and not role.deleted and role.data->>'account_id'=card.data->>'account_id' and role.data->>'subtype'='credit_card')) then raise exception 'invalid_card_role';end if;
 if exists(select 1 from public.cloud_records s where s.owner_id=who and s.entity='card_statements' and not s.deleted and not exists(select 1 from public.cloud_records card where card.owner_id=who and card.entity='credit_cards' and not card.deleted and card.data->>'account_id'=s.data->>'account_id')) then raise exception 'invalid_statement_reference';end if;
 if exists(select 1 from public.cloud_records allocation join public.cloud_records cat on cat.owner_id=who and cat.id=(allocation.data->>'category_id')::uuid where allocation.owner_id=who and allocation.entity='budget_categories' and not allocation.deleted and cat.data->>'type'<>'expense') then raise exception 'invalid_budget_category';end if;
 for r in select * from public.cloud_records where owner_id=who and entity='ledger_journals' and not deleted and data->>'reversal_of' is not null loop
  select * into j from public.cloud_records where owner_id=who and id=(r.data->>'reversal_of')::uuid;
  if j.data->>'date'<>r.data->>'date' or exists(select data->>'ledger_account_id',data->>'debit',data->>'credit',data->>'currency' from public.cloud_records where owner_id=who and entity='ledger_lines' and not deleted and data->>'journal_id'=j.id::text except select data->>'ledger_account_id',data->>'credit',data->>'debit',data->>'currency' from public.cloud_records where owner_id=who and entity='ledger_lines' and not deleted and data->>'journal_id'=r.id::text) or exists(select data->>'ledger_account_id',data->>'credit',data->>'debit',data->>'currency' from public.cloud_records where owner_id=who and entity='ledger_lines' and not deleted and data->>'journal_id'=r.id::text except select data->>'ledger_account_id',data->>'debit',data->>'credit',data->>'currency' from public.cloud_records where owner_id=who and entity='ledger_lines' and not deleted and data->>'journal_id'=j.id::text) then raise exception 'reversal_mismatch';end if;
 end loop;
 for r in select * from public.cloud_records where owner_id=who and entity='loans' and not deleted loop
  if not exists(select 1 from public.cloud_records role where role.owner_id=who and role.entity='account_roles' and not role.deleted and role.data->>'account_id'=r.data->>'account_id' and role.data->>'subtype'=case when r.data->>'direction'='borrowed' then 'loan_payable' else 'loan_receivable' end) then raise exception 'loan_role_mismatch';end if;
  select id into debit_target from public.cloud_records where owner_id=who and entity='ledger_accounts' and not deleted and data->>'account_id'=r.data->>'account_id';
  select coalesce(sum(case when r.data->>'direction'='borrowed' then (data->>'credit')::numeric-(data->>'debit')::numeric else (data->>'debit')::numeric-(data->>'credit')::numeric end),0) into n from public.cloud_records where owner_id=who and entity='ledger_lines' and not deleted and data->>'ledger_account_id'=debit_target::text;
  select coalesce(sum((data->>'principal')::numeric),0) into d from public.cloud_records where owner_id=who and entity='loan_payments' and not deleted and data->>'loan_id'=r.id::text and data->>'status'='posted';
  if n<>(r.data->>'principal')::numeric-d or n<0 then raise exception 'loan_balance_mismatch';end if;
 end loop;
 for r in select * from public.cloud_records where owner_id=who and entity='loan_payments' and not deleted loop
  for field in select * from (values ('principal','principal_transaction_id'),('interest','interest_transaction_id'),('fee','fee_transaction_id')) x(kind,ref) loop
   target=case field.kind when 'fee' then 'fees' else field.kind end;
   if (r.data->>target)::numeric=0 then if r.data->>field.ref is not null then raise exception 'loan_zero_component';end if;continue;end if;
   select * into tx from public.cloud_records where owner_id=who and entity='transactions' and not deleted and id=(r.data->>field.ref)::uuid;
   if not found or tx.data->>'amount'<>r.data->>target or tx.data->>'component'<>field.kind or tx.data->>'loan_id'<>r.data->>'loan_id' or tx.data->>'date'<>r.data->>'date' or tx.data->>'status'<>r.data->>'status' then raise exception 'loan_component_mismatch';end if;
  end loop;
 end loop;
 if exists(select 1 from public.cloud_records b where owner_id=who and entity='budgets' and not deleted and (select coalesce(sum((a.data->>'limit_minor')::numeric),0) from public.cloud_records a where a.owner_id=who and a.entity='budget_categories' and not a.deleted and a.data->>'budget_id'=b.id::text)>(b.data->>'total_limit_minor')::numeric) then raise exception 'budget_overallocated';end if;
 if exists(select 1 from public.cloud_records occ where owner_id=who and entity='recurring_occurrences' and not deleted and ((data->>'status'='completed' and ((data->>'transaction_id' is null)=(data->>'loan_payment_id' is null))) or (data->>'status'<>'completed' and (data->>'transaction_id' is not null or data->>'loan_payment_id' is not null)))) then raise exception 'occurrence_links';end if;
end $$;
revoke all on function public.validate_cloud_graph(uuid) from public,anon,authenticated;

create function public.apply_sync(operation jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare who uuid=auth.uid(); op uuid; op_fingerprint text; receipt jsonb; change jsonb; old public.cloud_records; head bigint; conflict uuid; reason text; result jsonb;
begin
 if who is null or not public.cloud_allowed('multi_device_sync') then raise exception 'cloud_access_required';end if;
 if (select count(distinct value->>'id') from jsonb_array_elements(operation->'changes'))<>jsonb_array_length(operation->'changes') then raise exception 'duplicate_operation_records';end if;
 if operation->>'schema_version'<>'4' or jsonb_typeof(operation->'changes')<>'array' or jsonb_array_length(operation->'changes') not between 1 and 10000 or octet_length(operation::text)>20000000 then raise exception 'unsupported_operation';end if;
 op=(operation->>'id')::uuid;op_fingerprint=encode(sha256(convert_to(operation::text,'UTF8')),'hex');
 insert into public.cloud_heads(owner_id) values(who) on conflict do nothing;
 select revision into head from public.cloud_heads where owner_id=who for update;
 select o.result into receipt from public.cloud_operations o where owner_id=who and id=op and o.fingerprint=op_fingerprint;
 if found then return receipt;end if;
 if exists(select 1 from public.cloud_operations where owner_id=who and id=op) then raise exception 'idempotency_payload_mismatch';end if;
 begin
  for change in select value from jsonb_array_elements(operation->'changes') loop
   select * into old from public.cloud_records where owner_id=who and id=(change->>'id')::uuid;
   if (coalesce(old.revision,0)<>(change->>'expected_revision')::bigint and not (old.id is not null and old.data=change->'data' and old.deleted=(change->>'deleted')::boolean)) or (old.id is not null and old.entity<>change->>'entity') then raise exception 'revision_conflict';end if;
   if old.deleted and not (change->>'deleted')::boolean then raise exception 'deleted_record_cannot_resurrect';end if;
   if old.entity='ledger_accounts' and (old.data->>'kind' is distinct from change->'data'->>'kind' or old.data->>'currency' is distinct from change->'data'->>'currency') and exists(select 1 from public.cloud_records where owner_id=who and entity='ledger_lines' and not deleted and data->>'ledger_account_id'=old.id::text) then raise exception 'immutable_account_classification';end if;
   if old.id is not null and old.entity in ('ledger_journals','ledger_lines','transaction_journals') and ((change->>'deleted')::boolean or old.data is distinct from change->'data') then raise exception 'immutable_accounting_history';end if;
  end loop;
  for change in select value from jsonb_array_elements(operation->'changes') loop
   select * into old from public.cloud_records where owner_id=who and id=(change->>'id')::uuid;
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
 insert into public.cloud_operations(owner_id,id,fingerprint,result) values(who,op,op_fingerprint,result);
 return result;
end $$;
revoke all on function public.apply_sync(jsonb) from public,anon;
grant execute on function public.apply_sync(jsonb) to authenticated;

create function public.cloud_snapshot(after_revision bigint default 0) returns jsonb language plpgsql security definer set search_path='' as $$
declare who uuid=auth.uid();begin
 if who is null then raise exception 'authentication_required';end if;
 return jsonb_build_object('owner_id',who,'schema_version',4,'revision',coalesce((select revision from public.cloud_heads where owner_id=who),0),'record_count',(select count(*) from public.cloud_records where owner_id=who and not deleted),'records',coalesce((select jsonb_agg(jsonb_build_object('id',id,'entity',entity,'data',data,'revision',revision,'deleted',deleted)) from public.cloud_records where owner_id=who and revision>after_revision),'[]'::jsonb));
end $$;
revoke all on function public.cloud_snapshot(bigint) from public,anon;
grant execute on function public.cloud_snapshot(bigint) to authenticated;
create function public.resolve_cloud_conflicts() returns void language sql security definer set search_path='' as $$ update public.cloud_conflicts set resolution='cloud_adopted' where owner_id=auth.uid() and resolution is null; $$;
revoke all on function public.resolve_cloud_conflicts() from public,anon;
grant execute on function public.resolve_cloud_conflicts() to authenticated;
