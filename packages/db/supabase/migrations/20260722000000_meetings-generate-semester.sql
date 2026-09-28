-- Bulk-generate a semester's weekly meeting rows for /meetings.
--
-- The schedule is a flat public.meetings table (one row per week). Before this,
-- an admin opened each new term by clicking "＋ 新增一週" ~16 times and then
-- toggling the holiday weeks by hand. This RPC does that in one call: given the
-- first week's date + a week count + a holiday list read off the NYCU 行事曆, it
-- inserts 第1週..第N週 on the schedule's own weekday and pre-marks the holidays.
--
-- Conventions (see the reading-list / schedule-edit migrations for the table):
--   * 第N週 is CONTINUOUS and INCLUDES holiday weeks (a holiday still consumes a
--     number), and the reason rides in week_label as 第N週(原因) — e.g.
--     第8週(月考週). presenter stays null; is_holiday flags it. This matches the
--     20260722000100 normalization of the older rows.
--   * "第N週(原因)" still matches the 第(\d+)週 parser used by meetings_insert_week
--     and the client's nextWeekLabel(), so the schedule-edit RPCs keep working.
--   * NEVER overwrites an existing (year, date) row, so presenters and manual
--     edits are preserved and the whole call is safely re-runnable (idempotent
--     for dates already present). Marking an existing row as a holiday is left to
--     the inline editor — generate only fills blanks.
--   * Inserts blank rows only (no teacher_paper_id), so the paper cooldown /
--     uniqueness constraints are never touched — no SET CONSTRAINTS dance needed.
--
-- admin-only (is_meetings_admin), granted to authenticated/service_role only,
-- like meetings_swap / meetings_insert_week / meetings_remove_week.
create or replace function public.meetings_generate_semester(
  p_year int,
  p_start_date date,
  p_weeks int,
  p_holidays jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_inserted int := 0;
  v_skipped  int := 0;
  v_date     date;
  v_reason   text;
  i int;
begin
  if not public.is_meetings_admin() then
    raise exception 'Forbidden: 僅管理員可產生排班' using errcode = '42501';
  end if;
  if p_start_date is null then
    raise exception '缺少起始日期' using errcode = 'P0001';
  end if;
  if p_weeks is null or p_weeks < 1 or p_weeks > 60 then
    raise exception '週數必須介於 1 與 60 之間' using errcode = 'P0001';
  end if;

  -- Serialize concurrent generates for the same schedule year: two admins
  -- generating at once would both pass the per-date existence check and
  -- double-insert. A transaction-scoped advisory lock keyed on the year is
  -- enough (different years never collide, and generate only appends).
  perform pg_advisory_xact_lock(hashtext('meetings_generate_semester:' || p_year));

  for i in 1 .. p_weeks loop
    -- +7 per step preserves the start date's own weekday (no hard-coded Monday).
    v_date := p_start_date + (i - 1) * 7;

    if exists (
      select 1 from public.meetings
      where year = p_year and scheduled_date = v_date
    ) then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    -- A holiday is any generated date present in p_holidays; SELECT ... INTO
    -- resets v_reason to NULL when no row matches, so no value leaks across
    -- iterations.
    select h ->> 'label' into v_reason
    from jsonb_array_elements(coalesce(p_holidays, '[]'::jsonb)) as h
    where nullif(h ->> 'date', '')::date = v_date
    limit 1;

    if v_reason is not null and v_reason <> '' then
      insert into public.meetings
        (year, week_label, scheduled_date, is_holiday, presenter, presenter_user_id)
      values
        (p_year, '第' || i || '週(' || v_reason || ')', v_date, true, null, null);
    else
      insert into public.meetings
        (year, week_label, scheduled_date, is_holiday, presenter, presenter_user_id)
      values
        (p_year, '第' || i || '週', v_date, false, null, null);
    end if;

    v_inserted := v_inserted + 1;
  end loop;

  return jsonb_build_object('inserted', v_inserted, 'skipped', v_skipped);
end;
$function$;

revoke all on function public.meetings_generate_semester(int, date, int, jsonb) from public, anon;
grant execute on function public.meetings_generate_semester(int, date, int, jsonb) to authenticated, service_role;
