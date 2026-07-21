-- Tier 2 dead-object cleanup (audit follow-up): schema objects with zero code
-- references across all zyx1121 + NYCU-WinLab repos (72 non-fork/non-coursework
-- repos grepped) and no live DB dependency (no FK-in, trigger, or fn/view ref).
--   * invoice / claims / items / images — orphaned feature tables, no consumer
--   * pending_bot_bindings — bot-binding table, no consumer bot exists
--   * bento_order_stats / bento_user_rankings — views with no reader (app or function)
-- NOTE: notepads is deliberately NOT dropped — it is LIVE (temp.winlab.tw uses it).
drop view if exists public.bento_order_stats;
drop view if exists public.bento_user_rankings;
drop table if exists public.invoice;
drop table if exists public.claims;
drop table if exists public.items;
drop table if exists public.images;
drop table if exists public.pending_bot_bindings;
