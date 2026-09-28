begin;
select plan(14);

-- 上學期：8/1 開始，跨年到隔年 1/31
select is(public.meeting_semester_start('2026-08-01'::date), '2026-08-01'::date, '8/1 是上學期第一天');
select is(public.meeting_semester_end('2026-08-01'::date),   '2027-01-31'::date, '上學期結束在隔年 1/31');
select is(public.meeting_semester_start('2026-12-28'::date), '2026-08-01'::date, '12 月屬於同一個上學期');
select is(public.meeting_semester_end('2026-12-28'::date),   '2027-01-31'::date, '12 月的學期結束在隔年 1/31');

-- 1 月是上學期的尾巴，學年度算前一年
select is(public.meeting_semester_start('2027-01-04'::date), '2026-08-01'::date, '1 月回望到前一年的 8/1');
select is(public.meeting_semester_end('2027-01-04'::date),   '2027-01-31'::date, '1 月的學期結束在同年 1/31');
select is(public.meeting_academic_year('2027-01-04'::date), 115, '1 月仍屬 115 學年度');
select is(public.meeting_term('2027-01-04'::date), 1::smallint, '1 月是上學期');

-- 2/1 是下學期第一天，邊界不可含糊
select is(public.meeting_semester_start('2027-02-01'::date), '2027-02-01'::date, '2/1 是下學期第一天');
select is(public.meeting_semester_end('2027-02-01'::date),   '2027-07-31'::date, '下學期結束在 7/31');
select is(public.meeting_term('2027-01-31'::date), 1::smallint, '1/31 仍是上學期');
select is(public.meeting_term('2027-02-01'::date), 2::smallint, '2/1 起是下學期');

-- 7/31 vs 8/1
select is(public.meeting_semester_end('2026-07-31'::date), '2026-07-31'::date, '7/31 是下學期最後一天');
select is(public.meeting_academic_year('2026-08-01'::date), 115, '8/1 翻到新的學年度');

select * from finish();
rollback;
