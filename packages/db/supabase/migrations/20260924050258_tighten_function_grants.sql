-- Tighten EXECUTE grants on a handful of SECURITY DEFINER functions and
-- require a signed-in caller for the quiz RPCs.
--
-- Background: on prod, the functions below carried EXECUTE for anon (observed
-- 2026-09-24 via the function ACLs), although earlier migrations revoked it
-- from PUBLIC. This migration revokes PUBLIC and anon explicitly and restates
-- the intended grantees, the same shape 20260917122038 uses.
--
-- Applied to prod before merge, recorded as version 20260924050258.
--
-- 1. Quiz RPCs get_current_question / advance_quiz_session /
--    reveal_quiz_answer (latest bodies from 20260824101006, unchanged except
--    for a leading guard): the host actions now require a signed-in caller.
--
-- 2. get_game_leaderboard: only ever called by signed-in members (the /games
--    hook behind the proxy, and the MCP tool with the caller's JWT). No RLS
--    policy references it.
--
-- NOT revoked here, on purpose:
--   approve_doc_status / approve_is_creator / approve_is_signer / has_role
--   are called from RLS policies declared `to public` (approve_documents,
--   approve_fields, approve_signers, bento_order_items, bento_option_groups,
--   bento_option_values, and storage.objects for bento-menus). A policy
--   expression runs with the querying role's EXECUTE privilege, so revoking
--   anon would turn an empty result into a "permission denied" error for any
--   anon query on those tables. Narrowing those policies to
--   `to authenticated` first is a separate change.
--
-- has_role additionally gets a pinned search_path. Every reference in its
-- body is either schema-qualified (public.user_profiles) or a pg_catalog
-- built-in (jsonb, the ? operator), so an empty search_path is safe.

create or replace function public.get_current_question(p_session_id uuid)
returns table (
  question_id uuid,
  "position" smallint,
  question_count integer,
  question_text text,
  choices text[],
  time_limit_seconds smallint,
  question_started_at timestamptz,
  correct_index smallint,
  my_choice_index smallint,
  my_is_correct boolean,
  my_points_awarded integer
)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_session public.quiz_sessions;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select * into v_session from public.quiz_sessions where id = p_session_id;

  if v_session.id is null then
    raise exception 'session not found' using errcode = 'P0001';
  end if;

  if v_session.host_id <> auth.uid() and not public.is_quiz_participant(p_session_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if v_session.status = 'lobby' then
    return;
  end if;

  return query
  select
    qsq.id,
    qsq.position,
    (select count(*)::integer from public.quiz_session_questions where session_id = p_session_id),
    qsq.question_text,
    qsq.choices,
    qsq.time_limit_seconds,
    v_session.question_started_at,
    case when v_session.status in ('reveal', 'ended') then qsq.correct_index else null end,
    case when v_session.status in ('reveal', 'ended') then qa.choice_index else null end,
    case when v_session.status in ('reveal', 'ended') then qa.is_correct else null end,
    case when v_session.status in ('reveal', 'ended') then qa.points_awarded else null end
  from public.quiz_session_questions qsq
  left join public.quiz_players qp
    on qp.session_id = p_session_id and qp.user_id = auth.uid()
  left join public.quiz_answers qa
    on qa.question_id = qsq.id and qa.player_id = qp.id
  where qsq.session_id = p_session_id
    and qsq.position = v_session.current_question_position;
end;
$function$;

create or replace function public.advance_quiz_session(p_session_id uuid)
returns public.quiz_sessions
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_session public.quiz_sessions;
  v_question_count integer;
  v_next_position smallint;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select * into v_session from public.quiz_sessions where id = p_session_id;

  if v_session.id is null then
    raise exception 'session not found' using errcode = 'P0001';
  end if;

  if v_session.host_id <> auth.uid() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if v_session.status not in ('lobby', 'reveal') then
    raise exception '目前狀態無法進入下一題' using errcode = 'P0001';
  end if;

  select count(*) into v_question_count
  from public.quiz_session_questions
  where session_id = p_session_id;

  v_next_position := case
    when v_session.status = 'lobby' then 1
    else v_session.current_question_position + 1
  end;

  if v_next_position > v_question_count then
    update public.quiz_sessions
    set status = 'ended', ended_at = now()
    where id = p_session_id
    returning * into v_session;
  else
    update public.quiz_sessions
    set status = 'question',
        current_question_position = v_next_position,
        question_started_at = now()
    where id = p_session_id
    returning * into v_session;
  end if;

  return v_session;
end;
$function$;

create or replace function public.reveal_quiz_answer(p_session_id uuid)
returns public.quiz_sessions
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_session public.quiz_sessions;
  v_question_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select * into v_session from public.quiz_sessions where id = p_session_id;

  if v_session.id is null then
    raise exception 'session not found' using errcode = 'P0001';
  end if;

  if v_session.host_id <> auth.uid() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if v_session.status <> 'question' then
    raise exception '目前不是作答階段' using errcode = 'P0001';
  end if;

  select id into v_question_id
  from public.quiz_session_questions
  where session_id = p_session_id
    and position = v_session.current_question_position;

  -- Points earned this round are applied to quiz_players.score right here,
  -- not in submit_quiz_answer -- the score only ever changes at the moment
  -- it's meant to become visible, so there's no live-leaderboard window
  -- during 'question' that would tip off who answered correctly.
  update public.quiz_players qp
  set score = qp.score + qa.points_awarded
  from public.quiz_answers qa
  where qa.session_id = p_session_id
    and qa.question_id = v_question_id
    and qa.player_id = qp.id;

  update public.quiz_sessions
  set status = 'reveal'
  where id = p_session_id
  returning * into v_session;

  return v_session;
end;
$function$;
revoke execute on function public.get_current_question(uuid) from public, anon;
revoke execute on function public.advance_quiz_session(uuid) from public, anon;
revoke execute on function public.reveal_quiz_answer(uuid) from public, anon;
grant execute on function public.get_current_question(uuid)
  to authenticated, service_role;
grant execute on function public.advance_quiz_session(uuid)
  to authenticated, service_role;
grant execute on function public.reveal_quiz_answer(uuid)
  to authenticated, service_role;

revoke execute on function public.get_game_leaderboard(public.game_type, smallint)
  from public, anon;
grant execute on function public.get_game_leaderboard(public.game_type, smallint)
  to authenticated, service_role;

alter function public.has_role(uuid, text, text) set search_path = '';
