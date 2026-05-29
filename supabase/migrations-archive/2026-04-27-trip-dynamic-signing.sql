-- Trip auto-sign V2: PDFs in storage stay unsigned. Signing is applied at
-- view / download time using the user's saved signature + global preference.

-- Per-user global signing preference. One row per user; default off.
-- Column is `corner` rather than `position` because the latter is a reserved
-- word in Postgres SQL grammar.
create table public.user_sign_prefs (
  user_id    uuid primary key references public.user_profiles(id) on delete cascade,
  enabled    boolean not null default false,
  corner     text not null default 'br'
               check (corner in ('tl','tr','bl','br')),
  updated_at timestamptz not null default now()
);

alter table public.user_sign_prefs enable row level security;

create policy "user_sign_prefs_select"
on public.user_sign_prefs for select
using (
  user_id = auth.uid()
  or public.is_trip_admin()
);

create policy "user_sign_prefs_insert_own"
on public.user_sign_prefs for insert
with check (user_id = auth.uid());

create policy "user_sign_prefs_update_own"
on public.user_sign_prefs for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "user_sign_prefs_delete_own"
on public.user_sign_prefs for delete
using (user_id = auth.uid());

-- Admin batch: returns saved-signature + pref for every member who has files
-- in the given trip. Caller must be a trip admin (enforced inside).
create or replace function public.trip_admin_get_member_signatures(p_trip_id uuid)
returns table (
  member_id uuid,
  signature text,
  enabled   boolean,
  corner    text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    afv.user_id                  as member_id,
    afv.value                    as signature,
    coalesce(p.enabled, false)   as enabled,
    coalesce(p.corner, 'br')     as corner
  from public.approve_user_field_values afv
  left join public.user_sign_prefs p on p.user_id = afv.user_id
  where afv.category = 'signature'
    and afv.user_id in (
      select distinct tf.user_id
      from public.trip_files tf
      where tf.trip_id = p_trip_id
        and tf.user_id is not null
    )
    and public.is_trip_admin();
$$;

grant execute on function public.trip_admin_get_member_signatures(uuid) to authenticated;
