-- Data half of #1143: remove the eighteen questioner rows that describe an
-- activity which did not exist yet.
--
-- The questioner rotation went live on 2026-06-15 — the date 20260914084840
-- backdated the founding cohort to, on the evidence of the first meetings that
-- actually had questioners. Every meeting_questioners row on a meeting before
-- that date was written months after the fact by meetings_sync_questioners
-- staffing a past week: eighteen rows across six January–February weeks, all
-- source='auto', with assigned_at on 2026-07-22 and 2026-08-17. Five of the
-- six weeks got the SAME trio, which is the recency-only ordering bug #1140
-- replaced.
--
-- A FIXED CUTOFF, not the per-member join date the picker now uses. The two
-- rules agree on seventeen of the eighteen rows; the eighteenth belongs to a
-- member who has since left the pool and therefore has no join date at all. A
-- "not in any pool" rule would also delete that person's legitimate 2026-08-24
-- row — real history for someone who asked and later left. The date is the
-- only predicate that separates the two, and a one-off data migration
-- recording a historical fact is where a date literal belongs.
--
-- Deleting these changes nobody's rate. meeting_questioner_stats bounds BOTH
-- the numerator and the denominator by pool_added_at, and the earliest
-- pool_added_at in the table is exactly 2026-06-15, so these rows were already
-- outside every member's window. This is a correctness fix for what the
-- schedule page shows when someone scrolls back to January, not a fairness
-- one — no rebalance is needed after it.
--
-- The deleted rows are kept verbatim in
-- docs/meetings/2026-09-15-purged-pre-rotation-questioners.sql so the call can
-- be re-examined. Zero rows on the CI baseline, which has none of this data.
do $$
declare
  v_deleted int;
begin
  delete from public.meeting_questioners mq
  using public.meetings m
  where m.id = mq.meeting_id
    and m.scheduled_date < date '2026-06-15';
  get diagnostics v_deleted = row_count;
  raise notice 'purged % pre-rotation questioner rows', v_deleted;
end;
$$;
