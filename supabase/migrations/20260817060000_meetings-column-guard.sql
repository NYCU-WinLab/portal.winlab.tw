-- Presenters could write EVERY column of their own meetings row.
--
-- `meetings_update_own` is row-level only (presenter_user_id = auth.uid()) and
-- `authenticated` holds table-wide UPDATE, so the "a paper must come from the
-- teacher's reading list" rule that 20260717051239 claimed to put in the data
-- layer was only half there. meetings_sync_paper_from_teacher clears the
-- mirrored title/link when a paper is UN-picked, but a row whose
-- teacher_paper_id was ALREADY null never enters that branch — so a presenter
-- could PATCH arbitrary paper_title / paper_link straight through PostgREST and
-- have it stick. paper_link is rendered as an <a href> for the whole lab
-- (schedule-tab.tsx, schedule-edit-row.tsx), which makes a user-supplied URL
-- there a phishing surface. The same gap let a presenter move their own
-- scheduled_date or flip their week to is_speaker.
--
-- Column privileges cannot fix this: in Supabase an admin and an ordinary
-- member are both the `authenticated` role, so `revoke update (col)` would hit
-- admins too. This repo's answer to "that column is not yours to write" is a
-- BEFORE UPDATE trigger that puts OLD back — prevent_role_escalation on
-- user_profiles, prevent_egress_status_change on reimbursements. Same shape.
--
-- What a presenter keeps: teacher_paper_id (picking their paper IS the point),
-- ppt_*, video_*, notes. Everything else belongs to the admin.
--
-- TRIGGER ORDER IS LOAD-BEARING. Postgres fires BEFORE row triggers in name
-- order, and 'meetings_guard_columns' sorts before
-- 'meetings_sync_paper_from_teacher'. The guard pins paper_title/paper_link to
-- OLD (dropping whatever the caller sent), then the sync trigger re-derives them
-- from the teacher_paper_id the presenter IS allowed to change. Rename either
-- trigger and that hand-off silently inverts.

create or replace function public.meetings_guard_columns()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  -- service_role is server-side code holding the secret key (the cron routes and
  -- api/meetings/sync-files, which back-fills ppt_link / video_link), never a
  -- member's browser.
  if current_setting('role', true) = 'service_role' then
    return new;
  end if;

  -- Admins own the schedule. The admin-only SECURITY DEFINER RPCs
  -- (meetings_swap / meetings_insert_week / meetings_remove_week /
  -- meetings_fill_presenters) reach this branch too: they gate on
  -- is_meetings_admin() themselves and auth.uid() still resolves inside a
  -- SECURITY DEFINER call, so their date/presenter shuffling passes untouched.
  if public.is_meetings_admin() then
    return new;
  end if;

  -- Slot fields: when, where, and what kind of week this is.
  new.year           := old.year;
  new.week_label     := old.week_label;
  new.scheduled_date := old.scheduled_date;
  new.is_holiday     := old.is_holiday;
  new.is_speaker     := old.is_speaker;
  new.location       := old.location;
  new.start_time     := old.start_time;
  new.created_at     := old.created_at;

  -- Who presents. Claiming an empty slot (meetings_claim, the one non-admin RPC
  -- that writes here) is the single sanctioned transition: null -> yourself.
  -- It can only happen through that RPC, because a direct PostgREST update on an
  -- unclaimed row is already refused by meetings_update_own's USING clause
  -- (presenter_user_id = auth.uid() is false when the column is null).
  -- Every other case keeps OLD, so a presenter can neither hand their week to
  -- someone else nor rewrite the denormalized display name.
  if not (old.presenter_user_id is null and new.presenter_user_id = auth.uid())
  then
    new.presenter         := old.presenter;
    new.presenter_user_id := old.presenter_user_id;
  end if;

  -- Paper title and link are derived, never typed. meetings_sync_paper_from_teacher
  -- recomputes both from teacher_paper_id immediately after this trigger.
  new.paper_title := old.paper_title;
  new.paper_link  := old.paper_link;

  return new;
end;
$function$;

drop trigger if exists meetings_guard_columns on public.meetings;
create trigger meetings_guard_columns
  before update on public.meetings
  for each row
  execute function public.meetings_guard_columns();
