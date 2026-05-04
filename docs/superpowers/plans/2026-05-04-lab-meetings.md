# Lab Meetings App — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `/meetings` — a portal-native lab meeting scheduler that replaces the `Lab Meetings.xlsx` spreadsheet, with tab-based UI for schedule, teacher-provided papers, and meeting metadata.

**Architecture:** Three-tab page at `app/meetings/`. Data lives in two Supabase tables (`meetings`, `teacher_papers`). TanStack Query hooks mirror the bento/receipts pattern. RLS lets the presenter edit their own meeting row; admins manage everything. No file uploads — PPT/video status is checkbox only.

**Tech Stack:** Next.js 16 App Router, React 19, TanStack Query, Supabase JS SDK + RLS, shadcn/ui (Tabs, Table, Dialog, Checkbox), Tailwind v4, sonner toasts.

---

## File Map

| Action | Path                                                           |
| ------ | -------------------------------------------------------------- |
| Create | `supabase/migrations/2026-05-04-meetings-app.sql`              |
| Create | `apps/portal/lib/meetings/types.ts`                            |
| Create | `apps/portal/hooks/meetings/query-keys.ts`                     |
| Create | `apps/portal/hooks/meetings/use-meetings-admin.ts`             |
| Create | `apps/portal/hooks/meetings/use-lab-users.ts`                  |
| Create | `apps/portal/hooks/meetings/use-meetings.ts`                   |
| Create | `apps/portal/hooks/meetings/use-teacher-papers.ts`             |
| Create | `apps/portal/app/meetings/_components/query-provider.tsx`      |
| Create | `apps/portal/app/meetings/layout.tsx`                          |
| Create | `apps/portal/app/meetings/_components/info-tab.tsx`            |
| Create | `apps/portal/app/meetings/_components/meeting-edit-dialog.tsx` |
| Create | `apps/portal/app/meetings/_components/add-meeting-dialog.tsx`  |
| Create | `apps/portal/app/meetings/_components/schedule-tab.tsx`        |
| Create | `apps/portal/app/meetings/_components/add-paper-dialog.tsx`    |
| Create | `apps/portal/app/meetings/_components/papers-tab.tsx`          |
| Create | `apps/portal/app/meetings/page.tsx`                            |
| Modify | `apps/portal/app/page.tsx`                                     |

---

## Task 1: Database Migration

**Files:**

- Create: `supabase/migrations/2026-05-04-meetings-app.sql`

- [ ] **Step 1: Create the migration file**

```sql
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
```

- [ ] **Step 2: Apply the migration**

```bash
# From repo root — push to Supabase
bunx supabase db push
```

Expected: migration applies without error. Verify in Supabase Dashboard → Table Editor that `meetings` (35 rows) and `teacher_papers` (0 rows) exist.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/2026-05-04-meetings-app.sql
git commit -m "feat(db): add meetings and teacher_papers tables with RLS"
```

---

## Task 2: TypeScript Types

**Files:**

- Create: `apps/portal/lib/meetings/types.ts`

- [ ] **Step 1: Create types file**

```ts
// apps/portal/lib/meetings/types.ts

export interface Meeting {
  id: string
  year: number
  weekLabel: string | null
  scheduledDate: string // ISO date "YYYY-MM-DD"
  isHoliday: boolean
  presenter: string | null
  presenterUserId: string | null
  pptUploaded: boolean
  videoUploaded: boolean
  paperTitle: string | null
  paperLink: string | null
  notes: string | null
  createdAt: string
}

export interface TeacherPaper {
  id: string
  providedDate: string // ISO date "YYYY-MM-DD"
  paperName: string
  fileLink: string | null
  source: string | null
  createdAt: string
}

// Raw DB row shapes (snake_case from Supabase)
export interface DbMeeting {
  id: string
  year: number
  week_label: string | null
  scheduled_date: string
  is_holiday: boolean
  presenter: string | null
  presenter_user_id: string | null
  ppt_uploaded: boolean
  video_uploaded: boolean
  paper_title: string | null
  paper_link: string | null
  notes: string | null
  created_at: string
}

export interface DbTeacherPaper {
  id: string
  provided_date: string
  paper_name: string
  file_link: string | null
  source: string | null
  created_at: string
}

export function toMeeting(row: DbMeeting): Meeting {
  return {
    id: row.id,
    year: row.year,
    weekLabel: row.week_label,
    scheduledDate: row.scheduled_date,
    isHoliday: row.is_holiday,
    presenter: row.presenter,
    presenterUserId: row.presenter_user_id,
    pptUploaded: row.ppt_uploaded,
    videoUploaded: row.video_uploaded,
    paperTitle: row.paper_title,
    paperLink: row.paper_link,
    notes: row.notes,
    createdAt: row.created_at,
  }
}

