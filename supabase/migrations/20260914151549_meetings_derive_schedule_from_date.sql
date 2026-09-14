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
