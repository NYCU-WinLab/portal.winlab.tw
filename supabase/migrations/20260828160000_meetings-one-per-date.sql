-- One meeting per calendar date — made structural (#1103).
--
-- meetings_generate_semester, meetings_insert_week and meetings_append_week
-- all already refuse to place a meeting on an occupied scheduled_date (via
-- meetings_next_free_date's forward scan). But two UI paths insert directly
-- and never go through an RPC, because neither has a semester to append to:
--   * add-meeting-dialog.tsx  — "新增週次" at an arbitrary chosen date.
--   * schedule-tab.tsx's handleAddFirstWeek — the first row of an empty year
--     bucket.
-- Both bypass the RPCs' check entirely, so the invariant the RPCs enforce
-- was never actually structural. This index closes that gap for every
-- write path, RPC or not.
--
-- Verified safe before adding: production held zero duplicate scheduled_date
-- rows at the time this migration was written —
--   select scheduled_date, count(*) from public.meetings
--   group by 1 having count(*) > 1;
-- returned no rows.
create unique index meetings_scheduled_date_uniq on public.meetings (scheduled_date);

comment on index public.meetings_scheduled_date_uniq is
  'Policy, not physics: "一天只會有一場會議" was TENTATIVE when this index was '
  'added (2026-08-28, closing #1103) — the lab''s own words, not a physical '
  'law about the room or the calendar. It happens to match the RPCs'' '
  'existing date-global occupied-date check, and it matches how the '
  'Nextcloud recording match keys on the date (see '
  'apps/portal/lib/meetings/recording-match.ts) — several meetings on one '
  'day make that match ambiguous. If the lab ever genuinely needs two '
  'meetings on the same date (say a speaker session alongside a regular '
  'presentation), the way to relax this is to DROP THIS INDEX, not to work '
  'around it. Dropping it does not remove the invariant everywhere: '
  'meetings_generate_semester / meetings_insert_week / meetings_append_week '
  'would go back to their older, softer enforcement — skip forward past an '
  'occupied date rather than refuse the write — which is what they did '
  'before this index existed. Whoever hits this constraint next should not '
  'have to guess whether it is a choice.';
