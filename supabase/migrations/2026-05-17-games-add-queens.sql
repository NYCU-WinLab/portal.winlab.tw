-- Add 'queens' to game_type enum (replaces 'kings' in application logic)
-- PostgreSQL enums cannot have values removed, so 'kings' remains but is unused.
alter type public.game_type add value if not exists 'queens';
