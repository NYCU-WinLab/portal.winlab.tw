-- `第N週` used to be a free-running counter over public.meetings.year, so a
-- calendar year that carried two teaching terms numbered straight through and
-- overflowed past 第16週 — a label nobody in the lab recognises. The counter was
-- never the bug; the missing entity was. A week number restarts on a SEMESTER,
-- and the schema had no semester to restart on.
--
-- This migration introduces public.meeting_semesters as that entity, hangs every
-- meeting off it via a mandatory meetings.semester_id, backfills the existing
-- rows, renumbers their labels per semester, and leaves a safety net so no
-- insert path can produce a semester-less meeting.
--
-- ORDER IS LOAD-BEARING, top to bottom: the helpers must exist before the
-- find-or-create that calls them; the column must exist before the trigger that
-- fills it; and the backfill must have run before the anomaly report and the
-- renumber, both of which read semester_id.

-- ── 1. derivation helpers ───────────────────────────────────────────────────
-- ROC academic year with an AUGUST boundary: September is when teaching starts,
-- so anything from August onward belongs to the year that is just beginning,
-- and January — the tail of 上學期 — still belongs to the year before.
-- 上學期 = months {8, 9, 10, 11, 12, 1}, 下學期 = months {2 … 7}.
--
-- These derive a semester from a date, which is a GUESS. They are used in
-- exactly two places: the one-off backfill below, and meeting_semester_for_date's
-- find-or-create. They must never be used to re-derive the semester of a row
-- that already has one — a week appended to the end of 上學期 can legitimately
-- fall in February, and the stored semester_id is the truth there, not the date.
--
-- `immutable` + `set search_path to ''` because they touch no tables; the empty
-- search_path also keeps the Supabase linter's function_search_path_mutable
-- check quiet.
create or replace function public.meeting_academic_year(p_date date)
returns int language sql immutable set search_path to '' as $$
  select extract(year from p_date)::int - 1911
       - case when extract(month from p_date) < 8 then 1 else 0 end;
$$;

create or replace function public.meeting_term(p_date date)
returns smallint language sql immutable set search_path to '' as $$
  select (case when extract(month from p_date) in (8, 9, 10, 11, 12, 1) then 1 else 2 end)::smallint;
$$;

-- ── 2. the semester ─────────────────────────────────────────────────────────
-- A semester is stamped once, when a schedule is generated, and inherited by
-- every meeting inserted into it afterwards. That is what makes `第N週` stable:
-- the number is a position within this row's semester, not a function of its
-- date.
--
-- start_date and planned_weeks are per-semester on purpose. Each semester picks
-- its own weekday (the lab's seminar slot moves between terms) and its own
-- length (16 weeks is the norm, not a rule), so neither can live as a global
-- constant.
create table public.meeting_semesters (
  id uuid primary key default gen_random_uuid(),
  academic_year int not null,
  term smallint not null,
  start_date date not null,
  planned_weeks int,
  created_at timestamptz not null default now(),
  -- A ROC academic year has exactly two terms; a third would silently create a
  -- second numbering series for the same year.
  constraint meeting_semesters_term_check check (term in (1, 2)),
  constraint meeting_semesters_academic_year_term_key unique (academic_year, term)
);

comment on table public.meeting_semesters is
  '學年度/學期 — the unit that 第N週 numbering restarts on. Stamped at schedule generation, inherited by every meeting inserted into the semester.';

-- ── 3. the link ─────────────────────────────────────────────────────────────
-- Nullable for now; set not null in step 6, once the backfill has filled it.
alter table public.meetings add column semester_id uuid references public.meeting_semesters(id);

-- (semester_id, scheduled_date) is the shape every read wants: one semester's
-- weeks in calendar order.
create index meetings_semester on public.meetings (semester_id, scheduled_date);

comment on column public.meetings.semester_id is
  'The semester this week belongs to. Inherited at insert, never re-derived from scheduled_date — an appended week may fall outside its semester''s calendar months.';

-- ── 4. find-or-create ───────────────────────────────────────────────────────
-- SECURITY DEFINER so the before-insert trigger can mint a semester row on
-- behalf of a caller who holds no write privilege on meeting_semesters — an
-- ordinary member claiming a week must not fail because the semester happens
-- not to exist yet.
--
-- Race-safe by construction: two concurrent inserts for the same semester both
-- reach the INSERT, one wins, the loser's `on conflict do nothing` returns no
-- row, and the re-select picks up the winner's id.
create or replace function public.meeting_semester_for_date(p_date date)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_id   uuid;
  v_ay   int      := public.meeting_academic_year(p_date);
  v_term smallint := public.meeting_term(p_date);
begin
  select id into v_id from public.meeting_semesters
  where academic_year = v_ay and term = v_term;
  if v_id is not null then return v_id; end if;

  insert into public.meeting_semesters (academic_year, term, start_date)
  values (v_ay, v_term, p_date)
  on conflict (academic_year, term) do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id from public.meeting_semesters
    where academic_year = v_ay and term = v_term;
  end if;
  return v_id;
end;
$function$;

-- Not part of the API surface. It is only ever reached from the trigger below
-- and from other SECURITY DEFINER functions, all of which run as the owner, so
-- nobody needs EXECUTE. Revoking `anon` and `authenticated` by name matters:
-- Postgres default privileges grant EXECUTE to those roles DIRECTLY, not via
-- PUBLIC, so `revoke … from public` alone would leave both able to call it —
-- and calling it is a write, since it can create a semester row.
revoke all on function public.meeting_semester_for_date(date) from public, anon, authenticated;

-- ── 5. the safety net ───────────────────────────────────────────────────────
-- Every insert path that knows its semester — generate, insert-week, the UI's
-- add-week — passes semester_id explicitly, and that value MUST win. The date is
-- only a fallback for callers that don't know (a hand-written INSERT, an older
-- RPC), and it is the weaker answer: a week appended to the end of 上學期 can
-- land in February and would be guessed into 下學期. So this fills a NULL and
-- nothing else. Turning it into an unconditional assignment would silently move
-- appended weeks out of their own semester.
create or replace function public.meetings_set_semester()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.semester_id is null then
    new.semester_id := public.meeting_semester_for_date(new.scheduled_date);
  end if;
  return new;
