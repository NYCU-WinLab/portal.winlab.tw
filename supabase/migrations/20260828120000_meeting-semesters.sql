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
-- fills it; the backfill must have run before the backfill report and the
-- renumber, both of which read semester_id; and the week_label snapshot must be
-- taken before the renumber that overwrites what it snapshots.

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
-- term) is the best reconstruction available — step 7 reports every group it
-- produced and shouts about the ones that look merged.
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

-- ── 7. backfill report ──────────────────────────────────────────────────────
-- What this replaced, and why: the first version of this block only spoke up
-- when a group's date span exceeded 30 * 7 = 210 days. That check could never
-- fire. The derivation splits at August and February, so a CORRECTLY derived
-- group spans at most ~150 days (Aug→Jan, or Feb→Jul) — the threshold sat above
-- the maximum a well-formed group can reach. Nor could it fire on the realistic
-- malformed case: rows of a 上學期 that overran into February derive to
-- term = 2 and JOIN the existing 下學期 group, which then holds 20+ rows while
-- still spanning the same ~150 days. The span carries no signal in either
-- direction.
--
-- The two signals that CAN fire are the row count and the number of
-- `meetings.year` buckets a group draws from. So this reports every derived
-- semester unconditionally, and additionally shouts on either of:
--   * more than 24 rows — a semester holding far more weeks than 16 plus
--     make-ups and holidays means the grouping merged two real semesters;
--   * more than one distinct `meetings.year` — expected for historical data (a
--     year bucket runs Jan→Jan, so a reconstructed 上學期 necessarily reaches
--     back into the previous bucket) and worth SEEING, because such a group
--     renders split across two year tabs in /meetings with its numbering
--     continuing across the tab boundary.
--
-- THIS REPORT IS NOT A CONTROL. Nothing here can refuse a deploy, and applied
-- via Supabase MCP `apply_migration` or the dashboard SQL editor these lines
-- are never returned to the caller at all. The durable controls are step 8's
-- backup table and a human running the pre-flight SELECT against production
-- BEFORE applying this file, reading the row counts and year-bucket counts off
-- it. This block is the same information for whoever applies via `psql`.
do $$
declare r record;
begin
  for r in
    select s.academic_year, s.term, count(*) as weeks,
           min(m.scheduled_date) as first_date,
           max(m.scheduled_date) as last_date,
           count(distinct m.year) as year_buckets
    from public.meeting_semesters s
    join public.meetings m on m.semester_id = s.id
    group by s.academic_year, s.term
    order by s.academic_year, s.term
  loop
    raise notice 'meeting_semesters backfill: %-% — % rows, % .. %, % year bucket(s)',
      r.academic_year, r.term, r.weeks, r.first_date, r.last_date, r.year_buckets;
    if r.weeks > 24 then
      raise warning 'ANOMALY: semester %-% holds % rows — far more than 16 weeks plus make-ups and holidays. The date-derived grouping has probably merged two real semesters; check this one by hand before trusting its renumbered labels.',
        r.academic_year, r.term, r.weeks;
    end if;
    if r.year_buckets > 1 then
      raise warning 'ANOMALY: semester %-% draws rows from % different meetings.year buckets (% .. %) — /meetings filters by year, so this group will render split across % year tabs and its 第N週 numbering will not start at 1 in every tab.',
        r.academic_year, r.term, r.year_buckets, r.first_date, r.last_date, r.year_buckets;
    end if;
  end loop;
end $$;

-- ── 8. snapshot the old labels, then renumber per semester ──────────────────
-- THE UNDO RECORD IS A TABLE, NOT THE APPLY LOG. The renumber below is the only
-- statement in this migration that overwrites existing history, and it rewrites
-- essentially every `week_label` the lab has ever had. An earlier version of
-- this file declared its per-row RAISE NOTICEs to be the rollback plan; that
-- was wrong, because this project's sanctioned deploy path is Supabase MCP
-- `apply_migration` or the dashboard SQL editor, and NEITHER returns server
-- NOTICE output to the caller. Applied that way, the undo record would be
-- generated and thrown away in the same breath, leaving no copy of the old
-- labels anywhere.
--
-- So take the snapshot first, in the same transaction, before a single label
-- changes. It holds (id, scheduled_date, week_label) as they were the instant
-- before the renumber. No PII: three columns of schedule metadata.
--
-- TO RESTORE (all rows, or add `and b.id = '…'` for one):
--   update public.meetings m
--   set week_label = b.week_label
--   from public.meetings_week_label_backup_20260828 b
--   where b.id = m.id;
--
-- SAFE TO DROP once the renumber has been verified on production — spot-check a
-- historical semester that straddles a January, the case the reconstruction is
-- least sure about, then:
--   drop table public.meetings_week_label_backup_20260828;
create table if not exists public.meetings_week_label_backup_20260828 as
  select id, scheduled_date, week_label from public.meetings;

comment on table public.meetings_week_label_backup_20260828 is
  'Pre-renumber snapshot of meetings.week_label taken by 20260828120000. Restore with `update public.meetings m set week_label = b.week_label from public.meetings_week_label_backup_20260828 b where b.id = m.id`. Drop once the renumber is verified on production.';

