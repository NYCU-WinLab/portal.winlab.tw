-- Redeclared whole from 20260817060100:287. The ONLY change is the two
-- array_agg ORDER BY clauses, which now lead with meetings_tier_rank so the
-- roster is walked 博士班 → 碩士 → 大學部 before falling back to intake year.
-- Everything else — the advisory lock, the is_thesis exclusion, the Taipei
-- date pin, the unique_violation retry, the no-advance-on-no-write rule — is
-- byte-for-byte the prior definition, because none of it is what changed.
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

  select array_agg(p.user_id
                   order by public.meetings_tier_rank(up.lab_status) asc,
                            p.admission_year asc, p.sort_order asc, p.user_id asc),
         array_agg(coalesce(up.name, up.email, p.user_id::text)
                   order by public.meetings_tier_rank(up.lab_status) asc,
                            p.admission_year asc, p.sort_order asc, p.user_id asc)
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

  return jsonb_build_object('filled', v_filled, 'poolSize', v_size);
end;
$function$;

revoke all on function public.meetings_fill_presenters(integer) from public, anon;
grant execute on function public.meetings_fill_presenters(integer) to authenticated;
