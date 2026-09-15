-- /meetings 的排班單位從「存起來的 bucket」改成「日期本身」。
--
-- 原本有三份互相獨立的答案在回答「這一週屬於哪個排班」：meetings.year、
-- meetings.semester_id、scheduled_date。前兩份在建立時蓋一次就永不重算，
-- 而唯一會被編輯的是第三份，所以它們必然漂開。三個已確認的後果：
--
--   1. insert 跨年時，被推進 1 月的人 year 還是去年，於是留在去年的頁籤；
--   2. backfill 用日期猜 semester_id，把兩週寒假判進下學期，而
--      meetings_next_free_date 的跳過式搜尋又把上學期的尾巴丟到它們後面，
--      造成 2027/2 兩個學期區間重疊、時序顛倒；
--   3. Nextcloud 資料夾跟著日期走，但過濾跟著 year 走，所以跨年那場的錄影
--      兩邊都對不上，永遠不會被自動連結。
--
-- 解法不是加三個檢查，是移除讓它們得以發生的兩個冗餘欄位和一張冗餘的表。
-- 學期界線由維護者拍板寫死：上學期 8/1 – 隔年 1/31，下學期 2/1 – 7/31，
-- 各含自己的寒／暑假，編號 第1–16週。這條規則與既有的
-- meeting_academic_year / meeting_term 定義完全一致，那兩支不動。

-- ── 1. 學期的日期窗 ─────────────────────────────────────────────────────────
-- 兩端皆含（end 回傳 1/31 或 7/31 本身，不是 exclusive 的隔天），因為每個
-- 呼叫端都是 `between start and end`，而 1/31 與 7/31 是固定存在的日期，
-- 沒有閏年問題。immutable + 空 search_path：不碰任何表，也讓 Supabase linter
-- 的 function_search_path_mutable 安靜。
create or replace function public.meeting_semester_start(p_date date)
returns date language sql immutable set search_path to '' as $$
  select case
    when extract(month from p_date) >= 8
      then make_date(extract(year from p_date)::int, 8, 1)
    when extract(month from p_date) = 1
      then make_date(extract(year from p_date)::int - 1, 8, 1)
    else make_date(extract(year from p_date)::int, 2, 1)
  end;
$$;

create or replace function public.meeting_semester_end(p_date date)
returns date language sql immutable set search_path to '' as $$
  select case
    when extract(month from p_date) >= 8
      then make_date(extract(year from p_date)::int + 1, 1, 31)
    when extract(month from p_date) = 1
      then make_date(extract(year from p_date)::int, 1, 31)
    else make_date(extract(year from p_date)::int, 7, 31)
  end;
$$;

comment on function public.meeting_semester_start(date) is
  '該日期所屬學期的第一天（8/1 或 2/1）。學期界線寫死在日期上，不查表。';
comment on function public.meeting_semester_end(date) is
  '該日期所屬學期的最後一天，含（1/31 或 7/31）。';

-- ── 2. 新造尾端週次的標籤 ───────────────────────────────────────────────────
-- insert_week 與 append_week 共用，兩者不會因此漂開。
--
-- max+1 而非 count+1：第N週 數的是學期的第 N 個日曆週，假期週也佔掉自己的
-- 號碼（generate 會寫 `第N週(原因)`），所以 count 會少算。
--
-- 編號只走到 16。超過就改標該學期的休假標籤——這是「編號 1–16」這條規則的
-- 直接後果，也擋掉舊邏輯 coalesce(max,0)+1 會生出 `第17週` 的情況。實務上
-- 管理員本來就會手改這些標籤，這只是給一個合理的預設。
create or replace function public.meetings_mint_week_label(p_date date)
returns text
language sql
stable
security definer
set search_path to 'public'
as $function$
  select case
    when coalesce(max(substring(week_label from '第(\d+)週')::int), 0) >= 16
      then case when public.meeting_term(p_date) = 1 then '寒假' else '暑假' end
    else '第'
         || (coalesce(max(substring(week_label from '第(\d+)週')::int), 0) + 1)
         || '週'
  end
  from public.meetings
  where scheduled_date between public.meeting_semester_start(p_date)
                           and public.meeting_semester_end(p_date)
    and week_label ~ '第\d+週';
