-- Replace direct INSERT on game_scores with a SECURITY DEFINER RPC that
-- validates per-game-type score bounds and enforces a per-user rate limit.
--
-- Why: the prior INSERT policy only checked auth.uid() = user_id, so any
-- logged-in client could call .from('game_scores').insert({...}) with arbitrary
-- score values (the client-side bounds in useSubmitScore are trivially
-- bypassable from devtools). Existing leaderboard rows already contained
-- impossible values (2048: 2_147_483_647, pipes: 99_999_999 / -99, memory: 10).
--
-- After this migration, the only path that can write to game_scores is
-- public.submit_game_score(), which runs SECURITY DEFINER and validates
-- against per-game-type rules.

-- 1. Revoke direct INSERT.
drop policy if exists "users can insert own game scores" on public.game_scores;

-- 2. The single write path.
create or replace function public.submit_game_score(
  p_game_type public.game_type,
  p_score     integer,
  p_finish_ms integer,
  p_level     smallint default null
) returns void
security definer
set search_path = public
language plpgsql as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if p_finish_ms < 1 or p_finish_ms > 30 * 60 * 1000 then
    raise exception 'finish_time_ms out of range (1..1800000)';
  end if;

  case p_game_type
    when '2048' then
      -- Score = highest tile reached, always a power of two; 2^17 is already
      -- well past any realistic play.
      if p_score not in (
        2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048,
        4096, 8192, 16384, 32768, 65536, 131072
      ) then
        raise exception 'invalid 2048 score: %', p_score;
      end if;
      if p_level is not null then
        raise exception '2048 does not use levels';
      end if;

    when 'memory' then
      -- 8 pairs, always. finish_time_ms is the real differentiator.
      if p_score <> 8 then
        raise exception 'memory score must be 8';
      end if;
      if p_level is not null then
        raise exception 'memory does not use levels';
      end if;

    when 'typing' then
      -- WPM * 10. 300 WPM is already world-class.
      if p_score < 0 or p_score > 3000 then
        raise exception 'invalid typing score: %', p_score;
      end if;
      -- Language id 0..5 acts as the per-leaderboard level.
      if p_level is null or p_level < 0 or p_level > 5 then
        raise exception 'typing requires level 0..5';
      end if;

    when 'snake' then
      -- 20x20 board minus initial snake length of 3.
      if p_score < 0 or p_score > 397 then
        raise exception 'invalid snake score: %', p_score;
      end if;
      if p_level is not null then
        raise exception 'snake does not use levels';
      end if;

    when 'pipes' then
      -- 6x6 grid; realistic endpoint count fits easily under 100.
      if p_score < 0 or p_score > 100 then
        raise exception 'invalid pipes score: %', p_score;
      end if;
      if p_level is null or p_level < 1 or p_level > 100 then
        raise exception 'pipes requires level 1..100';
      end if;

    when 'queens' then
      -- Score = board size, locked by level bucket.
      if p_level is null or p_level < 1 or p_level > 100 then
        raise exception 'queens requires level 1..100';
      end if;
      if p_level between 1 and 30 and p_score <> 5 then
        raise exception 'queens level 1..30 score must be 5';
      elsif p_level between 31 and 60 and p_score <> 6 then
        raise exception 'queens level 31..60 score must be 6';
      elsif p_level between 61 and 100 and p_score <> 7 then
        raise exception 'queens level 61..100 score must be 7';
      end if;

    when 'kings' then
      -- Deprecated; the kings enum value remains only because Postgres can't
      -- drop enum values. New submissions are rejected.
      raise exception 'kings game type is deprecated';
  end case;

  -- Naive rate limit: at most one submission per (user, game) every 2 seconds.
  -- Cheap defence against scripted floods; legitimate plays take far longer.
  if exists (
    select 1 from game_scores
    where user_id = v_uid
      and game_type = p_game_type
      and created_at > now() - interval '2 seconds'
  ) then
    raise exception 'rate limited';
  end if;

  insert into game_scores (user_id, game_type, score, finish_time_ms, level)
  values (v_uid, p_game_type, p_score, p_finish_ms, p_level);
end $$;

-- 3. Lock execution to authenticated callers.
revoke all on function public.submit_game_score(public.game_type, integer, integer, smallint) from public;
grant execute on function public.submit_game_score(public.game_type, integer, integer, smallint) to authenticated;
