-- Play-distributed Android clients update only through their own Play listing.
-- Invalid historical destinations are disabled, not silently redirected while blocking users.
update public.app_release_policy
set enabled=false, store_url=null
where platform='android' and store_url is not null
  and store_url <> 'https://play.google.com/store/apps/details?id=com.razatechlabs.settler';
alter table public.app_release_policy add constraint android_play_update_destination
  check (platform <> 'android' or store_url is null
    or store_url='https://play.google.com/store/apps/details?id=com.razatechlabs.settler');
