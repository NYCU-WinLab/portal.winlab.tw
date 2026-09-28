-- #1144: take INSERT / UPDATE / DELETE on the questioner tables away from anon,
-- and write down what writing to them now means.
--
-- Nothing is exploitable today and nothing changes behaviour. All three tables
-- carry policies for `authenticated` only, so anon's RLS-visible row set is
-- empty in every direction — the grants have been decorative since
-- 20260706000000 mirrored meeting_groups' grant block wholesale, and
-- 20260902045740 already clawed back TRUNCATE / REFERENCES / TRIGGER.
--
-- The reason to finish the job is what #1140 attached to these tables. Both
-- pool tables now carry AFTER INSERT / AFTER DELETE statement triggers that
-- call meetings_rebalance_questioners_exec(false) — a function deliberately
-- written WITHOUT an authorization check and revoked from every role, because
-- its caller is supposed to have done the checking. So write access to a pool
-- table is now write access to every future week's questioner roster, and
-- nothing in the schema says so.
--
-- The realistic way that bites is a reasonable-looking policy. The day someone
-- implements "members may add themselves to the question pool" with
--   create policy ... for insert to authenticated with check (user_id = auth.uid())
-- self-service joining silently becomes a privileged operation that rewrites
-- the whole schedule. The comments below are addressed to that person.
--
-- SELECT is deliberately left in place. It grants anon nothing today either,
-- but removing it is a product decision about whether an unauthenticated
-- schedule page may ever exist, not a security fix.

revoke insert, update, delete on public.meeting_question_pool   from anon;
revoke insert, update, delete on public.meeting_presenter_pool  from anon;
revoke insert, update, delete on public.meeting_questioners     from anon;

comment on table public.meeting_question_pool is
  'Extra questioner-rotation members (those not already in meeting_presenter_pool). WRITING TO THIS TABLE REWRITES THE SCHEDULE: since 20260914083733 an insert or delete fires a statement trigger that runs meetings_rebalance_questioners_exec over every future week. Any new RLS policy here is granting that power, not just pool membership.';

comment on table public.meeting_presenter_pool is
  'Presenter rotation roster; also the primary half of the questioner pool. WRITING TO THIS TABLE REWRITES THE SCHEDULE — see meeting_question_pool''s comment. Note also that the FK to user_profiles is ON DELETE CASCADE, and a cascade delete arrives at the statement trigger with a non-empty transition table: deleting one account rebalances every future week. Only service_role can reach that path today.';

comment on function public.meetings_pool_changed() is
  'Statement trigger on both pool tables: rebalances every future week''s questioners after any membership change. Calls meetings_rebalance_questioners_exec(false), which performs NO authorization check of its own — whoever can write the pool table is authorized by that write alone.';