-- RLS, not GRANTs, because GRANTs restrict nothing here. This project's
-- `alter default privileges` hands anon, authenticated and service_role ALL
-- privileges on every new table in `public`, so this table is born readable by
-- anon. RLS with no policy at all is the right control: nothing in the app ever
-- reads this table — restores are run by an operator as postgres/service_role,
-- both of which hold BYPASSRLS — so there is no policy to write, and an
-- admin-only one would falsely suggest the portal queries it. The explicit
-- revoke is belt-and-braces: it takes the privileges away now, and RLS keeps
-- the table shut regardless of what the grants say later.
--
-- (RLS with no policy trips Supabase's rls_enabled_no_policy advisor at INFO.
-- That is the intended shape here, not an oversight.)
alter table public.meetings_week_label_backup_20260828 enable row level security;
revoke all on public.meetings_week_label_backup_20260828 from anon, authenticated;

-- The renumber itself. The whole visible symptom: numbering restarts inside
-- each semester, in date order.
--
-- Two deliberate exclusions. Only rows that already carry a `第N週` label take
-- part, so a hand-written label (`春假`, `演講`) is left exactly as written AND
-- does not consume a number — a holiday week is not week 4. And any trailing
-- text after `第N週` (a `(原因)` note an admin typed) is carried across, because
-- it is the admin's words, not generated.
--
-- The per-row NOTICEs are kept on top of the backup table. They are still the
-- fastest way to read what happened when this is applied through `psql`, and
-- each one carries a ready-to-paste single-row UPDATE.
--
-- Wrapping the statement in a do-block changes nothing about which rows are
-- renumbered or how the numbers are computed: it is still the same single
-- set-based UPDATE, now as a data-modifying CTE whose RETURNING feeds the loop
-- that emits the notices. `n.old_label` is read from the FROM-list relation
-- because RETURNING cannot see the pre-update value of a column it just wrote
-- (`returning old.*` is Postgres 18+, and this has to run on 15/17).
do $$
declare r record;
begin
  for r in
    with numbered as (
      select id,
             week_label as old_label,
             row_number() over (partition by semester_id order by scheduled_date, id) as n,
             coalesce(substring(week_label from '^第\d+週(.*)$'), '') as suffix
      from public.meetings
      where week_label ~ '^第\d+週'
    ),
    renumbered as (
      update public.meetings m
      set week_label = '第' || n.n || '週' || n.suffix
      from numbered n
      where n.id = m.id
        and m.week_label <> '第' || n.n || '週' || n.suffix
      returning m.id, m.scheduled_date, n.old_label, m.week_label as new_label
    )
    select * from renumbered order by scheduled_date, id
  loop
    -- The undo statement is built with format(), not written inline: RAISE only
    -- understands bare `%`, so a `%L` in its format string would be emitted as a
    -- literal L and the "ready to paste" statement would be unquoted garbage.
    raise notice 'meeting_semesters renumber: % on %: % -> %  |  undo: %',
      r.id, r.scheduled_date, r.old_label, r.new_label,
      format('update public.meetings set week_label = %L where id = %L;', r.old_label, r.id);
  end loop;
end $$;

-- ── 9. RLS ──────────────────────────────────────────────────────────────────
-- SELECT is a byte-for-byte mirror of `meetings_select` (baseline:2657) —
-- `for select to public using ((auth.uid() is not null))`. Both halves matter.
--
-- `to public` rather than `to authenticated`, because that is the audience the
-- meetings it groups use, and the `auth.uid() is not null` predicate is what
-- actually does the gating: any reader who can see a meeting can see the
-- semester it belongs to, so a `第N週` label never renders against a row the
-- reader cannot join to.
--
-- `using (true)` would have been the wrong call even though a semester row is
-- just a ROC year, a term, a date and a week count. It leaks less than the
-- meetings do, but it leaks it to a strictly wider audience — anon could read
-- the lab's whole semester calendar while being unable to read a single meeting.
-- Grouping rows must not be more public than the rows they group.
--
-- Writes are the admin's: the semester is the schedule's frame, and a member
-- editing it would renumber everybody's weeks.
alter table public.meeting_semesters enable row level security;

create policy meeting_semesters_select on public.meeting_semesters
  for select to public using ((auth.uid() is not null));
create policy meeting_semesters_insert on public.meeting_semesters
  for insert to authenticated with check (public.is_meetings_admin());
create policy meeting_semesters_update on public.meeting_semesters
  for update to authenticated using (public.is_meetings_admin()) with check (public.is_meetings_admin());
create policy meeting_semesters_delete on public.meeting_semesters
  for delete to authenticated using (public.is_meetings_admin());

-- These mirror what `public.meetings` itself holds. `anon` stays in the select
-- grant because `meetings` grants select to `anon` too — checked, not assumed:
-- this project's `alter default privileges` hands every new public table all
-- privileges to anon / authenticated / service_role, so `meetings.relacl` reads
-- `anon=arwdDxtm/postgres`. Anon's inability to read `meetings` comes entirely
-- from `meetings_select`'s `auth.uid() is not null`, never from the grant — which
-- is exactly why the policy above had to be the thing that got fixed.
grant select on public.meeting_semesters to anon, authenticated, service_role;
grant insert, update, delete on public.meeting_semesters to authenticated, service_role;