export function toTeacherPaper(row: DbTeacherPaper): TeacherPaper {
  return {
    id: row.id,
    providedDate: row.provided_date,
    paperName: row.paper_name,
    fileLink: row.file_link,
    source: row.source,
    createdAt: row.created_at,
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/portal/lib/meetings/types.ts
git commit -m "feat(meetings): add TypeScript types"
```

---

## Task 3: Query Keys

**Files:**

- Create: `apps/portal/hooks/meetings/query-keys.ts`

- [ ] **Step 1: Create query-keys file**

```ts
// apps/portal/hooks/meetings/query-keys.ts

export const queryKeys = {
  meetings: {
    all: ["meetings", "schedule"] as const,
    byYear: (year: number) => ["meetings", "schedule", year] as const,
  },
  teacherPapers: {
    all: ["meetings", "teacher-papers"] as const,
  },
  admin: {
    status: ["meetings", "admin"] as const,
  },
  users: {
    all: ["meetings", "users"] as const,
  },
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/portal/hooks/meetings/query-keys.ts
git commit -m "feat(meetings): add query keys"
```

---

## Task 4: Admin Hook

**Files:**

- Create: `apps/portal/hooks/meetings/use-meetings-admin.ts`

- [ ] **Step 1: Create admin hook**

```ts
// apps/portal/hooks/meetings/use-meetings-admin.ts
"use client"

import { useQuery } from "@tanstack/react-query"

import { useAuth } from "@/hooks/use-auth"
import { createClient } from "@/lib/supabase/client"

import { queryKeys } from "./query-keys"

export function useMeetingsAdmin() {
  const { user } = useAuth()
  const supabase = createClient()

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.admin.status,
    queryFn: async () => {
      if (!user) return null
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("roles, is_admin")
        .eq("id", user.id)
        .single()
      return profile
    },
    enabled: !!user,
  })

  const roles = data?.roles as Record<string, string[]> | undefined
  const isAdmin =
    data?.is_admin === true ||
    (Array.isArray(roles?.meetings) && roles.meetings.includes("admin"))

  return { isAdmin, isLoading }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/portal/hooks/meetings/use-meetings-admin.ts
git commit -m "feat(meetings): add admin hook"
```

---

## Task 5: Lab Users Hook

**Files:**

- Create: `apps/portal/hooks/meetings/use-lab-users.ts`

Used by `add-meeting-dialog` so admin can pick a presenter from the user list.

- [ ] **Step 1: Create hook**

```ts
// apps/portal/hooks/meetings/use-lab-users.ts
"use client"

import { useQuery } from "@tanstack/react-query"

import { createClient } from "@/lib/supabase/client"

import { queryKeys } from "./query-keys"

export function useLabUsers() {
  const supabase = createClient()

  return useQuery({
    queryKey: queryKeys.users.all,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_profiles")
        .select("id, name")
        .order("name")
      if (error) throw error
      return data as { id: string; name: string | null }[]
    },
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/portal/hooks/meetings/use-lab-users.ts
git commit -m "feat(meetings): add lab users hook"
```

---

## Task 6: Meetings Hook

**Files:**

- Create: `apps/portal/hooks/meetings/use-meetings.ts`

- [ ] **Step 1: Create hook**

```ts
// apps/portal/hooks/meetings/use-meetings.ts
"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { createClient } from "@/lib/supabase/client"
import { toMeeting, type DbMeeting, type Meeting } from "@/lib/meetings/types"

import { queryKeys } from "./query-keys"

const TABLE = "meetings"

export function useMeetings(year: number) {
  const supabase = createClient()

  return useQuery({
    queryKey: queryKeys.meetings.byYear(year),
    queryFn: async (): Promise<Meeting[]> => {
      const { data, error } = await supabase
        .from(TABLE)
        .select("*")
        .eq("year", year)
        .order("scheduled_date", { ascending: true })
      if (error) throw new Error(error.message || "讀取排班失敗")
      return (data as DbMeeting[]).map(toMeeting)
    },
  })
}

// Presenter updates their own row (paper info + checkboxes + notes)
export function useUpdateOwnMeeting() {
  const supabase = createClient()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      paperTitle,
      paperLink,
      pptUploaded,
      videoUploaded,
      notes,
    }: {
      id: string
      paperTitle: string | null
      paperLink: string | null
      pptUploaded: boolean
      videoUploaded: boolean
      notes: string | null
    }) => {
      const { error } = await supabase
        .from(TABLE)
        .update({
          paper_title: paperTitle,
          paper_link: paperLink,
          ppt_uploaded: pptUploaded,
          video_uploaded: videoUploaded,
          notes,
        })
        .eq("id", id)
      if (error) throw new Error(error.message || "更新失敗")
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.meetings.all })
      toast.success("已儲存")
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

// Admin: full update (including date, presenter, week_label)
export function useAdminUpdateMeeting() {
  const supabase = createClient()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      weekLabel,
      scheduledDate,
      isHoliday,
      presenter,
      presenterUserId,
      paperTitle,
      paperLink,
      pptUploaded,
      videoUploaded,
      notes,
    }: {
      id: string
      weekLabel: string | null
      scheduledDate: string
      isHoliday: boolean
      presenter: string | null
      presenterUserId: string | null
      paperTitle: string | null
      paperLink: string | null
      pptUploaded: boolean
      videoUploaded: boolean
      notes: string | null
    }) => {
      const { error } = await supabase
        .from(TABLE)
        .update({
          week_label: weekLabel,
          scheduled_date: scheduledDate,
          is_holiday: isHoliday,
          presenter,
          presenter_user_id: presenterUserId,
          paper_title: paperTitle,
          paper_link: paperLink,
          ppt_uploaded: pptUploaded,
          video_uploaded: videoUploaded,
          notes,
        })
        .eq("id", id)
      if (error) throw new Error(error.message || "更新失敗")
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.meetings.all })
      toast.success("已儲存")
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

