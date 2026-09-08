-- One-off data fix: 2026-11-30 has 詹詠翔 as both presenter and questioner.
--
-- Not a bug in the exclusion rule — that rule compares user_id, and this
-- person has two of them. A pre-Keycloak Google sign-in with a personal Gmail
-- address (eee54361…, created 2026-01-13, last used 2026-04-05) and the NYCU
-- account they use now (51268bd5…, username zyx1121). The week points at the
-- first, the question pool holds the second, so meetings_sync_questioners saw
-- two different people and left both in place.
--
-- Only the week needs repointing. The shell profile is deliberately NOT
-- deleted: nothing else references it, the candidate whitelist added in this
-- same batch already hides it (its lab_status resolves to NULL — Keycloak has
-- no such user), and dropping an auth.users row cascades in ways no data fix
-- should risk.
--
-- Scoped by BOTH the date and the old id, so it is a no-op on any database
-- that does not carry this exact row — the local and CI databases included.
update public.meetings
set presenter_user_id = '51268bd5-712d-4155-abd9-e9203db26f9f'
where scheduled_date = '2026-11-30'
  and presenter_user_id = 'eee54361-c66c-4cf4-807a-581c12a15829';

-- Re-derive that week's questioners now the presenter is the id the pool
-- knows. sync drops the questioner row that equals the presenter and backfills
-- the freed slot from the rotation.
do $$
declare
  v_meeting_id uuid;
begin
  select id into v_meeting_id
  from public.meetings
  where scheduled_date = '2026-11-30'
    and presenter_user_id = '51268bd5-712d-4155-abd9-e9203db26f9f';

  if found then
    perform public.meetings_sync_questioners(v_meeting_id);
  end if;
end;
$$;