$function$;

-- 不是 API surface，只從其他 SECURITY DEFINER 函式呼叫。Postgres 預設把
-- EXECUTE 直接授予 anon/authenticated（不是透過 PUBLIC），所以三個都要點名。
revoke all on function public.meetings_mint_week_label(date) from public, anon, authenticated;

-- ── 3. 移除「用日期猜學期然後存起來」的整套機制 ──────────────────────────────
-- 這個 trigger 與它呼叫的 find-or-create 的唯一工作，就是把日期推導的結果寫進
-- 一個欄位裡。現在直接推導，中間那一步連同它能造成的漂移一起消失。
drop trigger if exists meetings_set_semester on public.meetings;
drop function if exists public.meetings_set_semester();
drop function if exists public.meeting_semester_for_date(date);

-- ── 4. 刪掉兩個冗餘欄位與那張冗餘的表 ───────────────────────────────────────
-- 兩個欄位的值百分之百可以從 scheduled_date 重算，所以沒有資料遺失。
-- meetings_year_date 與 meetings_semester 兩個索引會隨欄位自動消失，不必點名；
-- scheduled_date 上已有 meetings_scheduled_date_uniq，日期區間查詢直接吃它。
alter table public.meetings drop column year;
alter table public.meetings drop column semester_id;

-- meeting_semesters 沒有攜帶任何日期推不出來的資訊：semesterLabel 只用
-- academic_year/term，而 start_date / planned_weeks 從一開始就是
-- informational metadata，沒有東西 branch 在上面。
drop table public.meeting_semesters;

-- ── 5. generate：一次一個學期，編號屬於那個學期 ─────────────────────────────
-- 與 20260828120001 的差異：
--   * p_year 參數移除——year 欄位不存在了；
--   * 不再 find-or-create 學期，也不再回寫 start_date / planned_weeks；
--   * advisory lock 改 key 在從 p_start_date 推導出的學期日期窗起點；
--   * 「本學期已有第i週」的略過檢查改用學期日期窗界定。
drop function if exists public.meetings_generate_semester(int, date, int, jsonb);

