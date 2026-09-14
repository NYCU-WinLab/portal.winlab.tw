-- Rebalance whenever the candidate pool actually changes membership.
--
-- A trigger on the tables, not a call inside the RPCs, because not every path
-- goes through an RPC: useAddPoolMember does a plain upsert on
-- meeting_question_pool from the browser, and an admin repairing the table by
-- hand goes through neither. The tables are the only chokepoint all of them
-- share. This is the direct fix for the reported symptom — five members added
-- in August were still on zero in September, because nothing revisited the
-- weeks that were already full.
--
-- FOR EACH STATEMENT, so adding five people in one insert rebalances once
-- rather than five times. UPDATE is deliberately not a trigger event:
-- meetings_pool_compact and meetings_pool_move only renumber sort_order, which
-- changes presentation order and not who is eligible to question.
--
-- WHY A TRANSITION TABLE. A statement-level trigger fires even when the
-- statement touched nothing — an upsert that hit ignoreDuplicates, a delete
-- whose rows RLS filtered away. Rewriting every future roster because someone
-- re-added a member who was already there is both wasteful and surprising, and
-- an empty `changed` is the only way to tell that case apart. Both triggers on
-- a table name their transition table `changed`, which is what lets one
-- function serve the insert and the delete.
--
-- It calls the ENGINE, not the admin-checked wrapper. Authorization for a pool
-- write is RLS's job and has already happened by the time this runs; asking
-- again here can only produce false negatives, and did — see
-- 20260914100300's header.
--
-- THIS MAKES POOL EDITS REWRITE FUTURE ROSTERS. Adding one member reshuffles
-- every week after the next one — that is the point, but it means a roster can
-- change without anyone opening that week, and it now staffs future weeks that
-- previously stayed empty until their presenter was set. The frozen week and
-- every manual assignment are the two things that survive it.
create or replace function public.meetings_pool_changed()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not exists (select 1 from changed) then
    return null;
  end if;

  perform public.meetings_rebalance_questioners_exec(false);
  return null;
end;
$function$;

-- Named roles, not just PUBLIC: the project's `alter default privileges` hands
-- anon / authenticated / service_role a DIRECT grant on every new function, and
-- revoking from PUBLIC leaves a direct grant untouched. Calling a trigger
-- function directly errors anyway, so this is hygiene rather than a hole being
-- closed — but an ACL that says what it means is what makes the ACL test
-- meaningful.
revoke all on function public.meetings_pool_changed()
  from public, anon, authenticated, service_role;

drop trigger if exists meeting_question_pool_rebalance on public.meeting_question_pool;
drop trigger if exists meeting_question_pool_rebalance_ins on public.meeting_question_pool;
drop trigger if exists meeting_question_pool_rebalance_del on public.meeting_question_pool;

create trigger meeting_question_pool_rebalance_ins
  after insert on public.meeting_question_pool
  referencing new table as changed
  for each statement
  execute function public.meetings_pool_changed();

create trigger meeting_question_pool_rebalance_del
  after delete on public.meeting_question_pool
  referencing old table as changed
  for each statement
  execute function public.meetings_pool_changed();

drop trigger if exists meeting_presenter_pool_rebalance on public.meeting_presenter_pool;
drop trigger if exists meeting_presenter_pool_rebalance_ins on public.meeting_presenter_pool;
drop trigger if exists meeting_presenter_pool_rebalance_del on public.meeting_presenter_pool;

create trigger meeting_presenter_pool_rebalance_ins
  after insert on public.meeting_presenter_pool
  referencing new table as changed
  for each statement
  execute function public.meetings_pool_changed();

create trigger meeting_presenter_pool_rebalance_del
  after delete on public.meeting_presenter_pool
  referencing old table as changed
  for each statement
  execute function public.meetings_pool_changed();
