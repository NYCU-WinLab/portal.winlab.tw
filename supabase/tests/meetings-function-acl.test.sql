-- meetings function ACL regression suite — runs via `supabase test db`.
--
-- Every meetings pgTAP file opens with
--   grant execute on all functions in schema public to authenticated;
-- which is what keeps the rest of the suite runnable, but it also re-grants
-- exactly what the meetings migrations revoke — so nothing in those files
-- actually asserts a revoke holds (#1104). These assertions read the ACL
-- straight off pg_proc.proacl via aclexplode(), which survives the blanket
-- grant, instead of trying to prove a revoke by attempting a call.
--
-- Why this matters here specifically: this project's `alter default
-- privileges` hands anon/authenticated/service_role EXECUTE on every new
-- function in public by default, so a bare `revoke ... from public` never
-- removes what a role already directly holds — only an explicit per-role
-- revoke does. That makes an untested revoke a thin, silently-reversible
-- line of defence, and these are the assertions that would catch it
-- regressing.
--
-- Signatures and expected grantees were read from the running local DB
-- (pg_proc.proacl via aclexplode) rather than assumed from the migrations:
--   meetings_next_free_date(date)                             -> {postgres,service_role}
--   meeting_semester_start(date)                              -> {-,anon,authenticated,postgres,service_role}
--   meeting_semester_end(date)                                -> {-,anon,authenticated,postgres,service_role}
--   meetings_mint_week_label(date)                            -> {postgres,service_role}
--   meetings_generate_semester(date, int, jsonb)              -> {authenticated,postgres,service_role}
--   meetings_insert_week(uuid)                                -> {authenticated,postgres,service_role}
--   meetings_remove_week(uuid)                                -> {authenticated,postgres,service_role}
--   meetings_swap(uuid, uuid)                                 -> {authenticated,postgres,service_role}
--   meetings_append_week(int, smallint)                       -> {authenticated,postgres,service_role}
--
-- `a.grantee` from aclexplode() is an `oid`, not a role name — casting it
-- straight to text yields the numeric oid. The cast has to go through
-- `::regrole::text` to resolve it to the role's name.
--
-- IMPORTANT — grant ordering: the blanket
--   grant execute on all functions in schema public to authenticated;
-- does not just get *tested against* here, it actively MUTATES proacl —
-- confirmed live: running it grants meetings_mint_week_label to
-- authenticated too, same as any other function. So every assertion below
-- runs BEFORE that grant, capturing the ACL exactly as the migrations left
-- it. The grant still runs at the end of this file (matching the suite-wide
-- convention every other test file follows), it is just ordered after the
-- assertions instead of before them, since nothing here needs to call any
-- function as `authenticated` — this file only reads pg_proc as superuser.

begin;
create extension if not exists pgtap with schema public;

select plan(15);

-- ═══ the questioner reconcile: owner and service_role ONLY ══════════════════
-- meetings_reconcile_questioners carries NO permission check of its own — the
-- admin gate lives in the rebalance wrapper, and the COMMIT-time trigger
-- deliberately runs it for every writer (20260918090000). That makes this
-- revoke the only thing standing between a signed-in non-admin and a call
-- that rewrites every future questioner roster.
select is(
  (select array_agg(a.grantee::regrole::text order by a.grantee::regrole::text)
   from aclexplode((select proacl from pg_proc
                    where oid = 'public.meetings_reconcile_questioners(boolean, boolean)'::regprocedure)) a),
  array['postgres', 'service_role'],
  'the reconcile engine is callable by nobody but its owner and service_role'
);

-- The trigger functions and the queue helper are not part of the callable
-- surface at all — not even service_role's.
select is(
  (select count(*)::int
     from unnest(array['public.meetings_request_reconcile()',
                       'public.meetings_arm_reconcile()',
                       'public.meetings_arm_reconcile_for_member()',
                       'public.meetings_fire_reconcile()',
                       'public.meetings_take_questioner_lock()',
                       'public.meetings_presenter_pool_to_roster()',
                       'public.meetings_drop_presenter_questioner()']) f(sig)
    where (select array_agg(a.grantee::regrole::text)
             from aclexplode((select proacl from pg_proc
                              where oid = f.sig::regprocedure)) a) = array['postgres']),
  7,
  'every reconcile trigger function is owner-only'
);

select is(
  (select array_agg(a.grantee::regrole::text order by a.grantee::regrole::text)
   from aclexplode((select proacl from pg_proc
                    where oid = 'public.meetings_questioner_can_serve(uuid, uuid, date, uuid, boolean)'::regprocedure)) a),
  array['postgres', 'service_role'],
  'the eligibility rule is internal: owner and service_role only'
);

-- The roster RPCs are admin-checked inside; anon and PUBLIC never reach them.
select is(
  (select count(*)::int
     from unnest(array['public.meetings_question_pool_add(uuid)',
                       'public.meetings_question_pool_remove(uuid)',
                       'public.meetings_question_pool_set_enabled(uuid, boolean)']) f(sig)
    where (select array_agg(a.grantee::regrole::text order by a.grantee::regrole::text)
             from aclexplode((select proacl from pg_proc
                              where oid = f.sig::regprocedure)) a)
          = array['authenticated', 'postgres', 'service_role']),
  3,
  'the roster RPCs are callable by authenticated + service_role, never anon or PUBLIC'
);

select is(
  (select array_agg(a.grantee::regrole::text order by a.grantee::regrole::text)
   from aclexplode((select proacl from pg_proc
                    where oid = 'public.meetings_rebalance_questioners(boolean)'::regprocedure)) a),
  array['authenticated', 'postgres', 'service_role'],
  'the admin-checked rebalance wrapper is the only rebalance entry point users hold'
);

select is(
  (select array_agg(a.grantee::regrole::text order by a.grantee::regrole::text)
   from aclexplode((select proacl from pg_proc
                    where oid = 'public.meetings_recent_copair_count(uuid, uuid)'::regprocedure)) a),
  array['authenticated', 'postgres', 'service_role'],
  'the co-pairing tie-break helper is readable by signed-in users, not anon'
);

-- ═══ internal helpers: owner + service_role only, not even authenticated ═══
-- Called only from inside another SECURITY DEFINER function (a trigger, or an
-- admin RPC's own body) — never directly by a signed-in user.
select is(
  (select array_agg(a.grantee::regrole::text order by a.grantee::regrole::text)
   from aclexplode((select proacl from pg_proc
                    where oid = 'public.meetings_next_free_date(date)'::regprocedure)) a),
  array['postgres', 'service_role'],
  'meetings_next_free_date stays callable only by the owner and service_role'
);

select is(
  (select array_agg(a.grantee::regrole::text order by a.grantee::regrole::text)
   from aclexplode((select proacl from pg_proc
                    where oid = 'public.meetings_mint_week_label(date)'::regprocedure)) a),
  array['postgres', 'service_role'],
  'meetings_mint_week_label stays callable only by the owner and service_role'
);

-- ═══ pure date math: immutable, touches no table, safe for anyone ══════════
-- Same class as meeting_academic_year — no revoke was written for these, so
-- they carry the ordinary new-function ACL (owner, service_role, and the
-- platform's default anon/authenticated grants, plus PUBLIC itself).
select is(
  (select array_agg(a.grantee::regrole::text order by a.grantee::regrole::text)
   from aclexplode((select proacl from pg_proc
                    where oid = 'public.meeting_semester_start(date)'::regprocedure)) a),
  array['-', 'anon', 'authenticated', 'postgres', 'service_role'],
  'meeting_semester_start is callable by anyone, same class as meeting_academic_year'
);

select is(
  (select array_agg(a.grantee::regrole::text order by a.grantee::regrole::text)
   from aclexplode((select proacl from pg_proc
                    where oid = 'public.meeting_semester_end(date)'::regprocedure)) a),
  array['-', 'anon', 'authenticated', 'postgres', 'service_role'],
  'meeting_semester_end is callable by anyone, same class as meeting_academic_year'
);

-- ═══ admin RPCs: anon (and public) revoked, authenticated still granted ════
-- These are the write paths a signed-in meetings admin calls directly from
-- the client; RLS/is_meetings_admin() inside each function is the real
-- gate, but anon must never even reach that check.
select is(
  (select array_agg(a.grantee::regrole::text order by a.grantee::regrole::text)
   from aclexplode((select proacl from pg_proc
                    where oid = 'public.meetings_generate_semester(date, int, jsonb)'::regprocedure)) a),
  array['authenticated', 'postgres', 'service_role'],
  'meetings_generate_semester is callable by authenticated + service_role, anon is absent'
);

select is(
  (select array_agg(a.grantee::regrole::text order by a.grantee::regrole::text)
   from aclexplode((select proacl from pg_proc
                    where oid = 'public.meetings_insert_week(uuid)'::regprocedure)) a),
  array['authenticated', 'postgres', 'service_role'],
  'meetings_insert_week is callable by authenticated + service_role, anon is absent'
);

select is(
  (select array_agg(a.grantee::regrole::text order by a.grantee::regrole::text)
   from aclexplode((select proacl from pg_proc
                    where oid = 'public.meetings_remove_week(uuid)'::regprocedure)) a),
  array['authenticated', 'postgres', 'service_role'],
  'meetings_remove_week is callable by authenticated + service_role, anon is absent'
);

select is(
  (select array_agg(a.grantee::regrole::text order by a.grantee::regrole::text)
   from aclexplode((select proacl from pg_proc
                    where oid = 'public.meetings_swap(uuid, uuid)'::regprocedure)) a),
  array['authenticated', 'postgres', 'service_role'],
  'meetings_swap is callable by authenticated + service_role, anon is absent'
);

select is(
  (select array_agg(a.grantee::regrole::text order by a.grantee::regrole::text)
   from aclexplode((select proacl from pg_proc
                    where oid = 'public.meetings_append_week(int, smallint)'::regprocedure)) a),
  array['authenticated', 'postgres', 'service_role'],
  'meetings_append_week is callable by authenticated + service_role, anon is absent'
);

-- Kept for suite-wide consistency, and harmless here: every assertion this
-- file makes has already run above, before this grant can touch proacl.
grant execute on all functions in schema public to authenticated;

select * from finish();
rollback;