create or replace function public.meetings_generate_semester(
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
  v_skipped_date  int := 0;
  v_skipped_label int := 0;
  v_date     date;
  v_reason   text;
  v_win_from date;
  v_win_to   date;
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

  v_win_from := public.meeting_semester_start(p_start_date);
  v_win_to   := public.meeting_semester_end(p_start_date);

  -- 同一個學期的併發 generate 要串行化：兩個管理員同時按，兩邊都會通過
  -- 逐日存在性檢查然後雙重插入。交易範圍的 advisory lock 就夠了（不同學期
  -- 不會互撞，而 generate 只會 append）。
  perform pg_advisory_xact_lock(hashtext('meetings_generate_semester:' || v_win_from::text));

  for i in 1 .. p_weeks loop
    -- 每步 +7 保留起始日自己的星期幾（沒有寫死星期一）。
    v_date := p_start_date + (i - 1) * 7;

    -- 這裡是全域的，不受學期窗限制，而且是刻意的：一天一場是全實驗室的
    -- 不變量，不是每學期的。兩列同一天會讓排班有兩個「這週」，也會讓
    -- Nextcloud 的錄影比對變得有歧義（apps/portal/lib/meetings/
    -- recording-match.ts 是用檔名裡的日期當 key 的）。
    if exists (select 1 from public.meetings where scheduled_date = v_date) then
      v_skipped_date := v_skipped_date + 1;
      continue;
    end if;

    -- 這個學期已經有第i週了。再插一列會讓同一個學期有兩列宣稱同一個週次。
    -- 用前綴比對，所以手打的 第i週(原因) 也算佔用。
    if exists (
      select 1 from public.meetings
      where scheduled_date between v_win_from and v_win_to
        and week_label ~ ('^第' || i || '週')
    ) then
      v_skipped_label := v_skipped_label + 1;
      continue;
    end if;

    -- 假期是任何出現在 p_holidays 裡的產生日期；SELECT ... INTO 在沒有列符合
    -- 時會把 v_reason 重設為 NULL，所以值不會跨迭代殘留。
    select h ->> 'label' into v_reason
    from jsonb_array_elements(coalesce(p_holidays, '[]'::jsonb)) as h
    where nullif(h ->> 'date', '')::date = v_date
    limit 1;

    if v_reason is not null and v_reason <> '' then
      insert into public.meetings
        (week_label, scheduled_date, is_holiday, presenter, presenter_user_id)
      values
        ('第' || i || '週(' || v_reason || ')', v_date, true, null, null);
    else
      insert into public.meetings
        (week_label, scheduled_date, is_holiday, presenter, presenter_user_id)
      values
        ('第' || i || '週', v_date, false, null, null);
    end if;

    v_inserted := v_inserted + 1;
  end loop;

  return jsonb_build_object(
    'inserted', v_inserted,
    'skipped', v_skipped_date + v_skipped_label,
    'skipped_date', v_skipped_date,
    'skipped_label', v_skipped_label
  );
end;
$function$;

revoke all on function public.meetings_generate_semester(date, int, jsonb) from public, anon;
grant execute on function public.meetings_generate_semester(date, int, jsonb) to authenticated, service_role;

-- ── 6. insert：插一週空白，後面整條往後推 ───────────────────────────────────
-- 與 20260828120001 的差異只有搬移範圍：原本綁在 semester_id 上，現在不設界。
-- 「整條」指的是跨越學期與年份的界線，不是「連假期週也一起搬」——假期週與
-- 演講週維持錨定不動，報告繞著它們流動。
--
-- 尾端仍然要找空位。搬移集合排除了錨定列，但那些列還佔著日期，所以
-- 「最後日期 + 7」那格可能正好是一列假期標記。差別在於：因為 >= 目標日期的
-- 內容列現在全部都在搬移集合裡，擋在前面的只可能是錨定列——這正是
-- meetings_next_free_date 原本要處理的情況。造成 2027/2 那個症狀的
-- 「跨過另一個學期的排班」在新模型下不可能發生。
create or replace function public.meetings_insert_week(p_at_meeting_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_target   public.meetings;
  v_ids      uuid[];
  v_dates    date[];
  v_labels   text[];
  v_k        int;
  v_new_date date;
  v_new_label text;
  v_blank_id uuid;
  i int;
begin
  if not public.is_meetings_admin() then
    raise exception 'Forbidden: 僅管理員可調整排班' using errcode = '42501';
  end if;

  select * into v_target from public.meetings where id = p_at_meeting_id for update;
  if not found then raise exception '找不到此週次' using errcode = 'P0001'; end if;
  if v_target.is_holiday then raise exception '不能在假期週插入' using errcode = 'P0001'; end if;
  if v_target.is_speaker then raise exception '不能在演講週插入' using errcode = 'P0001'; end if;

  -- 鎖住目標日期之後的所有列：整條都要動。
  perform 1 from public.meetings
  where scheduled_date >= v_target.scheduled_date for update;

  -- 日期位移會讓列跨過每篇 paper 的冷卻窗；defer 它，只審最終狀態
  -- （理由見 meetings_swap）。
  set constraints public.meetings_paper_cooldown deferred;

  -- 目標日之後的報告格（非假期、非演講週），依日期排序。不設學期或年份上界。
  select array_agg(id order by scheduled_date),
         array_agg(scheduled_date order by scheduled_date),
         array_agg(coalesce(week_label, '') order by scheduled_date)
    into v_ids, v_dates, v_labels
  from public.meetings
  where not is_holiday and not is_speaker
    and scheduled_date >= v_target.scheduled_date;

  v_k := coalesce(array_length(v_ids, 1), 0);
  if v_k = 0 then return null; end if;

  -- 尾端新格：搬移集合最後一天 + 7，跳過錨定列佔住的日期。
  v_new_date := public.meetings_next_free_date(v_dates[v_k] + 7);
  v_new_label := public.meetings_mint_week_label(v_new_date);

  -- 每一列往後移一格（由後往前，避免暫時性的重複日期——scheduled_date 上有
  -- unique 索引）。第 i 列移到第 i+1 格；最後一列拿新造的那格。
  -- 標籤釘在日曆位置上、移動的是人：每一列接收它移進去那一格的標籤。
  for i in reverse v_k .. 1 loop
    if i = v_k then
      update public.meetings set scheduled_date = v_new_date, week_label = v_new_label
      where id = v_ids[i];
    else
      update public.meetings set scheduled_date = v_dates[i + 1], week_label = nullif(v_labels[i + 1], '')
      where id = v_ids[i];
    end if;
  end loop;

  -- 空白週補在被讓出來的最早那一格。
  insert into public.meetings (week_label, scheduled_date, is_holiday, presenter, presenter_user_id)
  values (nullif(v_labels[1], ''), v_dates[1], false, null, null)
  returning id into v_blank_id;

  return v_blank_id;
end;
$function$;

revoke all on function public.meetings_insert_week(uuid) from public, anon;
grant execute on function public.meetings_insert_week(uuid) to authenticated, service_role;

-- ── 7. remove：刪一週，後面整條往前拉（insert 的精確反向操作）────────────────
create or replace function public.meetings_remove_week(p_at_meeting_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_target public.meetings;
  v_ids    uuid[];
  v_dates  date[];
  v_labels text[];
  v_m      int;
  i int;
begin
  if not public.is_meetings_admin() then
    raise exception 'Forbidden: 僅管理員可調整排班' using errcode = '42501';
  end if;

  select * into v_target from public.meetings where id = p_at_meeting_id for update;
  if not found then raise exception '找不到此週次' using errcode = 'P0001'; end if;
  if v_target.is_holiday then raise exception '不能刪除假期週' using errcode = 'P0001'; end if;
  if v_target.is_speaker then raise exception '不能刪除演講週' using errcode = 'P0001'; end if;

  perform 1 from public.meetings
  where scheduled_date >= v_target.scheduled_date for update;

  select array_agg(id order by scheduled_date),
         array_agg(scheduled_date order by scheduled_date),
         array_agg(coalesce(week_label, '') order by scheduled_date)
    into v_ids, v_dates, v_labels
  from public.meetings
  where not is_holiday and not is_speaker
    and scheduled_date >= v_target.scheduled_date;

  v_m := coalesce(array_length(v_ids, 1), 0);

  set constraints public.meetings_paper_cooldown deferred;

  -- 刪掉目標（它的 meeting_questioners 會 cascade 掉）
  delete from public.meetings where id = v_ids[1];

  -- 後面每一列往前拉一格（由前往後；格子邊拉邊空出來）。
  for i in 2 .. v_m loop
    update public.meetings set scheduled_date = v_dates[i - 1], week_label = nullif(v_labels[i - 1], '')
    where id = v_ids[i];
  end loop;
end;
$function$;

revoke all on function public.meetings_remove_week(uuid) from public, anon;
grant execute on function public.meetings_remove_week(uuid) to authenticated, service_role;

-- ── 8. append：接在某個學期的最後面 ─────────────────────────────────────────
-- 參數從 semester id 換成 (學年度, 學期)——學期不再是一列資料，它是一段日期。
-- 日期窗直接從 ROC 學年度算：115 上學期 = 2026-08-01 .. 2027-01-31。
drop function if exists public.meetings_append_week(uuid);

create or replace function public.meetings_append_week(
  p_academic_year int,
  p_term smallint
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_from     date;
  v_to       date;
  v_max_date date;
  v_new_date date;
  v_new_id   uuid;
begin
  if not public.is_meetings_admin() then
    raise exception 'Forbidden: 僅管理員可調整排班' using errcode = '42501';
  end if;
  if p_academic_year is null or p_term is null or p_term not in (1, 2) then
    raise exception '缺少學期' using errcode = 'P0001';
  end if;

  if p_term = 1 then
    v_from := make_date(p_academic_year + 1911, 8, 1);
    v_to   := make_date(p_academic_year + 1912, 1, 31);
  else
    v_from := make_date(p_academic_year + 1912, 2, 1);
    v_to   := make_date(p_academic_year + 1912, 7, 31);
  end if;

  -- 串行化同一個學期的 append：兩個管理員同時按會讀到同一個最大日期與同一個
  -- 最大週次號，然後兩邊都插入。
  perform pg_advisory_xact_lock(hashtext('meetings_append_week:' || v_from::text));

  -- 與其他排班編輯 RPC 相同的列鎖，避免 append 與 insert/remove 的搬移交錯。
  perform 1 from public.meetings
  where scheduled_date between v_from and v_to for update;

  -- 要接續的是這個學期最後一列的日期。假期週與演講週也算：這是排班的結尾，
  -- 不是在重建節奏，而底下找空位的走訪本來就會跨過它們。
  select max(scheduled_date) into v_max_date
  from public.meetings
  where scheduled_date between v_from and v_to;

  if v_max_date is null then
    raise exception '此學期還沒有任何週次，無法接續新增' using errcode = 'P0001';
  end if;

  -- +7 保留這個學期實際跑的星期幾（沒有寫死星期一，也沒有假設 16 週），
  -- 再跨過任何已被佔用的日期。這個走訪只認「有沒有被佔用」，不認學期邊界，
  -- 所以連續 8 週都被排滿時，它會直接跨過 v_to 走進下一個學期——底下用
  -- v_from..v_to 再檢查一次，把這種情況擋下來，而不是讓它悄悄插進另一個
  -- 學期。
  v_new_date := public.meetings_next_free_date(v_max_date + 7);

  if v_new_date > v_to then
    raise exception '此學期已經排到最後一天 %，下一個空位落在下學期，請改對下學期呼叫 append_week',
      v_to
      using errcode = 'P0001';
  end if;

  insert into public.meetings
    (week_label, scheduled_date, is_holiday, presenter, presenter_user_id)
  values
    (public.meetings_mint_week_label(v_new_date), v_new_date, false, null, null)
  returning id into v_new_id;

  return v_new_id;
end;
$function$;

revoke all on function public.meetings_append_week(int, smallint) from public, anon;
grant execute on function public.meetings_append_week(int, smallint) to authenticated, service_role;

-- ── 9. next_free_date：只改錯誤訊息 ─────────────────────────────────────────
-- 走訪本身不變（8 個候選的上界也不變）。訊息裡「與另一學期的排班重疊」那句
-- 已經不成立：學期界線是日期，insert 會把 >= 目標日期的內容列全部一起搬，
-- 所以擋在前面的只可能是錨定的假期／演講週。
create or replace function public.meetings_next_free_date(p_from date)
returns date
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_date    date := p_from;
  v_blocked date[] := '{}';
  i int;
begin
  if p_from is null then
    raise exception '缺少起始日期' using errcode = 'P0001';
  end if;

  for i in 1 .. 8 loop
    if not exists (select 1 from public.meetings where scheduled_date = v_date) then
      return v_date;
    end if;
    v_blocked := v_blocked || v_date;
    v_date := v_date + 7;
  end loop;

  raise exception '找不到可用的日期：% 起連續 8 個同一星期幾的日期都已排定（%），請確認是否有連續的假期週或演講週擋住',
    p_from, array_to_string(v_blocked, '、')
    using errcode = 'P0001';
end;
$function$;

revoke all on function public.meetings_next_free_date(date) from public, anon, authenticated;

-- ── 10. swap：同學期守衛改成比較推導出來的學期 ──────────────────────────────
-- 只有守衛那幾行變了，其餘整支照抄 20260828120001 的版本。
--
-- Rebalance key BEFORE the row locks: PR #1146's fix (20260914170716, still
-- unreleased as of this migration) moves the rebalance advisory lock ahead of
-- these two row locks to close a deadlock cycle with
-- meetings_rebalance_questioners_exec. That migration sorts AFTER this one, so
-- on a from-scratch replay it would simply overwrite this definition and win
-- outright — but prod already has 20260914170716 applied and does not yet have
-- this migration, so prod's apply order is this one first, then
-- 20260915043315 (the merge fix). Without the lock here, that order would
-- leave meetings_swap briefly missing it between the two migrations,
-- reopening the exact deadlock window #1146 closed. Taking it here too makes
-- both apply orders converge on the same intermediate state.
create or replace function public.meetings_swap(p_a uuid, p_b uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_a public.meetings;
  v_b public.meetings;
begin
  if not public.is_meetings_admin() then
    raise exception 'Forbidden: 僅管理員可調整排班' using errcode = '42501';
  end if;
  if p_a = p_b then
    raise exception '不能與自己互換' using errcode = 'P0001';
  end if;

  -- Rebalance key BEFORE the row locks. See 20260914170716's header.
  perform pg_advisory_xact_lock(hashtext('meetings_rebalance_questioners'));

  -- lock both rows in a stable id order to avoid deadlocks under concurrent edits
  perform 1 from public.meetings where id = least(p_a, p_b) for update;
  perform 1 from public.meetings where id = greatest(p_a, p_b) for update;

  select * into v_a from public.meetings where id = p_a;
  if not found then raise exception '找不到週次' using errcode = 'P0001'; end if;
  select * into v_b from public.meetings where id = p_b;
  if not found then raise exception '找不到週次' using errcode = 'P0001'; end if;

  -- 同一個學期 = 同一個學期日期窗。比較起點就夠了，兩個窗不可能只有一端相同。
  if public.meeting_semester_start(v_a.scheduled_date)
     <> public.meeting_semester_start(v_b.scheduled_date) then
    raise exception '只能在同一學期內互換' using errcode = 'P0001';
  end if;
  if v_a.is_holiday or v_b.is_holiday then
    raise exception '假期週不可互換' using errcode = 'P0001';
  end if;
  if v_a.is_speaker or v_b.is_speaker then
    raise exception '演講週不可互換' using errcode = 'P0001';
  end if;
  if v_a.is_thesis or v_b.is_thesis then
    raise exception '碩論週不可互換' using errcode = 'P0001';
  end if;

  -- Defer the per-paper 365-day cooldown so the transient mid-swap state (both
  -- rows briefly sharing a paper) is only judged at commit, by which point the
  -- papers have fully traded and the final state is valid.
  set constraints public.meetings_paper_cooldown deferred;

  -- Clear the reading-list link on both rows first: meetings_presenter_paper_uniq
  -- is a partial index (can't be deferred), so we must never expose a duplicate
  -- (presenter, teacher_paper_id) pair mid-swap. The sync trigger clears the
  -- mirrored paper_title/paper_link too; the swap below re-sets everything.
  update public.meetings set teacher_paper_id = null where id in (p_a, p_b);

  -- Swap the whole presentation payload (presenter + reading-list paper + ppt /
  -- video / notes). Slot fields (scheduled_date / week_label / is_holiday /
  -- location / start_time) stay put, so questioners stay on the date. For
  -- reading-list rows the trigger re-derives paper_title/paper_link from
  -- teacher_paper_id; for legacy free-text rows the explicit values below stand.
  update public.meetings set
    presenter = v_b.presenter, presenter_user_id = v_b.presenter_user_id,
    teacher_paper_id = v_b.teacher_paper_id,
    paper_title = v_b.paper_title, paper_link = v_b.paper_link,
    ppt_uploaded = v_b.ppt_uploaded, ppt_link = v_b.ppt_link,
    video_uploaded = v_b.video_uploaded, video_link = v_b.video_link,
    notes = v_b.notes
  where id = p_a;

  update public.meetings set
    presenter = v_a.presenter, presenter_user_id = v_a.presenter_user_id,
    teacher_paper_id = v_a.teacher_paper_id,
    paper_title = v_a.paper_title, paper_link = v_a.paper_link,
    ppt_uploaded = v_a.ppt_uploaded, ppt_link = v_a.ppt_link,
    video_uploaded = v_a.video_uploaded, video_link = v_a.video_link,
    notes = v_a.notes
  where id = p_b;

  -- self-heal only: evict a questioner that now equals the new presenter, backfill to 3.
  perform public.meetings_sync_questioners(p_a);
  perform public.meetings_sync_questioners(p_b);
end;
$function$;

revoke all on function public.meetings_swap(uuid, uuid) from public, anon;
grant execute on function public.meetings_swap(uuid, uuid) to authenticated, service_role;

-- ── 11. guard_columns：兩個被釘住的欄位不見了 ───────────────────────────────
-- 從 20260828120001 整支複製，只刪掉 `new.year := old.year;` 與
-- `new.semester_id := old.semester_id;` 兩行，其餘一字不動。欄位不存在了，
-- 釘住它們的那兩行也就沒有對象。
create or replace function public.meetings_guard_columns()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if current_setting('role', true) = 'service_role' or auth.uid() is null then
    return new;
  end if;

  if public.is_meetings_admin() then
    return new;
  end if;

  -- Slot fields: when, where, and what kind of week this is. is_thesis lives
  -- here — flagging the exception is key #1, and it is the admin's alone.
  new.week_label     := old.week_label;
  new.scheduled_date := old.scheduled_date;
  new.is_holiday     := old.is_holiday;
  new.is_speaker     := old.is_speaker;
  new.is_thesis      := old.is_thesis;
  new.location       := old.location;
  new.start_time     := old.start_time;
  new.created_at     := old.created_at;

  -- Claiming an empty slot (meetings_claim) is the one sanctioned non-admin
  -- transition: null -> yourself. See 20260817060000 for why it cannot be
  -- reached through PostgREST.
  if not (old.presenter_user_id is null and new.presenter_user_id = auth.uid())
  then
    new.presenter         := old.presenter;
    new.presenter_user_id := old.presenter_user_id;
  end if;

  -- Key #2: on a week an admin has already flagged as a thesis, the presenter
  -- writes their own title. Read OLD, not NEW — the flag was pinned above, so
  -- flipping is_thesis and writing a title in one statement is not a shortcut
  -- around key #1. Everywhere else the title stays derived.
  if not old.is_thesis then
    new.paper_title := old.paper_title;
  end if;

  -- Never user-supplied, on any kind of week.
  new.paper_link := old.paper_link;

  return new;
end;
$function$;

-- ── 12. fill_presenters：範圍從 year 欄位換成日期落在那一年 ──────────────────
-- 從 20260831140100 整支複製，簽名不變（頁籤仍然是西元年），只有兩處範圍
-- 述詞改寫。其餘——advisory lock、is_thesis 排除、台北日期釘選、
-- meetings_presenter_paper_uniq 的 unique_violation 重試、沒寫入就不前進
-- 這條規則——一字不動。
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

  -- Serialize concurrent fills of the same calendar year with an advisory
  -- lock keyed on p_year — the same pg_advisory_xact_lock technique
  -- meetings_generate_semester uses, keyed there on its own semester-window
  -- start date instead, since the two functions operate over different
  -- windows (a calendar year here vs. a semester there).
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
  where public.meetings_is_rotation_member(up.lab_status);

  select count(*)::int into v_excluded
  from public.meeting_presenter_pool p
  join public.user_profiles up on up.id = p.user_id
  where not public.meetings_is_rotation_member(up.lab_status);

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
  -- week; and 20260831140100's active-member filter makes a graduated
  -- member who holds a week off-roster by construction. Skipping past them and
  -- resuming after the last roster member who actually took a week is what
  -- "continue the rotation" means.
  select array_position(v_roster, m.presenter_user_id)
  into v_last_pos
  from public.meetings m
  where m.scheduled_date between make_date(p_year, 1, 1) and make_date(p_year, 12, 31)
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
  -- 範圍是「日期落在 p_year 這一年」的列，不再是 year 欄位。頁籤仍然是西元年，
  -- 所以語意沒變：跨年度仍然從名單頭重新開始，因為「去年的尾巴該不該擠掉今年
  -- 的頭」是一個還沒有人回答的排班問題。差別只在於，被推過年底的那個人現在
  -- 真的會被算進新的一年——以前他的 year 欄位還是去年，於是被漏掉。
  v_index := coalesce(v_last_pos, 0);

  for v_meeting in
    select id
    from public.meetings
    where scheduled_date between make_date(p_year, 1, 1) and make_date(p_year, 12, 31)
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