end;
$function$;

drop trigger if exists meetings_set_semester on public.meetings;
create trigger meetings_set_semester
  before insert on public.meetings
  for each row
  execute function public.meetings_set_semester();

-- ── 6. backfill, then make the column mandatory ─────────────────────────────
-- The only place the date-derived guess is applied to history. Existing rows
-- were numbered per calendar year, so grouping them by (derived year, derived
-- term) is the best reconstruction available — step 7 flags any group whose span
-- suggests the reconstruction is wrong.
insert into public.meeting_semesters (academic_year, term, start_date, planned_weeks)
select public.meeting_academic_year(scheduled_date),
       public.meeting_term(scheduled_date),
       min(scheduled_date),
       count(*)
from public.meetings
group by 1, 2
on conflict (academic_year, term) do nothing;

update public.meetings m
set semester_id = s.id
from public.meeting_semesters s
where s.academic_year = public.meeting_academic_year(m.scheduled_date)
  and s.term = public.meeting_term(m.scheduled_date)
  and m.semester_id is null;

-- NOT NULL is the point of the whole migration: a meeting with no semester has
-- no week number, and the trigger above guarantees one can't be created.
alter table public.meetings alter column semester_id set not null;

-- ── 7. anomaly notice ───────────────────────────────────────────────────────
-- The pre-flight against production could not be run from the session that
-- authored this migration, so the migration reports for itself. A real semester
-- runs ~16 weeks; a reconstructed group spanning more than 30 weeks means the
-- date-derived grouping merged things that were never one semester. This only
-- raises NOTICE — it is information for the human applying the migration, not a
-- reason to refuse a deploy.
do $$
declare r record;
begin
  for r in
    select s.academic_year, s.term, count(*) as weeks,
           min(m.scheduled_date) as first_date, max(m.scheduled_date) as last_date
    from public.meeting_semesters s
    join public.meetings m on m.semester_id = s.id
    group by s.academic_year, s.term
    having max(m.scheduled_date) - min(m.scheduled_date) > 30 * 7
  loop
    raise notice 'meeting_semesters: semester %-% spans % days (% .. %, % rows) — verify this is one real semester',
      r.academic_year, r.term, r.last_date - r.first_date, r.first_date, r.last_date, r.weeks;
  end loop;
end $$;

-- ── 8. renumber historical week_label per semester ──────────────────────────
-- The whole visible symptom. Numbering restarts inside each semester, in date
-- order.
--
-- Two deliberate exclusions. Only rows that already carry a `第N週` label take
-- part, so a hand-written label (`春假`, `演講`) is left exactly as written AND
-- does not consume a number — a holiday week is not week 4. And any trailing
-- text after `第N週` (a `(原因)` note an admin typed) is carried across, because
-- it is the admin's words, not generated.
with numbered as (
  select id,
         row_number() over (partition by semester_id order by scheduled_date, id) as n,
         coalesce(substring(week_label from '^第\d+週(.*)$'), '') as suffix
  from public.meetings
  where week_label ~ '^第\d+週'
)
update public.meetings m
set week_label = '第' || n.n || '週' || n.suffix
from numbered n
where n.id = m.id
  and m.week_label <> '第' || n.n || '週' || n.suffix;

-- ── 9. RLS ──────────────────────────────────────────────────────────────────
-- The SELECT audience mirrors `meetings_select` (baseline:2657), which is also
-- `to public`. A semester row carries no PII — a ROC year, a term, a start date
-- and a week count — and it exists to group meeting rows. Making it stricter
-- than the meetings it groups would just break the join for readers who can
-- already read the meetings.
--
-- Writes are the admin's: the semester is the schedule's frame, and a member
-- editing it would renumber everybody's weeks.
alter table public.meeting_semesters enable row level security;

create policy meeting_semesters_select on public.meeting_semesters
  for select to public using (true);
create policy meeting_semesters_insert on public.meeting_semesters
  for insert to authenticated with check (public.is_meetings_admin());
create policy meeting_semesters_update on public.meeting_semesters
  for update to authenticated using (public.is_meetings_admin()) with check (public.is_meetings_admin());
create policy meeting_semesters_delete on public.meeting_semesters
  for delete to authenticated using (public.is_meetings_admin());

grant select on public.meeting_semesters to anon, authenticated, service_role;
grant insert, update, delete on public.meeting_semesters to authenticated, service_role;
