-- A presenter roster with an explicit running order, grouped by admission year.
--
-- Deliberately NOT modelled like meeting_question_pool. That pool derives
-- fairness from history and stores no order, because "who should ask next" is
-- a question with a correct answer. "Who presents next" is not — the lab
-- decides it, seniors usually go first, and people swap. So this table stores
-- the order an admin set, and the only automation reads it in sequence.
--
-- Model:
--   * admission_year is 民國 (ROC) year, three digits, e.g. 113. It mirrors
--     Keycloak's `admissionYear` attribute, but is stored here rather than
--     joined: only a minority of realm users carry that attribute, so the
--     roster cannot depend on it. The app offers to prefill it; an admin can
--     always type it.
--   * sort_order is 1-based WITHIN a cohort. Cohorts run seniors-first
--     (admission_year ascending), so the global order is
--     (admission_year, sort_order) — with user_id as a final tiebreak so a
--     corrupted ordering still reads deterministically instead of shuffling.
--   * The unique constraint is DEFERRABLE so meetings_pool_move can swap two
--     rows in one statement without parking one at a bogus value first.
--
-- Everything that mutates order runs in a SECURITY DEFINER RPC, so the roster
-- can never end up with a gap or a duplicate position from a partial client
-- write.

-- 1. Table --------------------------------------------------------------------
create table if not exists public.meeting_presenter_pool (
  user_id        uuid primary key references public.user_profiles(id) on delete cascade,
  admission_year integer not null,
  sort_order     integer not null,
  created_at     timestamptz not null default now(),
  -- 民國 90 (2001) through 200 (2111): wide enough for alumni and far-future
  -- rows, narrow enough to catch a 西元 year typed in by mistake.
  constraint meeting_presenter_pool_year_range
    check (admission_year between 90 and 200),
  constraint meeting_presenter_pool_order_positive
    check (sort_order >= 1),
  constraint meeting_presenter_pool_position_uniq
    unique (admission_year, sort_order) deferrable initially immediate
);

create index if not exists meeting_presenter_pool_order_idx
  on public.meeting_presenter_pool (admission_year, sort_order);

-- 2. RLS ----------------------------------------------------------------------
-- Authenticated can read (the roster is public within the lab). Every write
-- goes through the RPCs below; the direct-write policy exists so an admin can
-- still repair the table by hand if an RPC ever gets it wrong.
alter table public.meeting_presenter_pool enable row level security;

create policy "authenticated read meeting_presenter_pool" on public.meeting_presenter_pool
  for select to authenticated using (true);
create policy "meetings admin write meeting_presenter_pool" on public.meeting_presenter_pool
  for all to authenticated
  using (is_meetings_admin())
  with check (is_meetings_admin());

grant delete, insert, references, select, trigger, truncate, update on public.meeting_presenter_pool to anon;
grant delete, insert, references, select, trigger, truncate, update on public.meeting_presenter_pool to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.meeting_presenter_pool to service_role;

-- 3. Roster view ---------------------------------------------------------------
-- security_invoker = true for the same reason as meeting_question_rotation:
-- without it the view would hand out user_profiles rows past their RLS.
-- last_presented_date is context for the admin ordering the roster, not an
-- input to any automation — the running order is what the admin set.
create or replace view public.meeting_presenter_roster
with (security_invoker = true) as
select
  p.user_id,
  p.admission_year,
  p.sort_order,
  up.name,
  up.email,
  p.created_at as pool_added_at,
  stats.last_presented_date,
  coalesce(stats.times_presented, 0) as times_presented
from public.meeting_presenter_pool p
join public.user_profiles up on up.id = p.user_id
left join (
  select
    m.presenter_user_id as user_id,
    max(m.scheduled_date) as last_presented_date,
    count(*) as times_presented
  from public.meetings m
  where m.presenter_user_id is not null
  group by m.presenter_user_id
) stats on stats.user_id = p.user_id
order by p.admission_year asc, p.sort_order asc, p.user_id asc;

grant select on public.meeting_presenter_roster to anon, authenticated, service_role;

-- 4. RPCs ----------------------------------------------------------------------

-- Close gaps in one cohort so positions stay 1..n with no holes. Internal
-- helper: every caller is a SECURITY DEFINER function that has already checked
-- admin, so this one only ever runs with that check behind it.
create or replace function public.meetings_pool_compact(p_admission_year integer)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  set constraints meeting_presenter_pool_position_uniq deferred;

  with renumbered as (
    select user_id,
           row_number() over (order by sort_order asc, user_id asc) as position
    from public.meeting_presenter_pool
    where admission_year = p_admission_year
  )
  update public.meeting_presenter_pool p
  set sort_order = r.position
  from renumbered r
  where p.user_id = r.user_id and p.sort_order <> r.position;

  set constraints meeting_presenter_pool_position_uniq immediate;