// Admin: add new meeting row
export function useAddMeeting() {
  const supabase = createClient()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (row: {
      year: number
      weekLabel: string | null
      scheduledDate: string
      isHoliday: boolean
      presenter: string | null
      presenterUserId: string | null
    }) => {
      const { error } = await supabase.from(TABLE).insert({
        year: row.year,
        week_label: row.weekLabel,
        scheduled_date: row.scheduledDate,
        is_holiday: row.isHoliday,
        presenter: row.presenter,
        presenter_user_id: row.presenterUserId,
      })
      if (error) throw new Error(error.message || "新增失敗")
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.meetings.all })
      toast.success("週次已新增")
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

// Admin: delete
export function useDeleteMeeting() {
  const supabase = createClient()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from(TABLE).delete().eq("id", id)
      if (error) throw new Error(error.message || "刪除失敗")
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.meetings.all })
      toast.success("已刪除")
    },
    onError: (e: Error) => toast.error(e.message),
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/portal/hooks/meetings/use-meetings.ts
git commit -m "feat(meetings): add meetings hook (list + CRUD)"
```

---

## Task 7: Teacher Papers Hook

**Files:**

- Create: `apps/portal/hooks/meetings/use-teacher-papers.ts`

- [ ] **Step 1: Create hook**

```ts
// apps/portal/hooks/meetings/use-teacher-papers.ts
"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { createClient } from "@/lib/supabase/client"
import {
  toTeacherPaper,
  type DbTeacherPaper,
  type TeacherPaper,
} from "@/lib/meetings/types"

import { queryKeys } from "./query-keys"

const TABLE = "teacher_papers"

export function useTeacherPapers() {
  const supabase = createClient()

  return useQuery({
    queryKey: queryKeys.teacherPapers.all,
    queryFn: async (): Promise<TeacherPaper[]> => {
      const { data, error } = await supabase
        .from(TABLE)
        .select("*")
        .order("provided_date", { ascending: false })
      if (error) throw new Error(error.message || "讀取 papers 失敗")
      return (data as DbTeacherPaper[]).map(toTeacherPaper)
    },
  })
}

export function useAddTeacherPaper() {
  const supabase = createClient()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (paper: {
      providedDate: string
      paperName: string
      fileLink: string | null
      source: string | null
    }) => {
      const { error } = await supabase.from(TABLE).insert({
        provided_date: paper.providedDate,
        paper_name: paper.paperName,
        file_link: paper.fileLink,
        source: paper.source,
      })
      if (error) throw new Error(error.message || "新增失敗")
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.teacherPapers.all })
      toast.success("Paper 已新增")
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useDeleteTeacherPaper() {
  const supabase = createClient()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from(TABLE).delete().eq("id", id)
      if (error) throw new Error(error.message || "刪除失敗")
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.teacherPapers.all })
      toast.success("已刪除")
    },
    onError: (e: Error) => toast.error(e.message),
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/portal/hooks/meetings/use-teacher-papers.ts
git commit -m "feat(meetings): add teacher papers hook"
```

---

## Task 8: QueryProvider + Layout

**Files:**

- Create: `apps/portal/app/meetings/_components/query-provider.tsx`
- Create: `apps/portal/app/meetings/layout.tsx`

- [ ] **Step 1: Create QueryProvider (identical to bento)**

```tsx
// apps/portal/app/meetings/_components/query-provider.tsx
"use client"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { useState, type ReactNode } from "react"

