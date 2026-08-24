-- Self-hosted live quiz (Kahoot-style) for /games/quiz.
--
-- Shape: a host opens a quiz_set as a session and gets a room_code; players
-- join with that code; the host paces the session through
-- lobby -> question -> reveal -> ... -> ended. Unlike game_scores (single
-- submission per attempt), this needs live, multi-round, multi-role state,
-- so it gets its own tables rather than reusing the single-player games
-- model.
--
-- Anti-cheat is the same principle already established by
-- submit_game_score/create_bento_order: never trust the client with a score
-- or with the answer key.
--   * quiz_questions.correct_index is only ever readable via direct table
--     RLS to the quiz's own author (needed for the editor). Gameplay reads
--     go through get_current_question(), which strips correct_index until
--     the session is in 'reveal'/'ended'.
--   * quiz_sessions/quiz_players/quiz_answers carry no INSERT/UPDATE policy
--     at all -- every state transition and every score change happens
--     inside a SECURITY DEFINER RPC that recomputes correctness/points
--     server-side from question_started_at, not from client-supplied
--     values.

-- 1. Tables ------------------------------------------------------------

create table public.quiz_sets (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 1 and 100),
  created_by uuid not null references public.user_profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index quiz_sets_created_by_idx on public.quiz_sets (created_by);

create table public.quiz_questions (
  id uuid primary key default gen_random_uuid(),
  quiz_set_id uuid not null references public.quiz_sets(id) on delete cascade,
  position smallint not null check (position > 0),
  question_text text not null check (char_length(trim(question_text)) between 1 and 300),
  choices text[] not null check (array_length(choices, 1) between 2 and 6),
  correct_index smallint not null check (correct_index >= 0),
  time_limit_seconds smallint not null default 20 check (time_limit_seconds between 5 and 120),
  constraint quiz_questions_correct_index_in_range
    check (correct_index < array_length(choices, 1)),
  unique (quiz_set_id, position)
);

create table public.quiz_sessions (
  id uuid primary key default gen_random_uuid(),
  quiz_set_id uuid not null references public.quiz_sets(id) on delete cascade,
  host_id uuid not null references public.user_profiles(id) on delete cascade,
  room_code text not null,
  status text not null default 'lobby' check (status in ('lobby', 'question', 'reveal', 'ended')),
  current_question_position smallint not null default 0,
  question_started_at timestamptz,
  created_at timestamptz not null default now(),
  ended_at timestamptz
);

-- Room codes are recycled once a session ends -- only one *active* session
-- may hold a given code at a time, so the 6-character space doesn't fill up.
create unique index quiz_sessions_room_code_active_unique
  on public.quiz_sessions (room_code)
  where status <> 'ended';

create index quiz_sessions_host_id_idx on public.quiz_sessions (host_id);

create table public.quiz_players (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.quiz_sessions(id) on delete cascade,
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  nickname text not null,
  score integer not null default 0,
  joined_at timestamptz not null default now(),
  unique (session_id, user_id)
);

create table public.quiz_answers (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.quiz_sessions(id) on delete cascade,
  question_id uuid not null references public.quiz_questions(id) on delete cascade,
  player_id uuid not null references public.quiz_players(id) on delete cascade,
  choice_index smallint not null check (choice_index >= 0),
  is_correct boolean not null,
  points_awarded integer not null default 0,
  answered_at timestamptz not null default now(),
  unique (question_id, player_id)
);

create index quiz_answers_session_question_idx on public.quiz_answers (session_id, question_id);

-- 2. RLS membership helpers ---------------------------------------------
--
-- "Can this user see rows for this session" needs to check across
-- quiz_players, and a plain self-join subquery inside that table's own RLS
-- policy re-triggers the same policy on the subquery and never resolves.
-- SECURITY DEFINER functions bypass RLS internally, same trick as
-- has_role()/is_trip_admin() in the baseline schema.

create or replace function public.is_quiz_host(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.quiz_sessions
    where id = p_session_id and host_id = auth.uid()
  );
$$;

