-- Backdate the founding cohort's pool_added_at to 2026-06-15, the week the
-- questioner rotation actually started.
--
-- WHY THE STORED DATES ARE WRONG. pool_added_at is min(created_at) across
-- meeting_question_pool ∪ meeting_presenter_pool, and neither table was
-- populated when people joined:
--
--   * meeting_question_pool was seeded in one statement at 2026-07-07 05:59:57
--     by 20260706000000, for eleven members.
--   * meeting_presenter_pool was seeded in one statement on 2026-08-08 by
--     20260807000000, for fourteen — nine of whom had already PRESENTED during
--     the spring semester (2026-01-12 through 2026-05-18).
--
-- So both dates are migration timestamps. For everyone added afterwards
-- (2026-08-28, 08-31, 09-14) the stored date is a real join date and is left
-- alone.
--
-- WHY THIS MATTERS RATHER THAN BEING COSMETIC. pool_added_at is the lower bound
-- on both halves of the fairness rate (20260914083508). A founding member whose
-- clock starts on 2026-07-07 has their June and early-July questioning erased
-- from the numerator, which reads as "owed" and pulls assignments toward them.
-- 沈昱宏 is the clearest case: three questioning weeks (06-15, 06-22, 07-13)
-- all invisible, giving him a rate of exactly 0.000 against members who had
-- done less.
--
-- WHY 2026-06-15 AND NOT EACH MEMBER'S FIRST WEEK. Per-member dates would give
-- each person a different denominator for the same shared history, which is the
-- opposite of what the cohort needs: they all started together. 2026-06-15 is
-- the first week that carries real questioner records.
--
-- WHAT SITS BEFORE THE LINE, AND WHY IT SHOULD STAY THERE.
--
--   * 2026-02-23 … 06-01 — twelve real spring-semester meetings with presenters
--     and no questioners at all, because the pool did not exist yet. Counting
--     them as opportunities would charge everyone for weeks nobody could have
--     been picked for.
--   * 2026-01-05 … 02-09 — six weeks labelled 寒假 that were never flagged
--     is_holiday, so they kept a presenter and meetings_sync_questioners
--     back-filled eighteen questioner rows into them months later (assigned_at
--     2026-07-22 and 2026-08-17, for meetings in January). Nobody questioned
--     over the winter break. Those rows are an artefact of a holiday that was
--     labelled but not flagged, and excluding them is the point of the line.
--
-- The rows are left in place rather than deleted: they are wrong, but they are
-- also the only record that those weeks were touched, and nothing reads them
-- once the cutoff moves past them.
--
-- UPDATE, NOT DELETE-AND-REINSERT. The pool tables carry statement triggers on
-- INSERT and DELETE (20260914083733) that rebalance every future roster.
-- UPDATE is deliberately not a trigger event, so this migration changes the
-- metric without reshuffling anyone — the rebalance stays an explicit act.
--
-- Timestamps are written at UTC midnight on purpose. The stats view casts
-- pool_added_at::date in a UTC session, so a +08 midnight would land on
-- 2026-06-14 and quietly include the week before.

-- The eleven founding question-pool members.
update public.meeting_question_pool
set created_at = '2026-06-15 00:00:00+00'
where created_at::date = '2026-07-07';

-- 沈昱宏 is in the presenter pool only, so his 2026-08-08 row is the one that
-- sets his clock. Named by the evidence rather than hard-coded by id: a member
-- of the 08-08 batch who was already questioning before that batch existed was
-- self-evidently in the rotation. HSIUYA TSAO and 賴羿茗 are the other two
-- presenter-pool-only members of that batch and are NOT touched — neither has
-- a questioner or presenter record before 2026-08-08, so there is nothing to
-- say their stored date is wrong.
update public.meeting_presenter_pool pp
set created_at = '2026-06-15 00:00:00+00'
where pp.created_at::date = '2026-08-08'
  and not exists (
    select 1 from public.meeting_question_pool qp where qp.user_id = pp.user_id
  )
  and exists (
    select 1
    from public.meeting_questioners q
    join public.meetings m on m.id = q.meeting_id
    where q.user_id = pp.user_id
      and m.scheduled_date >= '2026-06-15'
      and m.scheduled_date < '2026-08-08'
  );
