-- Tagging for the teacher's reading list. Admins curate a small tag catalog
-- (name + colour); each reading-list paper can carry several tags; students
-- filter the papers list by tag to find what they're interested in.
--
--   meeting_tags        — the catalog (admin-managed vocabulary)
--   teacher_paper_tags  — which paper has which tag (many-to-many junction)
--
-- RLS mirrors teacher_papers: any signed-in user reads; only meetings admins
-- write. Tags are assigned when a paper is added, so the junction is
-- admin-write too.

-- ---- catalog --------------------------------------------------------------
create table if not exists public.meeting_tags (
  id uuid default gen_random_uuid() not null,
  name text not null,
  color text,
  created_at timestamp with time zone default now() not null
);
alter table public.meeting_tags
  add constraint meeting_tags_pkey primary key (id);
-- Case-insensitive uniqueness so "LLM" and "llm" can't both exist.
create unique index if not exists meeting_tags_name_lower_key
  on public.meeting_tags (lower(name));

-- ---- junction -------------------------------------------------------------
create table if not exists public.teacher_paper_tags (
  teacher_paper_id uuid not null references public.teacher_papers (id) on delete cascade,
  tag_id uuid not null references public.meeting_tags (id) on delete cascade,
  created_at timestamp with time zone default now() not null
);
alter table public.teacher_paper_tags
  add constraint teacher_paper_tags_pkey primary key (teacher_paper_id, tag_id);
-- Filtering by tag reads the junction from the tag side.
create index if not exists teacher_paper_tags_tag
  on public.teacher_paper_tags (tag_id);

-- ---- RLS ------------------------------------------------------------------
alter table public.meeting_tags enable row level security;
alter table public.teacher_paper_tags enable row level security;

create policy meeting_tags_select on public.meeting_tags for select to public
  using (auth.uid() is not null);
create policy meeting_tags_insert on public.meeting_tags for insert to public
  with check (is_meetings_admin());
create policy meeting_tags_update on public.meeting_tags for update to public
  using (is_meetings_admin()) with check (is_meetings_admin());
create policy meeting_tags_delete on public.meeting_tags for delete to public
  using (is_meetings_admin());

create policy teacher_paper_tags_select on public.teacher_paper_tags for select to public
  using (auth.uid() is not null);
create policy teacher_paper_tags_insert on public.teacher_paper_tags for insert to public
  with check (is_meetings_admin());
create policy teacher_paper_tags_delete on public.teacher_paper_tags for delete to public
  using (is_meetings_admin());

-- ---- grants (RLS is the real gate; mirror teacher_papers) ------------------
grant delete, insert, references, select, trigger, truncate, update
  on public.meeting_tags to anon, authenticated, service_role;
grant delete, insert, references, select, trigger, truncate, update
  on public.teacher_paper_tags to anon, authenticated, service_role;