export function QueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 1000 * 60,
            refetchOnWindowFocus: false,
          },
        },
      })
  )

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}
```

- [ ] **Step 2: Create layout**

```tsx
// apps/portal/app/meetings/layout.tsx
import type { Metadata } from "next"
import Link from "next/link"

import { Toaster } from "@workspace/ui/components/sonner"

import { PortalShell } from "@/components/portal-shell"

import { QueryProvider } from "./_components/query-provider"

export const metadata: Metadata = {
  title: "Meetings | Portal",
  description: "WinLab weekly meeting schedule.",
}

export default function MeetingsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <QueryProvider>
      <PortalShell
        appName="Meetings"
        appHref="/meetings"
        bottomLeft={
          <Link href="/" className="transition-colors hover:text-foreground">
            Portal
          </Link>
        }
      >
        {children}
      </PortalShell>
      <Toaster />
    </QueryProvider>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/portal/app/meetings/_components/query-provider.tsx \
        apps/portal/app/meetings/layout.tsx
git commit -m "feat(meetings): add layout and query provider"
```

---

## Task 9: Info Tab

**Files:**

- Create: `apps/portal/app/meetings/_components/info-tab.tsx`

Static cards — no data fetching.

- [ ] **Step 1: Create component**

```tsx
// apps/portal/app/meetings/_components/info-tab.tsx
import Link from "next/link"

import { Card, CardContent } from "@workspace/ui/components/card"

const INFO = [
  { label: "地點", value: "EC 411" },
  { label: "時間", value: "週一 16:30 – 18:30" },
  {
    label: "Teams 會議",
    value: "加入 Teams",
    href: "https://teams.microsoft.com/l/meetup-join/19%3a0eE-F8b_ZBT4pEFklcMFAb-FXifnhr8CwNbE9DqvoG41%40thread.tacv2/1756957803239?context=%7b%22Tid%22%3a%2280a9abdb-7cef-443c-b040-3f8e75e9232e%22%2c%22Oid%22%3a%224e8f59ac-4563-478f-8c6f-37aadcb5f927%22%7d",
  },
  {
    label: "NextCloud",
    value: "開啟 NextCloud",
    href: "https://nextcloud.winfra.cs.nycu.edu.tw/apps/files/files?dir=/winlab/meeting/2026",
  },
  {
    label: "請假系統",
    value: "leave.winlab.tw",
    href: "https://leave.winlab.tw",
  },
  {
    label: "便當系統",
    value: "bento.winlab.tw",
    href: "https://bento.winlab.tw",
  },
]

