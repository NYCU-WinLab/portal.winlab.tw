-- Name every role explicitly on four meetings helpers (#1152).
--
-- meetings_next_free_date and meetings_mint_week_label are meant to be callable
-- by their owner and service_role only. Their migration
-- (20260915080357_meetings_derive_schedule_from_date) revokes EXECUTE from
-- public, anon and authenticated but never grants it to service_role, so that
-- grant came solely from the postgres image's `alter default privileges`. Those
-- defaults differ between Supabase CLI / image versions: on CLI 2.109.0 the ACL
-- comes out as {postgres}, on 2.117.0 as {postgres,service_role}, so
-- meetings-function-acl.test.sql went red or green with the CLI rather than
-- with the migrations.
--
-- This project names every role it relies on instead of trusting image
-- defaults (the 20260902045740 lesson), so grant it here. Nothing else changes:
-- anon, authenticated and PUBLIC stay revoked. On prod service_role already
-- holds EXECUTE on both, so this is a no-op there.

grant execute on function public.meetings_next_free_date(date) to service_role;
grant execute on function public.meetings_mint_week_label(date) to service_role;

-- meeting_semester_start / _end are plain (not SECURITY DEFINER) date helpers
-- meant to be callable by everyone, and the test expects exactly that ACL. It
-- too came only from image defaults, so name it here as well; prod already has
-- {=X,postgres,anon,authenticated,service_role} on both, so again a no-op.
grant execute on function public.meeting_semester_start(date)
  to public, anon, authenticated, service_role;
grant execute on function public.meeting_semester_end(date)
  to public, anon, authenticated, service_role;
