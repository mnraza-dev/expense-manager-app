-- Owner-scoped canonical records. All financial writes go through apply_sync.
create table public.cloud_policy(id boolean primary key default true check(id),free_cloud boolean not null default true,backup_limit integer not null default 5 check(backup_limit between 1 and 30),extended_backup_limit integer not null default 30 check(extended_backup_limit between 1 and 100));
insert into public.cloud_policy(id) values(true);
create table public.cloud_entitlements(owner_id uuid not null references auth.users(id) on delete cascade,name text not null,expires_at timestamptz,active boolean not null,verified_at timestamptz not null default now(),primary key(owner_id,name));
create table public.cloud_heads(owner_id uuid primary key references auth.users(id) on delete cascade,revision bigint not null default 0);
create table public.cloud_records(owner_id uuid not null references auth.users(id) on delete cascade,id uuid not null,entity text not null,data jsonb,revision bigint not null,deleted boolean not null default false,updated_at timestamptz not null default now(),primary key(owner_id,id));
create index cloud_records_checkpoint on public.cloud_records(owner_id,revision,id);
create table public.cloud_operations(owner_id uuid not null references auth.users(id) on delete cascade,id uuid not null,fingerprint text not null,result jsonb not null,created_at timestamptz not null default now(),primary key(owner_id,id));
create table public.cloud_conflicts(owner_id uuid not null references auth.users(id) on delete cascade,id uuid not null default gen_random_uuid(),operation_id uuid not null,proposal jsonb not null,current_records jsonb not null,reason text not null,resolution text check(resolution in ('cloud_adopted','retained_for_review')),created_at timestamptz not null default now(),primary key(owner_id,id));
create table public.cloud_backups(owner_id uuid not null references auth.users(id) on delete cascade,id uuid not null default gen_random_uuid(),object_path text not null unique,status text not null default 'pending' check(status in ('pending','verified')),schema_version integer not null check(schema_version in (3,4)),app_version text not null,sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),snapshot_id uuid not null,byte_size integer not null check(byte_size between 1 and 20000000),created_at timestamptz not null default now(),verified_at timestamptz,primary key(owner_id,id));
create table public.cloud_schema(entity text primary key,columns jsonb not null,refs jsonb not null);
-- The following definition insert is generated from the versioned SQLite schema by the repository build script.

alter table public.cloud_policy enable row level security;
create policy cloud_policy_read on public.cloud_policy for select to authenticated using(true);
do $$ declare t text; begin
 foreach t in array array['cloud_entitlements','cloud_heads','cloud_records','cloud_operations','cloud_conflicts','cloud_backups'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('create policy owner_read on public.%I for select to authenticated using(owner_id=(select auth.uid()))',t);
 execute format('revoke all on public.%I from anon,authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 end loop;
end $$;
alter table public.cloud_schema enable row level security;
revoke all on public.cloud_schema,public.cloud_policy from anon,authenticated;
grant select on public.cloud_policy to authenticated;
create function public.cloud_allowed(feature text) returns boolean language sql stable security definer set search_path='' as $$ select auth.uid() is not null and (exists(select 1 from public.cloud_policy where free_cloud) or exists(select 1 from public.cloud_entitlements where owner_id=auth.uid() and name=feature and active and (expires_at is null or expires_at>now()))); $$;
revoke all on function public.cloud_allowed(text) from public,anon;
grant execute on function public.cloud_allowed(text) to authenticated;

-- Business keys enforce deduplication across devices, not merely per device.
create unique index occurrence_date_unique on public.cloud_records(owner_id,(data->>'rule_id'),(data->>'scheduled_date')) where entity='recurring_occurrences' and not deleted;
create unique index occurrence_index_unique on public.cloud_records(owner_id,(data->>'rule_id'),(data->>'occurrence_index')) where entity='recurring_occurrences' and not deleted;
create unique index category_name_unique on public.cloud_records(owner_id,(data->>'name'),(data->>'type')) where entity='categories' and not deleted;
create unique index budget_period_unique on public.cloud_records(owner_id,(data->>'period_start')) where entity='budgets' and not deleted;
create unique index statement_period_unique on public.cloud_records(owner_id,(data->>'account_id'),(data->>'period_end')) where entity='card_statements' and not deleted;
create unique index posting_key_unique on public.cloud_records(owner_id,(data->>'posting_key')) where entity='ledger_journals' and not deleted;
create unique index reversal_unique on public.cloud_records(owner_id,(data->>'reversal_of')) where entity='ledger_journals' and not deleted and data->>'reversal_of' is not null;
create unique index mapping_account_unique on public.cloud_records(owner_id,entity,(data->>'account_id')) where entity in ('ledger_accounts','account_roles','credit_cards','loans') and not deleted and data->>'account_id' is not null;
create unique index mapping_category_unique on public.cloud_records(owner_id,(data->>'category_id')) where entity='ledger_accounts' and not deleted and data->>'category_id' is not null;
create unique index transaction_version_unique on public.cloud_records(owner_id,(data->>'transaction_id'),(data->>'version')) where entity='transaction_journals' and not deleted;
create unique index transaction_journal_unique on public.cloud_records(owner_id,(data->>'journal_id')) where entity='transaction_journals' and not deleted;
create unique index occurrence_transaction_unique on public.cloud_records(owner_id,(data->>'transaction_id')) where entity='recurring_occurrences' and not deleted and data->>'transaction_id' is not null;
create unique index occurrence_payment_unique on public.cloud_records(owner_id,(data->>'loan_payment_id')) where entity='recurring_occurrences' and not deleted and data->>'loan_payment_id' is not null;
create unique index setting_unique on public.cloud_records(owner_id,(data->>'key')) where entity='app_settings' and not deleted;
