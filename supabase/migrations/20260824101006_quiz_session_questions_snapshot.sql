-- Snapshot each quiz session's questions instead of reading the live,
-- editable quiz_questions table for the rest of that session's life.
--
-- This unlocks a history view: quiz_questions.correct_index is only
-- readable by the quiz set's own author (see create_quiz_tables.sql), but
-- a session's host isn't necessarily that author -- create_quiz_session has
-- never required hosting your own quiz set. Without a frozen copy, nobody
-- who played a session could ever review it afterwards. It also fixes a
-- latent bug: editing a quiz_set (or deleting/reordering its questions)
-- while a session built from it is still live used to change what that
-- in-progress game showed, because get_current_question/submit_quiz_answer/
-- reveal_quiz_answer all read quiz_questions directly, keyed by
-- quiz_set_id + position.
--
-- This feature shipped only hours ago with no real usage yet -- the
-- quiz_sessions/quiz_players/quiz_answers rows that exist right now are all
-- from testing it live, so they're cleared below rather than migrated
-- (quiz_answers.question_id is about to point at a different table).

create table public.quiz_session_questions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.quiz_sessions(id) on delete cascade,
  position smallint not null check (position > 0),
  question_text text not null,
  choices text[] not null,
  correct_index smallint not null,
  time_limit_seconds smallint not null,
  unique (session_id, position)
);

alter table public.quiz_session_questions enable row level security;

revoke all on public.quiz_session_questions from anon;
grant select on public.quiz_session_questions to authenticated;

-- Only once the session is over. Live play never reads this table directly
-- -- get_current_question() below still owns the "hide correct_index until
-- this exact question is revealed" logic, so a row being technically
-- present mid-game must not be independently readable.
create policy "quiz_session_questions_select"
on public.quiz_session_questions for select
to authenticated
using (
  (public.is_quiz_host(session_id) or public.is_quiz_participant(session_id))
  and exists (
    select 1 from public.quiz_sessions qs
    where qs.id = quiz_session_questions.session_id and qs.status = 'ended'
  )
);

delete from public.quiz_answers;
delete from public.quiz_players;
delete from public.quiz_sessions;

alter table public.quiz_answers drop constraint quiz_answers_question_id_fkey;
alter table public.quiz_answers
  add constraint quiz_answers_question_id_fkey
  foreign key (question_id) references public.quiz_session_questions(id) on delete cascade;

-- Now also copies the quiz_set's current questions into
-- quiz_session_questions for this session, right after creating it.
create or replace function public.create_quiz_session(p_quiz_set_id uuid)
returns public.quiz_sessions
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text;
  v_session public.quiz_sessions;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if not exists (select 1 from public.quiz_sets where id = p_quiz_set_id) then
    raise exception '題庫不存在' using errcode = 'P0001';
  end if;

  if not exists (select 1 from public.quiz_questions where quiz_set_id = p_quiz_set_id) then
    raise exception '題庫沒有任何題目，無法開始' using errcode = 'P0001';
  end if;

  loop
    v_code := (
      select string_agg(substr(v_alphabet, (floor(random() * length(v_alphabet)) + 1)::int, 1), '')
      from generate_series(1, 6)
    );

    exit when not exists (
      select 1 from public.quiz_sessions
      where room_code = v_code and status <> 'ended'
    );
  end loop;

  begin
    insert into public.quiz_sessions (quiz_set_id, host_id, room_code)
    values (p_quiz_set_id, auth.uid(), v_code)
    returning * into v_session;

    insert into public.quiz_session_questions
      (session_id, position, question_text, choices, correct_index, time_limit_seconds)
    select v_session.id, qq.position, qq.question_text, qq.choices, qq.correct_index, qq.time_limit_seconds
    from public.quiz_questions qq
    where qq.quiz_set_id = p_quiz_set_id;

    return v_session;
  exception when unique_violation then
    -- Someone else grabbed v_code between our check and our insert; the
    -- caller can simply retry the RPC call.
    raise exception 'room code collision, please retry';
  end;
end;
$function$;

-- Reads the session's own frozen quiz_session_questions instead of the
-- live quiz_questions table. correct_index/my_* hiding logic is unchanged.
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

create or replace function public.submit_quiz_answer(
  p_session_id uuid,
  p_question_id uuid,
  p_choice_index smallint
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_player public.quiz_players;
  v_session public.quiz_sessions;
  v_question public.quiz_session_questions;
  v_elapsed_ms numeric;
  v_limit_ms numeric;
  v_is_correct boolean;
  v_points integer;
begin
  select * into v_player
  from public.quiz_players
  where session_id = p_session_id and user_id = auth.uid();

  if v_player.id is null then
    raise exception '你還沒加入這場遊戲' using errcode = 'P0001';
  end if;

  select * into v_session from public.quiz_sessions where id = p_session_id;

  if v_session.status <> 'question' then
    raise exception '目前不是作答時間' using errcode = 'P0001';
  end if;

  select * into v_question
  from public.quiz_session_questions
  where id = p_question_id
    and session_id = p_session_id
    and position = v_session.current_question_position;

  if v_question.id is null then
    raise exception '這不是目前的題目' using errcode = 'P0001';
  end if;

  if p_choice_index < 0 or p_choice_index >= array_length(v_question.choices, 1) then
    raise exception 'invalid choice index';
  end if;

  v_is_correct := (p_choice_index = v_question.correct_index);
  v_elapsed_ms := greatest(0, extract(epoch from (now() - v_session.question_started_at)) * 1000);
  v_limit_ms := v_question.time_limit_seconds * 1000;

  -- Correct + fast: up to 1000 pts, decaying linearly to a 100 pt floor as
  -- the clock runs out. Wrong, or correct-but-overtime: 0.
  v_points := case
    when not v_is_correct then 0
    when v_elapsed_ms >= v_limit_ms then 0
    else greatest(100, round(1000 - (v_elapsed_ms / v_limit_ms) * 900))::integer
  end;

  begin
    insert into public.quiz_answers
      (session_id, question_id, player_id, choice_index, is_correct, points_awarded)
    values
      (p_session_id, p_question_id, v_player.id, p_choice_index, v_is_correct, v_points);
  exception when unique_violation then
    raise exception '這題你已經回答過了' using errcode = 'P0001';
  end;
end;
$function$;

-- Counts the session's own frozen question set, not the live quiz_questions
-- table -- otherwise adding/removing questions from the quiz_set mid-game
-- would change how many questions an in-progress session thinks it has.
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
