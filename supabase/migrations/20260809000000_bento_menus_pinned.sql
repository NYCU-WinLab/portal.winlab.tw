-- Pinning keeps the restaurant the lab orders from most at the top of
-- /bento/menus. It lives in the row rather than in a constant so swapping the
-- pinned store is a click, not a redeploy.
--
-- No new policy: "Admins can update menus" already gates every UPDATE on
-- bento_menus behind is_admin or roles->'bento' ? 'admin', and that covers the
-- new column too.
alter table public.bento_menus
  add column if not exists is_pinned boolean not null default false;

comment on column public.bento_menus.is_pinned is
  'Sorts this restaurant above all others on /bento/menus. Toggled by bento admins.';
