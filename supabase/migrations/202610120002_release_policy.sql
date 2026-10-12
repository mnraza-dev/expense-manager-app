-- Public release metadata only. App users cannot change the required version.
create table public.app_release_policy (
 platform text primary key check(platform in ('android','ios')),
 enabled boolean not null default false,
 minimum_version text not null check(minimum_version ~ '^[0-9]{1,9}\.[0-9]{1,9}\.[0-9]{1,9}$'),
 minimum_build text check(minimum_build is null or minimum_build ~ '^[0-9]{1,9}(\.[0-9]{1,9}){0,2}$'),
 store_url text check(store_url is null or (length(store_url)<=2048 and store_url ~ '^https://[^[:space:]]+$')),
 message text not null default 'Update Settler to continue and use the latest features.' check(length(message)<=500),
 updated_at timestamptz not null default now(),
 check(not enabled or store_url is not null)
);
alter table public.app_release_policy enable row level security;
revoke all on public.app_release_policy from public,anon,authenticated;
grant select on public.app_release_policy to anon,authenticated;
grant all on public.app_release_policy to service_role;
create policy release_policy_read on public.app_release_policy for select to anon,authenticated using(true);
insert into public.app_release_policy(platform,minimum_version,minimum_build,store_url) values
 ('android','1.3.0','5','https://play.google.com/store/apps/details?id=com.razatechlabs.settler'),
 ('ios','1.3.0','5',null);
-- Enable only after the replacement binary is available at its destination.
