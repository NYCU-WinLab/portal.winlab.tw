-- supabase/migrations/2026-05-04-meetings-app.sql
-- meetings app: lab meeting schedule replacing Lab Meetings.xlsx.
-- Two tables: meetings (weekly schedule) and teacher_papers (prof-shared papers).
-- RLS lets presenters edit their own row; portal admins manage everything.

-- =============================================================================
-- Tables
-- =============================================================================

create table public.meetings (
  id                uuid primary key default gen_random_uuid(),
  year              int not null,
  week_label        text,
  scheduled_date    date not null,
  is_holiday        boolean not null default false,
  presenter         text,
  presenter_user_id uuid references public.user_profiles(id) on delete set null,
  ppt_uploaded      boolean not null default false,
  video_uploaded    boolean not null default false,
  paper_title       text,
  paper_link        text,
  notes             text,
  created_at        timestamptz not null default now()
);

create index meetings_year_date on public.meetings (year, scheduled_date);
create index meetings_presenter on public.meetings (presenter_user_id);

create table public.teacher_papers (
  id            uuid primary key default gen_random_uuid(),
  provided_date date not null,
  paper_name    text not null,
  file_link     text,
  source        text,
  created_at    timestamptz not null default now()
);

create index teacher_papers_date on public.teacher_papers (provided_date desc);

-- =============================================================================
-- Admin helper
-- (security definer to avoid recursive RLS on user_profiles)
-- =============================================================================

create or replace function public.is_meetings_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_profiles up
    where up.id = auth.uid()
      and (
        up.is_admin = true
        or (up.roles ? 'meetings' and up.roles -> 'meetings' ? 'admin')
      )
  );
$$;

-- =============================================================================
-- RLS — meetings
-- =============================================================================

alter table public.meetings enable row level security;

create policy "meetings_select"
on public.meetings for select
using (auth.uid() is not null);

-- presenter updates own row (paper info + upload status + notes only;
-- the app only sends those fields — no column-level restriction needed in RLS)
create policy "meetings_update_own"
on public.meetings for update
using (presenter_user_id = auth.uid())
with check (presenter_user_id = auth.uid());

create policy "meetings_update_admin"
on public.meetings for update
using (public.is_meetings_admin())
with check (public.is_meetings_admin());

create policy "meetings_insert"
on public.meetings for insert
with check (public.is_meetings_admin());

create policy "meetings_delete"
on public.meetings for delete
using (public.is_meetings_admin());

-- =============================================================================
-- RLS — teacher_papers
-- =============================================================================

alter table public.teacher_papers enable row level security;

create policy "teacher_papers_select"
on public.teacher_papers for select
using (auth.uid() is not null);

create policy "teacher_papers_insert"
on public.teacher_papers for insert
with check (public.is_meetings_admin());

create policy "teacher_papers_update"
on public.teacher_papers for update
using (public.is_meetings_admin())
with check (public.is_meetings_admin());

create policy "teacher_papers_delete"
on public.teacher_papers for delete
using (public.is_meetings_admin());

-- =============================================================================
-- Seed: 2026 schedule (dates corrected to 2026 — Excel had typos for spring term)
-- presenter_user_id left null; admin assigns users after deploy
-- =============================================================================

insert into public.meetings
  (year, week_label, scheduled_date, is_holiday, presenter, ppt_uploaded, video_uploaded, paper_title, paper_link, notes)
