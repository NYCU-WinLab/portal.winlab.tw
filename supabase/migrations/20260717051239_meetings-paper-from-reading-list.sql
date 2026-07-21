-- Meeting papers must now come from the teacher's reading list (teacher_papers,
-- the "老師 Papers" tab) instead of being free-form text a presenter types in,
-- with two scheduling rules layered on top:
--
--   1. COOLDOWN — once a paper is presented on date D it is locked for exactly
--      365 days; the next student may pick it on/after D+365. Equivalently: any
--      two meetings that share a paper must be at least 365 days apart. This is
--      a moving window, not a calendar-year reset, so it crosses year boundaries
--      correctly (a paper done 2026-03-02 frees up 2027-03-02).
--
--   2. NO SELF-REPEAT — a given student never presents the same paper twice, at
--      any distance in time.
--
-- Enforcement is at the data layer (not just the UI):
--   * teacher_paper_id FK           → the paper must be a real reading-list row.
--   * GiST exclusion constraint     → the 365-day cooldown, race-safe like a
--                                     unique index (a plain trigger check would
--                                     let two concurrent picks both pass).
--   * partial unique index          → the per-student no-repeat rule.
--   * BEFORE trigger                → keeps paper_title / paper_link mirroring
--                                     the chosen paper so the schedule table,
--                                     PPT filename, and mailer API keep working.
--
-- Historical meetings (free-form paper_title, no teacher_paper_id) are untouched.

-- 1. The FK column. ON DELETE SET NULL: deleting a reading-list paper frees any
--    slot that had picked it rather than blocking the delete.
alter table public.meetings
  add column if not exists teacher_paper_id uuid
  references public.teacher_papers (id) on delete set null;

-- 2. Cooldown as an exclusion constraint. Model each meeting as occupying the
--    half-open interval [scheduled_date, scheduled_date + 365) on a per-paper
--    axis: two such intervals for the SAME paper overlap iff the dates are less
--    than 365 days apart — exactly the cooldown. `[)` bounds mean a gap of
--    EXACTLY 365 days does not overlap, so "+365 天後可以選" holds. Needs
--    btree_gist for the uuid equality operator inside a GiST index.
create extension if not exists btree_gist;

alter table public.meetings drop constraint if exists meetings_paper_cooldown;
alter table public.meetings add constraint meetings_paper_cooldown
  exclude using gist (
    teacher_paper_id with =,
    daterange(scheduled_date, scheduled_date + 365) with &&
  ) where (teacher_paper_id is not null);

-- 3. A student never presents the same paper twice.
create unique index if not exists meetings_presenter_paper_uniq
  on public.meetings (presenter_user_id, teacher_paper_id)
  where presenter_user_id is not null and teacher_paper_id is not null;

-- 4. Keep the denormalized title/link in lockstep with the chosen paper.
create or replace function public.meetings_sync_paper_from_teacher()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.teacher_paper_id is not null then
    select tp.paper_name, tp.file_link
      into new.paper_title, new.paper_link
      from public.teacher_papers tp
      where tp.id = new.teacher_paper_id;
  elsif tg_op = 'UPDATE'
        and old.teacher_paper_id is not null
        and new.teacher_paper_id is null then
    -- Paper was un-picked: clear the mirror so a stale title/link doesn't linger.
    new.paper_title := null;
    new.paper_link := null;
  end if;
  return new;
end;
$function$;

drop trigger if exists meetings_sync_paper_from_teacher on public.meetings;
create trigger meetings_sync_paper_from_teacher
  before insert or update on public.meetings
  for each row
  execute function public.meetings_sync_paper_from_teacher();
