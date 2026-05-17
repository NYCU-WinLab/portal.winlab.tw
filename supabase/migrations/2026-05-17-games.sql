-- supabase/migrations/2026-05-17-games.sql
-- Games feature: mini-games with a global leaderboard ranked by score and finish time.
-- Scoring convention (higher score = better for all games):
--   2048    → highest tile reached (128, 256, … 2048, 4096)
--   memory  → always 8 (pairs matched); finish_time_ms is the real differentiator
--   typing  → WPM × 10  (integer, avoids decimals)
--   snake   → number of food items eaten

-- =============================================================================
-- Types
-- =============================================================================

create type public.game_type as enum ('2048', 'memory', 'typing', 'snake', 'pipes', 'kings');

-- =============================================================================
-- Table
-- =============================================================================

create table public.game_scores (
  id             uuid             primary key default gen_random_uuid(),
  user_id        uuid             not null references auth.users(id) on delete cascade,
  game_type      public.game_type not null,
  score          integer          not null,
  finish_time_ms integer          not null,
  created_at     timestamptz      not null default now()
);

create index game_scores_by_game on public.game_scores (game_type, score desc, finish_time_ms asc);
create index game_scores_by_user on public.game_scores (user_id, game_type);

-- =============================================================================
-- RLS
-- =============================================================================

alter table public.game_scores enable row level security;

create policy "authenticated users can read game scores"
  on public.game_scores for select
  to authenticated
  using (true);

create policy "users can insert own game scores"
  on public.game_scores for insert
  to authenticated
  with check (auth.uid() = user_id);

-- =============================================================================
-- Leaderboard: best score per user, sorted by score desc then finish_time asc
-- =============================================================================

create or replace function public.get_game_leaderboard(p_game_type public.game_type)
returns table (
  user_id        uuid,
  user_name      text,
  score          integer,
  finish_time_ms integer,
  achieved_at    timestamptz
)
security definer
set search_path = public
language sql as $$
  select user_id, user_name, score, finish_time_ms, achieved_at
  from (
    select distinct on (gs.user_id)
      gs.user_id,
      coalesce(up.name, 'Anonymous')::text as user_name,
      gs.score,
      gs.finish_time_ms,
      gs.created_at as achieved_at
    from game_scores gs
    left join user_profiles up on gs.user_id = up.id
    where gs.game_type = p_game_type
    order by gs.user_id, gs.score desc, gs.finish_time_ms asc
  ) best
  order by score desc, finish_time_ms asc
  limit 20;
$$;