create or replace function public.is_quiz_participant(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.quiz_players
    where session_id = p_session_id and user_id = auth.uid()
  );
$$;

revoke all on function public.is_quiz_host(uuid) from public;
revoke all on function public.is_quiz_participant(uuid) from public;
grant execute on function public.is_quiz_host(uuid) to authenticated;
grant execute on function public.is_quiz_participant(uuid) to authenticated;

-- 3. RLS -------------------------------------------------------------

alter table public.quiz_sets enable row level security;

create policy "quiz_sets_select"
on public.quiz_sets for select
to authenticated
using (true);

create policy "quiz_sets_insert_own"
on public.quiz_sets for insert
to authenticated
with check (created_by = auth.uid());

create policy "quiz_sets_update_own"
on public.quiz_sets for update
to authenticated
using (created_by = auth.uid())
with check (created_by = auth.uid());

create policy "quiz_sets_delete_own"
on public.quiz_sets for delete
to authenticated
using (created_by = auth.uid());

alter table public.quiz_questions enable row level security;

-- Locked to the quiz's own author -- everyone else reaches question
-- content (minus the answer key) only through get_current_question().
create policy "quiz_questions_select_own"
on public.quiz_questions for select
to authenticated
using (exists (
  select 1 from public.quiz_sets qs
  where qs.id = quiz_set_id and qs.created_by = auth.uid()
));

create policy "quiz_questions_insert_own"
on public.quiz_questions for insert
to authenticated
with check (exists (
  select 1 from public.quiz_sets qs
  where qs.id = quiz_set_id and qs.created_by = auth.uid()
));

create policy "quiz_questions_update_own"
on public.quiz_questions for update
to authenticated
using (exists (
  select 1 from public.quiz_sets qs
  where qs.id = quiz_set_id and qs.created_by = auth.uid()
))
with check (exists (
  select 1 from public.quiz_sets qs
  where qs.id = quiz_set_id and qs.created_by = auth.uid()
));

create policy "quiz_questions_delete_own"
on public.quiz_questions for delete
to authenticated
using (exists (
  select 1 from public.quiz_sets qs
  where qs.id = quiz_set_id and qs.created_by = auth.uid()
));

alter table public.quiz_sessions enable row level security;

-- No insert/update policy: sessions are created and advanced only through
-- create_quiz_session / advance_quiz_session / reveal_quiz_answer below,
-- all SECURITY DEFINER. That's what stops a player from UPDATE-ing status
-- straight to 'reveal' to see the answer early.
create policy "quiz_sessions_select"
on public.quiz_sessions for select
to authenticated
using (host_id = auth.uid() or public.is_quiz_participant(id));

alter table public.quiz_players enable row level security;

-- No insert/update policy: joining happens only via join_quiz_session, and
-- score only moves inside submit_quiz_answer -- both SECURITY DEFINER.
create policy "quiz_players_select"
on public.quiz_players for select
to authenticated
using (public.is_quiz_host(session_id) or public.is_quiz_participant(session_id));

alter table public.quiz_answers enable row level security;

-- Append-only, same as game_scores: no update/delete policy, and the only
-- insert path is submit_quiz_answer, which computes is_correct/points
-- server-side instead of trusting client-supplied values.
--
-- Gated to reveal/ended even for the host: is_correct is exactly the answer
-- key for that player's chosen option, so a readable row before the host
-- reveals is a leak just like a readable correct_index would be -- a player
-- (or the host) could read it mid-question and call it out to the room.
create policy "quiz_answers_select"
on public.quiz_answers for select
to authenticated
using (
  (
    public.is_quiz_host(session_id)
    or exists (
      select 1 from public.quiz_players qp
      where qp.id = player_id and qp.user_id = auth.uid()
    )
  )
  and exists (
    select 1 from public.quiz_sessions qs
    where qs.id = quiz_answers.session_id and qs.status in ('reveal', 'ended')
  )
);

-- 4. RPCs --------------------------------------------------------------

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
    return v_session;
  exception when unique_violation then
    -- Someone else grabbed v_code between our check and our insert; the
    -- caller can simply retry the RPC call.
    raise exception 'room code collision, please retry';
  end;
