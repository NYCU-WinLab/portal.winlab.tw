-- Redeclared whole from 20260830100100_meetings_fill_presenters_tier.sql:7.
-- Three changes, everything else byte-for-byte:
--
--   1. The roster is now built from ACTIVE members only. Before this, a
--      graduated member stayed a candidate and simply sorted last, so a pool
--      whose tail is alumni still handed them weeks once the active members
--      had each taken one.
--
--   2. The return carries `excluded`. A pool of twelve alumni and an empty pool
--      both used to answer {"filled": 0, "poolSize": 0}; the admin pressing the
--      button needs to be able to tell "nobody is in the pool" from "everyone
--      in the pool has graduated or has not synced from Keycloak yet".
--      It is returned always, not only when poolSize is 0 — a partial exclusion
--      is exactly as invisible.
--
--   3. v_index resumes instead of restarting. See the comment at its
--      assignment; this is the fix for the burden-shift described in
--      docs/superpowers/specs/2026-08-30-...-design.md §9.1 ③.
--
-- Untouched: the advisory lock, the is_thesis exclusion, the Taipei date pin,
-- the unique_violation retry against meetings_presenter_paper_uniq, and the
-- no-advance-on-no-write rule. None of that is what was wrong.
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
  v_excluded int;
  v_last_pos int;
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

  select array_agg(p.user_id
                   order by public.meetings_tier_rank(up.lab_status) asc,
                            p.admission_year asc, p.sort_order asc, p.user_id asc),
         array_agg(coalesce(up.name, up.email, p.user_id::text)
                   order by public.meetings_tier_rank(up.lab_status) asc,
                            p.admission_year asc, p.sort_order asc, p.user_id asc)
  into v_roster, v_names
  from public.meeting_presenter_pool p
  join public.user_profiles up on up.id = p.user_id
  where public.meetings_is_active_member(up.lab_status);

  select count(*)::int into v_excluded
  from public.meeting_presenter_pool p
  join public.user_profiles up on up.id = p.user_id
  where not public.meetings_is_active_member(up.lab_status);

  v_size := coalesce(array_length(v_roster, 1), 0);
  if v_size = 0 then
    return jsonb_build_object('filled', 0, 'poolSize', 0, 'excluded', v_excluded);
  end if;

  -- WHERE THE ROTATION PICKS UP.
  --
  -- v_index used to start at 0 on every call, while the loop below only visits
  -- weeks whose presenter is still null. Filling a term in two goes — half now,
  -- the rest when the rest of the schedule exists — therefore restarted from
  -- the top of the roster each time, handing the head of the list an extra talk
  -- per batch. Since 20260830100100 the head of the list is always tier 0, so
  -- the extra talks land on the same people every time.
  --
  -- That is not just an ordering wart. The questioner rate's denominator
  -- subtracts the weeks a member presents, so more talks means a smaller
  -- denominator, a higher rate, and LESS questioning duty. A preference about
  -- presentation order was quietly turning into a transfer of questioning load.
  --
  -- Resuming after whoever actually holds the latest assigned week makes a
  -- second batch continue the first instead of replaying it.
  --
  -- The `array_position(...) is not null` predicate is load-bearing, not
  -- defensive. Without it this picks the latest assigned week unconditionally
  -- and then asks where its presenter sits; an OFF-ROSTER holder answers NULL,
  -- coalesces to 0, and the fill restarts at the head — silently reverting to
  -- the exact behaviour this block exists to remove, in the case where it
  -- matters most. Off-roster holders are not exotic: meetings_claim performs no
  -- pool or membership check at all, so any member can claim the latest open
  -- week; and this migration's own active-member filter makes a graduated
  -- member who holds a week off-roster by construction. Skipping past them and
  -- resuming after the last roster member who actually took a week is what
  -- "continue the rotation" means.
  select array_position(v_roster, m.presenter_user_id)
  into v_last_pos
  from public.meetings m
  where m.year = p_year
    and m.presenter_user_id is not null
    and not m.is_holiday
    and not m.is_speaker
    and not m.is_thesis
    and array_position(v_roster, m.presenter_user_id) is not null
  order by m.scheduled_date desc, m.id desc
  limit 1;

  -- array_position is 1-based and the roster is read as
  -- v_roster[(v_index % v_size) + 1], so "the last one taken sits at position
  -- k" is exactly v_index := k. No off-by-one adjustment: adding one here would
  -- skip a member every batch.
  --
  -- NULL only when no week in this year is held by anyone currently on the
  -- roster — a fresh year, or one filled entirely before the current pool
  -- existed. Falling back to 0 there is correct: there is no rotation to
  -- resume.
  --
  -- Scoped to p_year on purpose. Crossing into a new academic year restarts at
  -- the top, because deciding whether last year's tail should displace this
  -- year's head is a scheduling question nobody has answered yet, and p_year is
  -- this function's whole world.
  v_index := coalesce(v_last_pos, 0);

  for v_meeting in
    select id
    from public.meetings
    where year = p_year
      and not is_holiday
      and not is_speaker
      and not is_thesis
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

  return jsonb_build_object('filled', v_filled, 'poolSize', v_size, 'excluded', v_excluded);
end;
$function$;

revoke all on function public.meetings_fill_presenters(integer) from public, anon;
grant execute on function public.meetings_fill_presenters(integer) to authenticated;
