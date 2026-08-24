-- Covering indexes for the quiz_* foreign keys the security/performance
-- advisor flagged as missing after create_quiz_tables shipped: each of
-- these FK columns is queried in its own right (session lookups by set,
-- membership checks by user, answer lookups by player), and none of them
-- was already the leading column of an existing index.

create index quiz_sessions_quiz_set_id_idx on public.quiz_sessions (quiz_set_id);

-- The (session_id, user_id) unique index on quiz_players covers session_id,
-- but not user_id as a leading column -- add that separately for the FK.
create index quiz_players_user_id_idx on public.quiz_players (user_id);

create index quiz_answers_player_id_idx on public.quiz_answers (player_id);