end;
$function$;

-- No `authenticated` grant: this is a helper for the RPCs below, not an API.
revoke all on function public.meetings_pool_compact(integer) from public, anon, authenticated;
grant execute on function public.meetings_pool_compact(integer) to service_role;

-- Add a member, or move an existing one to a different cohort. Either way they
-- land at the END of the target cohort: an admin who wants them earlier moves
-- them explicitly, which is more predictable than guessing an insert position.
create or replace function public.meetings_pool_upsert(
  p_user uuid,
  p_admission_year integer
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_old_year integer;
  v_in_pool  boolean;
  v_next     integer;
begin
  if not public.is_meetings_admin() then
    raise exception 'Forbidden: 僅管理員可管理報告順位' using errcode = '42501';
  end if;

  if not exists (select 1 from public.user_profiles where id = p_user) then
    raise exception '找不到此使用者' using errcode = 'P0001';
  end if;

  if p_admission_year is null or p_admission_year not between 90 and 200 then
    raise exception '入學學年須為民國年三碼（例如 113）' using errcode = 'P0001';
  end if;

  -- Serialize appends to a cohort. Without this two admins adding to the same
  -- year both read the same max(sort_order) and the loser gets a raw 23505
  -- instead of simply landing at n+1.
  perform pg_advisory_xact_lock(
    hashtext('meetings_presenter_pool:' || p_admission_year::text)
  );

  select admission_year into v_old_year
  from public.meeting_presenter_pool
  where user_id = p_user;
  -- Captured immediately: `found` reflects the most recent query, and the
  -- aggregate below always returns a row, so testing it later would always
  -- say true.
  v_in_pool := found;

  if v_in_pool and v_old_year = p_admission_year then
    -- Already in this cohort: changing nothing beats silently moving them to
    -- the back of a roster someone deliberately ordered.
    return;
  end if;

  if v_in_pool then
    delete from public.meeting_presenter_pool where user_id = p_user;
    perform public.meetings_pool_compact(v_old_year);
  end if;

  select coalesce(max(sort_order), 0) + 1 into v_next
  from public.meeting_presenter_pool
  where admission_year = p_admission_year;

  insert into public.meeting_presenter_pool (user_id, admission_year, sort_order)
  values (p_user, p_admission_year, v_next);
end;
$function$;

revoke all on function public.meetings_pool_upsert(uuid, integer) from public, anon;
grant execute on function public.meetings_pool_upsert(uuid, integer) to authenticated;

create or replace function public.meetings_pool_remove(p_user uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_year integer;
begin
  if not public.is_meetings_admin() then
    raise exception 'Forbidden: 僅管理員可管理報告順位' using errcode = '42501';
  end if;

  select admission_year into v_year
  from public.meeting_presenter_pool
  where user_id = p_user;

  if not found then
    return;
  end if;

  perform pg_advisory_xact_lock(
    hashtext('meetings_presenter_pool:' || v_year::text)
  );

  delete from public.meeting_presenter_pool where user_id = p_user;
  perform public.meetings_pool_compact(v_year);
end;
$function$;

revoke all on function public.meetings_pool_remove(uuid) from public, anon;
grant execute on function public.meetings_pool_remove(uuid) to authenticated;

-- Move one position up (-1) or down (+1) within the member's own cohort.
-- Cross-cohort moves are not a reorder, they are a change of admission year —
-- that goes through meetings_pool_upsert.
create or replace function public.meetings_pool_move(p_user uuid, p_delta integer)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_row       public.meeting_presenter_pool;
  v_neighbour public.meeting_presenter_pool;
begin
  if not public.is_meetings_admin() then
    raise exception 'Forbidden: 僅管理員可管理報告順位' using errcode = '42501';
  end if;

  if p_delta not in (-1, 1) then
    raise exception '一次只能移動一個位置' using errcode = 'P0001';
  end if;

  select * into v_row from public.meeting_presenter_pool where user_id = p_user;
  if not found then
    raise exception '此成員不在報告順位名單中' using errcode = 'P0001';
  end if;

  -- Two admins reordering the same cohort would otherwise each hold one row
  -- and wait on the other's — a deadlock, surfaced as a raw 40P01. One lock
  -- per cohort makes reorders take turns instead.
  perform pg_advisory_xact_lock(
    hashtext('meetings_presenter_pool:' || v_row.admission_year::text)
  );

  select * into v_neighbour
  from public.meeting_presenter_pool
  where admission_year = v_row.admission_year
    and sort_order = v_row.sort_order + p_delta;

  if not found then
    -- Already at the edge of the cohort. Not an error: the button being a
    -- no-op is friendlier than a toast for something the UI should have
    -- disabled anyway.
    return;
  end if;

  -- Deferred so the two rows can trade positions in one statement each without
  -- transiently colliding on (admission_year, sort_order).
  set constraints meeting_presenter_pool_position_uniq deferred;

  update public.meeting_presenter_pool
  set sort_order = v_row.sort_order
  where user_id = v_neighbour.user_id;

  update public.meeting_presenter_pool
  set sort_order = v_neighbour.sort_order
  where user_id = v_row.user_id;

  set constraints meeting_presenter_pool_position_uniq immediate;
end;
$function$;

revoke all on function public.meetings_pool_move(uuid, integer) from public, anon;
grant execute on function public.meetings_pool_move(uuid, integer) to authenticated;

-- Fill every unassigned presentation week of a year by walking the roster in
-- order and wrapping around when it runs out.
--
-- Only weeks from today onward are touched. Filling a past blank week would
-- invent a presentation that never happened, and no amount of convenience is
-- worth writing fiction into the record.
--
-- "Unassigned" means BOTH presenter columns are empty. A week carrying a
-- free-text presenter (an external name typed by hand) is already spoken for.
create or replace function public.meetings_fill_presenters(p_year integer)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_roster   uuid[];
  v_names    text[];
  v_size     int;
  v_index    int := 0;
  v_meeting  record;
  v_filled   int := 0;
  v_updated  int;
  v_attempts int;
  v_today    date := (now() at time zone 'Asia/Taipei')::date;
begin
  if not public.is_meetings_admin() then
    raise exception 'Forbidden: 僅管理員可排定報告人' using errcode = '42501';
  end if;

  -- Serialize concurrent fills of the same year, mirroring
  -- meetings_generate_semester's lock discipline.
  perform pg_advisory_xact_lock(hashtext('meetings_fill_presenters:' || p_year::text));

  select array_agg(p.user_id order by p.admission_year asc, p.sort_order asc, p.user_id asc),
         array_agg(coalesce(up.name, up.email, p.user_id::text)
                   order by p.admission_year asc, p.sort_order asc, p.user_id asc)
  into v_roster, v_names
  from public.meeting_presenter_pool p
  join public.user_profiles up on up.id = p.user_id;

  v_size := coalesce(array_length(v_roster, 1), 0);
  if v_size = 0 then
    return jsonb_build_object('filled', 0, 'poolSize', 0);
  end if;

  for v_meeting in
    select id
    from public.meetings
    where year = p_year
      and not is_holiday
      and not is_speaker
      and presenter_user_id is null
      and presenter is null
      -- The lab is in Taipei; the database session is not. Comparing against
      -- current_date (UTC by default on Supabase) would treat a Taipei
      -- morning as "yesterday" for eight hours and quietly fill a week that
      -- has already happened.
      and scheduled_date >= v_today
    order by scheduled_date asc, id asc
  loop
    v_attempts := 0;

    loop
      begin
        update public.meetings
        set presenter = v_names[(v_index % v_size) + 1],
            presenter_user_id = v_roster[(v_index % v_size) + 1]
        where id = v_meeting.id
          -- Re-assert the predicate at write time. The cursor is a snapshot,
          -- and meetings_claim can land between the two — without this a
          -- student's claim is silently overwritten and reported as filled.
          and presenter_user_id is null
          and presenter is null;
        get diagnostics v_updated = row_count;
        exit;
      exception when unique_violation then
        -- meetings_presenter_paper_uniq is a partial index and cannot be
        -- deferred: if this week already carries a reading-list paper the
        -- candidate has presented before, the insert fails. Without this
        -- handler the exception would abort the whole fill and leave every
        -- other week unassigned. Try the next member instead; give up on
        -- this week once the roster has been exhausted.
        v_index := v_index + 1;
        v_attempts := v_attempts + 1;
        if v_attempts >= v_size then
          v_updated := 0;
          exit;
        end if;
      end;
    end loop;

    if v_updated > 0 then
      -- Same convention as every other mutation in this app: a presenter
      -- change invalidates the questioner roster for that week.
      perform public.meetings_sync_questioners(v_meeting.id);
      v_index := v_index + 1;
      v_filled := v_filled + 1;
    end if;
    -- Deliberately no index advance when nothing was written: the candidate
    -- did not get a week, so they stay next in line.
  end loop;

  return jsonb_build_object('filled', v_filled, 'poolSize', v_size);
end;
$function$;

revoke all on function public.meetings_fill_presenters(integer) from public, anon;
grant execute on function public.meetings_fill_presenters(integer) to authenticated;
