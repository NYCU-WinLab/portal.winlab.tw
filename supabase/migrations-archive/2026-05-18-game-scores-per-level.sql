-- Per-level leaderboards for games that ship multiple stages (pipes, queens).
-- Adds an optional `level` column to game_scores and reworks the leaderboard
-- RPC so it can filter by level. Games without stages (2048/memory/typing/
-- snake) write NULL into `level` and pass NULL when reading, getting the
-- unchanged "overall leaderboard" behaviour.

alter table public.game_scores
  add column if not exists level smallint;

create index if not exists game_scores_game_level_score_idx
  on public.game_scores (game_type, level, score desc, finish_time_ms asc);

drop function if exists public.get_game_leaderboard(public.game_type);

create or replace function public.get_game_leaderboard(
  p_game_type public.game_type,
  p_level smallint default null
)
returns table (
  user_id uuid,
  user_name text,
  score integer,
  finish_time_ms integer,
  achieved_at timestamptz
)
language sql
security definer
set search_path to 'public'
as $$
  select user_id, user_name, score, finish_time_ms, achieved_at
  from (
    select distinct on (gs.user_id)
      gs.user_id,
      coalesce(up.name, 'Anonymous')::text as user_name,
      gs.score,
      gs.finish_time_ms,
      gs.created_at as achieved_at
    from public.game_scores gs
    left join public.user_profiles up on gs.user_id = up.id
    where gs.game_type = p_game_type
      and (p_level is null or gs.level = p_level)
    order by gs.user_id, gs.score desc, gs.finish_time_ms asc
  ) best
  order by score desc, finish_time_ms asc
  limit 20;
$$;