export function InfoTab() {
  return (
    <div className="flex flex-col gap-3">
      {INFO.map((item) => (
        <Card key={item.label}>
          <CardContent className="flex items-center justify-between py-4">
            <span className="text-sm text-muted-foreground">{item.label}</span>
            {item.href ? (
              <Link
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm transition-colors hover:text-foreground"
              >
                {item.value}
              </Link>
            ) : (
              <span className="text-sm font-medium">{item.value}</span>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/portal/app/meetings/_components/info-tab.tsx
git commit -m "feat(meetings): add info tab (static meeting metadata)"
```

---

## Task 10: Meeting Edit Dialog

A single dialog used by both the presenter (editing own row) and admin (editing any row). `isAdmin` controls which fields are editable.

**Files:**

- Create: `apps/portal/app/meetings/_components/meeting-edit-dialog.tsx`

- [ ] **Step 1: Create component**

```tsx
// apps/portal/app/meetings/_components/meeting-edit-dialog.tsx
"use client"

import { useEffect, useState } from "react"

import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"

import {
  useAdminUpdateMeeting,
  useUpdateOwnMeeting,
} from "@/hooks/meetings/use-meetings"
import { useLabUsers } from "@/hooks/meetings/use-lab-users"
import type { Meeting } from "@/lib/meetings/types"

interface Props {
  meeting: Meeting
  isAdmin: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function MeetingEditDialog({
  meeting,
  isAdmin,
  open,
  onOpenChange,
}: Props) {
  const { data: users = [] } = useLabUsers()
  const updateOwn = useUpdateOwnMeeting()
  const updateAdmin = useAdminUpdateMeeting()

  const [weekLabel, setWeekLabel] = useState(meeting.weekLabel ?? "")
  const [date, setDate] = useState(meeting.scheduledDate)
  const [isHoliday, setIsHoliday] = useState(meeting.isHoliday)
  const [presenterUserId, setPresenterUserId] = useState(
    meeting.presenterUserId ?? "__none__"
  )
  const [paperTitle, setPaperTitle] = useState(meeting.paperTitle ?? "")
  const [paperLink, setPaperLink] = useState(meeting.paperLink ?? "")
  const [ppt, setPpt] = useState(meeting.pptUploaded)
  const [video, setVideo] = useState(meeting.videoUploaded)
  const [notes, setNotes] = useState(meeting.notes ?? "")

  useEffect(() => {
    if (open) {
      setWeekLabel(meeting.weekLabel ?? "")
      setDate(meeting.scheduledDate)
      setIsHoliday(meeting.isHoliday)
      setPresenterUserId(meeting.presenterUserId ?? "__none__")
      setPaperTitle(meeting.paperTitle ?? "")
      setPaperLink(meeting.paperLink ?? "")
      setPpt(meeting.pptUploaded)
      setVideo(meeting.videoUploaded)
      setNotes(meeting.notes ?? "")
    }
  }, [open, meeting])

  function handleSave() {
    if (isAdmin) {
      const selectedUser =
        presenterUserId === "__none__"
          ? null
          : users.find((u) => u.id === presenterUserId)
      updateAdmin.mutate(
        {
          id: meeting.id,
          weekLabel: weekLabel || null,
          scheduledDate: date,
          isHoliday,
          presenter: selectedUser?.name ?? null,
          presenterUserId:
            presenterUserId === "__none__" ? null : presenterUserId,
          paperTitle: paperTitle || null,
          paperLink: paperLink || null,
          pptUploaded: ppt,
          videoUploaded: video,
          notes: notes || null,
        },
        { onSuccess: () => onOpenChange(false) }
      )
    } else {
      updateOwn.mutate(
        {
          id: meeting.id,
          paperTitle: paperTitle || null,
          paperLink: paperLink || null,
          pptUploaded: ppt,
          videoUploaded: video,
          notes: notes || null,
        },
        { onSuccess: () => onOpenChange(false) }
      )
    }
  }

  const isPending = updateOwn.isPending || updateAdmin.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isAdmin ? "編輯週次" : "更新報告資訊"}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {isAdmin && (
            <>
              <div className="flex flex-col gap-1.5">
                <Label>週次標籤</Label>
                <Input
                  value={weekLabel}
                  onChange={(e) => setWeekLabel(e.target.value)}
                  placeholder="第1週 / 寒假 / 春節"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>日期</Label>
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={isHoliday}
                  onCheckedChange={(v) => setIsHoliday(!!v)}
                />
                假日 / 暫停（不需要報告人）
              </label>
              {!isHoliday && (
                <div className="flex flex-col gap-1.5">
                  <Label>報告人</Label>
                  <Select
                    value={presenterUserId}
                    onValueChange={setPresenterUserId}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="選擇報告人" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">（未指定）</SelectItem>
                      {users.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.name ?? u.id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </>
          )}

          <div className="flex flex-col gap-1.5">
            <Label>Paper 標題</Label>
            <Input
              value={paperTitle}
              onChange={(e) => setPaperTitle(e.target.value)}
              placeholder="論文名稱"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>論文連結</Label>
            <Input
              value={paperLink}
              onChange={(e) => setPaperLink(e.target.value)}
              placeholder="https://..."
            />
          </div>
          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={ppt} onCheckedChange={(v) => setPpt(!!v)} />
              PPT 已上傳
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={video}
                onCheckedChange={(v) => setVideo(!!v)}
              />
              錄影已上傳
            </label>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>備註</Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="備註"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            取消
          </Button>
          <Button onClick={handleSave} disabled={isPending}>
            {isPending ? "儲存中…" : "儲存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/portal/app/meetings/_components/meeting-edit-dialog.tsx
git commit -m "feat(meetings): add meeting edit dialog"
```

---

## Task 11: Add Meeting Dialog

**Files:**

- Create: `apps/portal/app/meetings/_components/add-meeting-dialog.tsx`

Admin-only dialog to create a new meeting row.

- [ ] **Step 1: Create component**

```tsx
// apps/portal/app/meetings/_components/add-meeting-dialog.tsx
"use client"

import { useState } from "react"

import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"

import { useAddMeeting } from "@/hooks/meetings/use-meetings"
import { useLabUsers } from "@/hooks/meetings/use-lab-users"

interface Props {
  year: number
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AddMeetingDialog({ year, open, onOpenChange }: Props) {
  const { data: users = [] } = useLabUsers()
  const addMeeting = useAddMeeting()

  const [weekLabel, setWeekLabel] = useState("")
  const [date, setDate] = useState("")
  const [isHoliday, setIsHoliday] = useState(false)
  const [presenterUserId, setPresenterUserId] = useState("__none__")

  function handleAdd() {
    if (!date) return
    const selectedUser =
      isHoliday || presenterUserId === "__none__"
        ? null
        : users.find((u) => u.id === presenterUserId)

    addMeeting.mutate(
      {
        year,
        weekLabel: weekLabel || null,
        scheduledDate: date,
        isHoliday,
        presenter: selectedUser?.name ?? null,
        presenterUserId: isHoliday
          ? null
          : presenterUserId === "__none__"
            ? null
            : presenterUserId,
      },
      {
        onSuccess: () => {
          setWeekLabel("")
          setDate("")
          setIsHoliday(false)
          setPresenterUserId("__none__")
          onOpenChange(false)
        },
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>新增週次</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>週次標籤（選填）</Label>
            <Input
              value={weekLabel}
              onChange={(e) => setWeekLabel(e.target.value)}
              placeholder="第1週 / 寒假 / 春節"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>日期</Label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={isHoliday}
              onCheckedChange={(v) => setIsHoliday(!!v)}
            />
            假日 / 暫停（不需要報告人）
          </label>
          {!isHoliday && (
            <div className="flex flex-col gap-1.5">
              <Label>報告人</Label>
              <Select
                value={presenterUserId}
                onValueChange={setPresenterUserId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="選擇報告人" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">（未指定）</SelectItem>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name ?? u.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={addMeeting.isPending}
          >
            取消
          </Button>
          <Button onClick={handleAdd} disabled={!date || addMeeting.isPending}>
            {addMeeting.isPending ? "新增中…" : "新增"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/portal/app/meetings/_components/add-meeting-dialog.tsx
git commit -m "feat(meetings): add meeting creation dialog"
```

---

## Task 12: Schedule Tab

**Files:**

- Create: `apps/portal/app/meetings/_components/schedule-tab.tsx`

- [ ] **Step 1: Create component**

```tsx
// apps/portal/app/meetings/_components/schedule-tab.tsx
"use client"

import { useState } from "react"

import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

import { useAuth } from "@/hooks/use-auth"
import { useMeetings, useDeleteMeeting } from "@/hooks/meetings/use-meetings"
import { useMeetingsAdmin } from "@/hooks/meetings/use-meetings-admin"
import type { Meeting } from "@/lib/meetings/types"

import { AddMeetingDialog } from "./add-meeting-dialog"
import { MeetingEditDialog } from "./meeting-edit-dialog"

function getCurrentWeekId(meetings: Meeting[]): string | null {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const upcoming = meetings.filter((m) => {
    const d = new Date(m.scheduledDate)
    return d >= today && !m.isHoliday
  })
  return upcoming.length > 0 ? upcoming[0].id : null
}

export function ScheduleTab({ year }: { year: number }) {
  const { user } = useAuth()
  const { isAdmin } = useMeetingsAdmin()
  const { data: meetings = [], isLoading } = useMeetings(year)
  const deleteMeeting = useDeleteMeeting()

  const [addOpen, setAddOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Meeting | null>(null)

  const currentWeekId = getCurrentWeekId(meetings)

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">載入中…</p>
  }

  return (
    <div className="flex flex-col gap-4">
      {isAdmin && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setAddOpen(true)}>
            新增週次
          </Button>
        </div>
      )}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-20">週次</TableHead>
              <TableHead className="w-24">日期</TableHead>
              <TableHead>報告人</TableHead>
              <TableHead className="w-10 text-center">PPT</TableHead>
              <TableHead className="w-10 text-center">錄影</TableHead>
              <TableHead>Paper</TableHead>
              <TableHead className="hidden md:table-cell">備註</TableHead>
              <TableHead className="w-16" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {meetings.map((m) => {
              const isOwn = user?.id === m.presenterUserId
              const isCurrent = m.id === currentWeekId

              return (
                <TableRow
                  key={m.id}
                  className={
                    m.isHoliday
                      ? "opacity-40"
                      : isCurrent
                        ? "bg-muted/60"
                        : isOwn
                          ? "bg-primary/5"
                          : undefined
                  }
                >
                  <TableCell className="text-xs text-muted-foreground">
                    {m.weekLabel ?? "—"}
                  </TableCell>
                  <TableCell className="text-xs">
                    {new Date(m.scheduledDate).toLocaleDateString("zh-TW", {
                      month: "numeric",
                      day: "numeric",
                    })}
                  </TableCell>
                  <TableCell className="font-medium">
                    {m.presenter ?? "—"}
                  </TableCell>
                  <TableCell className="text-center">
                    <Checkbox checked={m.pptUploaded} disabled />
                  </TableCell>
                  <TableCell className="text-center">
                    <Checkbox checked={m.videoUploaded} disabled />
                  </TableCell>
                  <TableCell className="max-w-xs">
                    {m.paperLink ? (
                      <a
                        href={m.paperLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="line-clamp-2 text-xs hover:underline"
                      >
                        {m.paperTitle ?? m.paperLink}
                      </a>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {m.paperTitle ?? "—"}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="hidden text-xs text-muted-foreground md:table-cell">
                    {m.notes ?? ""}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {(isAdmin || isOwn) && !m.isHoliday && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs"
                          onClick={() => setEditTarget(m)}
                        >
                          編輯
                        </Button>
                      )}
                      {isAdmin && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                          onClick={() => deleteMeeting.mutate(m.id)}
                        >
                          刪除
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      {isAdmin && (
        <AddMeetingDialog
          year={year}
          open={addOpen}
          onOpenChange={setAddOpen}
        />
      )}

      {editTarget && (
        <MeetingEditDialog
          meeting={editTarget}
          isAdmin={isAdmin}
          open={!!editTarget}
          onOpenChange={(open) => {
            if (!open) setEditTarget(null)
          }}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/portal/app/meetings/_components/schedule-tab.tsx
git commit -m "feat(meetings): add schedule tab with inline edit and admin controls"
```

---

## Task 13: Add Paper Dialog + Papers Tab

**Files:**

- Create: `apps/portal/app/meetings/_components/add-paper-dialog.tsx`
- Create: `apps/portal/app/meetings/_components/papers-tab.tsx`

- [ ] **Step 1: Create add paper dialog**

```tsx
// apps/portal/app/meetings/_components/add-paper-dialog.tsx
"use client"

import { useState } from "react"

import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"

import { useAddTeacherPaper } from "@/hooks/meetings/use-teacher-papers"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AddPaperDialog({ open, onOpenChange }: Props) {
  const addPaper = useAddTeacherPaper()

  const [date, setDate] = useState("")
  const [name, setName] = useState("")
  const [link, setLink] = useState("")
  const [source, setSource] = useState("")

  function handleAdd() {
    if (!date || !name) return
    addPaper.mutate(
      {
        providedDate: date,
        paperName: name,
        fileLink: link || null,
        source: source || null,
      },
      {
        onSuccess: () => {
          setDate("")
          setName("")
          setLink("")
          setSource("")
          onOpenChange(false)
        },
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>新增老師提供 Paper</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>日期</Label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Paper 名稱</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="論文全名"
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>連結（選填）</Label>
            <Input
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://..."
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>來源（選填）</Label>
            <Input
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="LINE / email"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={addPaper.isPending}
          >
            取消
          </Button>
          <Button
            onClick={handleAdd}
            disabled={!date || !name || addPaper.isPending}
          >
            {addPaper.isPending ? "新增中…" : "新增"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Create papers tab**

```tsx
// apps/portal/app/meetings/_components/papers-tab.tsx
"use client"

import { useState } from "react"

import { Button } from "@workspace/ui/components/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

import {
  useTeacherPapers,
  useDeleteTeacherPaper,
} from "@/hooks/meetings/use-teacher-papers"
import { useMeetingsAdmin } from "@/hooks/meetings/use-meetings-admin"

import { AddPaperDialog } from "./add-paper-dialog"

export function PapersTab() {
  const { isAdmin } = useMeetingsAdmin()
  const { data: papers = [], isLoading } = useTeacherPapers()
  const deletePaper = useDeleteTeacherPaper()
  const [addOpen, setAddOpen] = useState(false)

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">載入中…</p>
  }

  return (
    <div className="flex flex-col gap-4">
      {isAdmin && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setAddOpen(true)}>
            新增
          </Button>
        </div>
      )}

      {papers.length === 0 ? (
        <p className="text-sm text-muted-foreground">尚無老師提供的 papers。</p>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">日期</TableHead>
                <TableHead>Paper 名稱</TableHead>
                <TableHead className="w-20">來源</TableHead>
                <TableHead className="w-16" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {papers.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(p.providedDate).toLocaleDateString("zh-TW", {
                      year: "numeric",
                      month: "numeric",
                      day: "numeric",
                    })}
                  </TableCell>
                  <TableCell>
                    {p.fileLink ? (
                      <a
                        href={p.fileLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm hover:underline"
                      >
                        {p.paperName}
                      </a>
                    ) : (
                      <span className="text-sm">{p.paperName}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {p.source ?? "—"}
                  </TableCell>
                  <TableCell>
                    {isAdmin && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                        onClick={() => deletePaper.mutate(p.id)}
                      >
                        刪除
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {isAdmin && <AddPaperDialog open={addOpen} onOpenChange={setAddOpen} />}
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/portal/app/meetings/_components/add-paper-dialog.tsx \
        apps/portal/app/meetings/_components/papers-tab.tsx
git commit -m "feat(meetings): add teacher papers tab and dialog"
```

---

## Task 14: Page (Tab Container)

**Files:**

- Create: `apps/portal/app/meetings/page.tsx`

- [ ] **Step 1: Create page**

```tsx
// apps/portal/app/meetings/page.tsx
"use client"

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs"

import { InfoTab } from "./_components/info-tab"
import { PapersTab } from "./_components/papers-tab"
import { ScheduleTab } from "./_components/schedule-tab"

const CURRENT_YEAR = new Date().getFullYear()

export default function MeetingsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-medium">Lab Meetings</h1>
        <p className="text-sm text-muted-foreground">
          WinLab 每週報告排班 — {CURRENT_YEAR}
        </p>
      </div>

      <Tabs defaultValue="schedule">
        <TabsList>
          <TabsTrigger value="schedule">排班表</TabsTrigger>
          <TabsTrigger value="papers">老師 Papers</TabsTrigger>
          <TabsTrigger value="info">Meeting 資訊</TabsTrigger>
        </TabsList>
        <TabsContent value="schedule" className="mt-4">
          <ScheduleTab year={CURRENT_YEAR} />
        </TabsContent>
        <TabsContent value="papers" className="mt-4">
          <PapersTab />
        </TabsContent>
        <TabsContent value="info" className="mt-4">
          <InfoTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/portal/app/meetings/page.tsx
git commit -m "feat(meetings): add meetings page with three-tab layout"
```

---

## Task 15: Portal Home Update

**Files:**

- Modify: `apps/portal/app/page.tsx`

- [ ] **Step 1: Add meetings to the app list**

In `apps/portal/app/page.tsx`, find the `apps` array and add the meetings entry:

```ts
// After the leave entry, add:
{ href: "/meetings", label: "Meetings", note: "組會排班" },
```

The full updated array should be:

```ts
const apps = [
  { href: "/bento", label: "Bento", note: "便當訂購" },
  { href: "/leave", label: "Leave", note: "請假登記" },
  { href: "/meetings", label: "Meetings", note: "組會排班" },
  { href: "/approve", label: "Approve", note: "文件簽核" },
  { href: "/trip", label: "Trip", note: "出差文件" },
  { href: "/debt", label: "Debt", note: "分帳記帳" },
  { href: "/reimburse", label: "Reimburse", note: "收支記帳" },
  { href: "/profile", label: "Profile", note: "個人帳號" },
  { href: "https://gallery.winlab.tw", label: "Gallery", note: "藝術畫廊" },
]
```

- [ ] **Step 2: Commit**

```bash
git add apps/portal/app/page.tsx
git commit -m "feat(portal): add meetings link to portal home"
```

---

## Task 16: Verify & Final Commit

- [ ] **Step 1: Run type check**

```bash
turbo run typecheck --filter=portal
```

Expected: no TypeScript errors.

- [ ] **Step 2: Run dev server and manually verify**

```bash
bun run dev --filter=portal
```

Open `http://localhost:3000/meetings`. Check:

1. 排班表 tab loads with 2026 data; current week row is highlighted
2. 老師 Papers tab shows empty state or any seeded rows
3. Meeting 資訊 tab shows all six info cards with correct links
4. Log in as a user whose row is in the schedule → "編輯" button appears on their row, dialog opens, saves correctly
5. Log in as portal admin → all rows have 編輯 + 刪除; "新增週次" button works; "新增" in papers tab works
6. `http://localhost:3000` shows "Meetings — 組會排班" in the app list

- [ ] **Step 3: Create GitHub issue + PR**

```bash
# Create issue
gh issue create \
  --title "feat(meetings): lab meeting scheduler app" \
  --body "Replaces Lab Meetings.xlsx with a portal-native tab-based app at /meetings. Three tabs: 排班表, 老師 Papers, Meeting 資訊. RLS: presenters edit own row, admins manage everything."

# Push and create PR
git push -u origin feat/lab-meetings
gh pr create \
  --title "feat(meetings): lab meeting scheduler app" \
  --body "$(cat <<'EOF'
## Summary
- New app at `/meetings` replacing `Lab Meetings.xlsx`
- Three tabs: 排班表 (full 2026 schedule), 老師 Papers, Meeting 資訊
- Presenters can edit their own row (paper title, link, upload checkboxes, notes)
- Portal admins can add/edit/delete any row and manage teacher papers
- Supabase migration with RLS + 2026 seed data included

## Test plan
- [ ] Open /meetings — 排班表 loads with 35 seeded rows
- [ ] Current week row is highlighted with muted background
- [ ] Non-admin user sees their own row with 編輯 button
- [ ] Non-admin user cannot edit other rows
- [ ] Admin user sees 編輯 + 刪除 on all rows, 新增週次 works
- [ ] 老師 Papers tab: admin can add and delete
- [ ] Meeting 資訊 tab: all 6 cards display correct info and links open
- [ ] Portal home shows Meetings entry
EOF
)"
```
