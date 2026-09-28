-- The quiz tables were never added to the supabase_realtime publication,
-- so postgres_changes never fired for them: the host's lobby stayed at 0
-- players, session status changes (question -> reveal -> ...) never
-- reached players, and score updates never appeared live. Same fix already
-- applied to the gallery_* tables (see e.g. gallery-lightbox-realtime.sql).
--
-- quiz_sessions/quiz_players are what hooks/games/use-quiz-realtime.ts
-- actually subscribes to (status transitions and the player list/scores).
-- quiz_answers is included too so a future per-answer live indicator (e.g.
-- "3/8 answered") doesn't need another migration to unlock it.
alter publication supabase_realtime add table public.quiz_sessions;
alter publication supabase_realtime add table public.quiz_players;
alter publication supabase_realtime add table public.quiz_answers;