values
  (2026, '寒假', '2026-01-05', false, '永義', true, true,
   'A CI/CD Framework for Zero Downtime Deployment in Wi-Fi Mesh Networks', null, '碩論'),
  (2026, null, '2026-01-12', false, '翊婕', true, true,
   'Intent-Driven Network Management with Multi-Agent LLMs: The Confucius Framework',
   'https://dl.acm.org/doi/10.1145/3718958.3750537', null),
  (2026, null, '2026-01-19', false, '汶儒', false, false, null, null, 'Meeting 時間延至 16.30'),
  (2026, null, '2026-01-26', false, '則禹', false, true,
   'Queuing Network Models of Multiservice RANs',
   'https://dl.acm.org/doi/full/10.1145/3649307', null),
  (2026, null, '2026-02-02', false, '明曦', true, true,
   'Adaptive Schema-aware Event Extraction with Retrieval-Augmented Generation',
   'https://aclanthology.org/2025.findings-emnlp.419/', '會後進行 Winfra 簡報'),
  (2026, null, '2026-02-09', false, '品嘉', false, true,
   'AirXDP: A Flexible and Efficient User-Space Data Plane for WiFi Access Points',
   'https://ieeexplore.ieee.org/document/11080566', null),
  (2026, null,  '2026-02-16', true,  '春節',   false, false, null, null, null),
  (2026, '第1週', '2026-02-23', false, '琮閔', false, true,
   'PDCA: Practical Dynamic Client Association in Wi-Fi Mesh Networks using EasyMesh',
   'https://ieeexplore.ieee.org/document/11161355', null),
  (2026, '第2週',  '2026-03-02', false, '承遠', false, true,
   'Towards an AI/ML-driven SMO Framework in O-RAN: Scenarios, Solutions, and Challenges',
   'https://arxiv.org/abs/2409.05092', null),
  (2026, '第3週',  '2026-03-09', false, '景文', false, true,
   'IMT to Satellite Stochastic Interference Modeling and Coexistence Analysis of Upper 6 GHz Band Service',
   'https://ieeexplore.ieee.org/document/10122608', null),
  (2026, '第4週',  '2026-03-16', false, '詠翔', false, true, null, null, null),
  (2026, '第5週',  '2026-03-23', false, '翰成', false, true, null, null, null),
  (2026, '第6週',  '2026-03-30', false, '胤翔', false, true,
   '5G advanced network supporting LEO satellite with user plane function',
   'https://doi.org/10.23919/JCC.ja.2022-0460', null),
  (2026, '第7週',  '2026-04-06', true,  '清明連假', false, false, null, null, null),
  (2026, '第8週',  '2026-04-13', true,  '月考週',   false, false, null, null, null),
  (2026, '第9週',  '2026-04-20', false, '朝福', false, true,
   'A Network Arena for Benchmarking AI Agents on Network Troubleshooting',
   'https://arxiv.org/abs/2512.16381', null),
  (2026, '第10週', '2026-04-27', false, '睿丞', false, true, 'Harness Engineering', null, null),
  (2026, '第11週', '2026-05-04', false, '洺玄', false, false,
   'MedAgentBench: Benchmarking LLM Agents in Virtual EHR Environments',
   'https://ai.nejm.org/doi/full/10.1056/AIdbp2500144', null),
  (2026, '第12週', '2026-05-11', false, '昱宏', false, false, null, null, null),
  (2026, '第13週', '2026-05-18', false, '岱廷', false, false, null, null, null),
  (2026, '第14週', '2026-05-25', false, '闓鋒', false, false, null, null, null),
  (2026, '第15週', '2026-06-01', false, '翊婕', false, false, null, null, null),
  (2026, '第16週', '2026-06-08', true,  '月考週',   false, false, null, null, null),
  (2026, '暑假', '2026-06-15', false, '詠翔', false, false, null, null, null),
  (2026, null, '2026-06-22', false, '翰成', false, false, null, null, null),
  (2026, null, '2026-06-29', false, '胤翔', false, false, null, null, null),
  (2026, null, '2026-07-06', false, '朝福', false, false, null, null, null),
  (2026, null, '2026-07-13', false, '睿丞', false, false, null, null, null),
  (2026, null, '2026-07-20', false, '洺玄', false, false, null, null, null),
  (2026, null, '2026-07-27', false, '昱宏', false, false, null, null, null),
  (2026, null, '2026-08-03', false, '岱廷', false, false, null, null, null),
  (2026, null, '2026-08-10', false, '闓鋒', false, false, null, null, null),
  (2026, null, '2026-08-17', false, '翊婕', false, false, null, null, null),
  (2026, null, '2026-08-24', true,  null,     false, false, null, null, null),
  (2026, null, '2026-08-31', true,  null,     false, false, null, null, null);