end;
$function$;

create or replace function public.join_quiz_session(p_room_code text)
returns public.quiz_players
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_session public.quiz_sessions;
  v_nickname text;
  v_player public.quiz_players;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into v_session
  from public.quiz_sessions
  where room_code = upper(trim(p_room_code)) and status <> 'ended';

  if v_session.id is null then
    raise exception '找不到這個房間碼，或遊戲已經結束' using errcode = 'P0001';
  end if;

  select coalesce(name, 'Anonymous') into v_nickname
  from public.user_profiles
  where id = auth.uid();

  insert into public.quiz_players (session_id, user_id, nickname)
  values (v_session.id, auth.uid(), coalesce(v_nickname, 'Anonymous'))
  on conflict (session_id, user_id) do nothing;

  select * into v_player
  from public.quiz_players
  where session_id = v_session.id and user_id = auth.uid();

  return v_player;
end;
$function$;

create or replace function public.get_current_question(p_session_id uuid)
returns table (
  question_id uuid,
  -- "position" (unlike a plain CREATE TABLE column) needs quoting here --
  -- it's grammatically reserved inside a RETURNS TABLE column list because
  -- of the POSITION(x IN y) function syntax.
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

  -- The caller's own result for this question -- like correct_index, this
  -- is exactly the answer key and must stay hidden until reveal/ended. This
  -- is the ONLY place a player learns whether they were right: submit_quiz_
  -- answer deliberately returns nothing, so answering never leaks the
  -- result ahead of the host's reveal.
  return query
  select
    qq.id,
    qq.position,
    (select count(*)::integer from public.quiz_questions where quiz_set_id = v_session.quiz_set_id),
    qq.question_text,
    qq.choices,
    qq.time_limit_seconds,
    v_session.question_started_at,
    case when v_session.status in ('reveal', 'ended') then qq.correct_index else null end,
    case when v_session.status in ('reveal', 'ended') then qa.choice_index else null end,
    case when v_session.status in ('reveal', 'ended') then qa.is_correct else null end,
    case when v_session.status in ('reveal', 'ended') then qa.points_awarded else null end
  from public.quiz_questions qq
  left join public.quiz_players qp
    on qp.session_id = p_session_id and qp.user_id = auth.uid()
  left join public.quiz_answers qa
    on qa.question_id = qq.id and qa.player_id = qp.id
  where qq.quiz_set_id = v_session.quiz_set_id
    and qq.position = v_session.current_question_position;
end;
$function$;

-- Deliberately returns nothing. Kahoot-style scoring depends on nobody
-- knowing whether an answer was right until the host reveals it -- if this
-- returned is_correct/points_awarded, the answering player (or anyone
-- reading the network response) would know their result immediately and
-- could call it out to players who haven't answered yet, while the timer
-- is still running. quiz_players.score is not updated here either, for the
-- same reason: see reveal_quiz_answer, which is where points are applied.
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
  v_question public.quiz_questions;
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
  from public.quiz_questions
  where id = p_question_id
    and quiz_set_id = v_session.quiz_set_id
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
  from public.quiz_questions
  where quiz_set_id = v_session.quiz_set_id;

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
  from public.quiz_questions
  where quiz_set_id = v_session.quiz_set_id
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

revoke all on function public.create_quiz_session(uuid) from public;
revoke all on function public.join_quiz_session(text) from public;
revoke all on function public.get_current_question(uuid) from public;
revoke all on function public.submit_quiz_answer(uuid, uuid, smallint) from public;
revoke all on function public.advance_quiz_session(uuid) from public;
revoke all on function public.reveal_quiz_answer(uuid) from public;

grant execute on function public.create_quiz_session(uuid) to authenticated;
grant execute on function public.join_quiz_session(text) to authenticated;
grant execute on function public.get_current_question(uuid) to authenticated;
grant execute on function public.submit_quiz_answer(uuid, uuid, smallint) to authenticated;
grant execute on function public.advance_quiz_session(uuid) to authenticated;
grant execute on function public.reveal_quiz_answer(uuid) to authenticated;
