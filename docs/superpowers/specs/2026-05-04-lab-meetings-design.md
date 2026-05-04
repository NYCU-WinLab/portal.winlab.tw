# Lab Meetings App — Design Spec

**Date:** 2026-05-04  
**Status:** Approved  
**Scope:** New portal app at `/meetings` — full replacement for the Lab Meetings Excel file

---

## Goal

Replace the `Lab Meetings.xlsx` spreadsheet with a portal-native app. Every lab member can view the meeting schedule and update their own presentation row; only portal admins can add or delete rows.

---

## Route & File Structure

```
apps/portal/app/meetings/
  layout.tsx                 ← Toaster + QueryProvider + PortalShell
  page.tsx                   ← Tab container (default: 排班表)
  _components/
    schedule-tab.tsx         ← Full-year schedule list
    papers-tab.tsx           ← Teacher-provided papers
    info-tab.tsx             ← Static meeting metadata
    meeting-row.tsx          ← Single schedule row with inline edit
    paper-row.tsx            ← Single teacher paper row
    add-meeting-dialog.tsx   ← Admin: add a week entry
    add-paper-dialog.tsx     ← Admin: add a teacher paper

apps/portal/hooks/meetings/
  query-keys.ts
  use-meetings.ts            ← TanStack Query + schedule CRUD
  use-teacher-papers.ts      ← TanStack Query + teacher papers CRUD

apps/portal/lib/meetings/
  types.ts                   ← TypeScript types
```

---

## Tabs

| Tab          | Content                                                                               |
| ------------ | ------------------------------------------------------------------------------------- |
| 排班表       | Year schedule table; current week auto-highlighted; presenter can inline-edit own row |
| 老師 Papers  | Admin can add/delete; everyone can view and open links                                |
| Meeting 資訊 | Static info: location, time, Teams link, NextCloud link, leave system, bento system   |

---

## Database Schema

```sql
-- Meeting schedule
create table meetings (
  id               uuid primary key default gen_random_uuid(),
  year             int not null,
  week_label       text,                              -- '第1週', '寒假', '春節', null
  scheduled_date   date not null,
  presenter        text,                              -- display name; null = holiday/skip
  presenter_user_id uuid references auth.users,       -- null for holiday rows
  ppt_uploaded     boolean not null default false,
  video_uploaded   boolean not null default false,
  paper_title      text,
  paper_link       text,
  notes            text,
  created_at       timestamptz default now()
);

-- Teacher-provided papers
create table teacher_papers (
  id            uuid primary key default gen_random_uuid(),
  provided_date date not null,
  paper_name    text not null,
  file_link     text,
  source        text,                                 -- 'LINE', 'email', etc.
  created_at    timestamptz default now()
);
```

---

## RLS Policy Summary

| Table          | Operation                | Who                              |
| -------------- | ------------------------ | -------------------------------- |
| meetings       | SELECT                   | All authenticated users          |
| meetings       | UPDATE (own row)         | `presenter_user_id = auth.uid()` |
| meetings       | UPDATE (any row)         | Portal admin                     |
| meetings       | INSERT / DELETE          | Portal admin                     |
| teacher_papers | SELECT                   | All authenticated users          |
| teacher_papers | INSERT / DELETE / UPDATE | Portal admin                     |

Portal admin is determined by `user_profiles.roles` (existing pattern from the admin app).

---

## UI Behaviour

### 排班表 Tab

- Full-year list; columns: 週次 | 日期 | 報告人 | PPT ✓ | 錄影 ✓ | Paper 標題 | 論文連結 | 備註
- Current week row is auto-highlighted (nearest upcoming date)
- Holiday / skip rows (`presenter = null`): full row muted, not editable
- **Presenter (own row):** inline edit button visible after login → can edit paper title, paper link, checkboxes, notes; saved via PATCH
- **Admin:** edit + delete icon on every row; "新增週次" button in top-right → `add-meeting-dialog`

### 老師 Papers Tab

- List: 日期 | Paper 名稱 | 來源 | 連結 (opens in new tab)
- **Admin:** "新增" button top-right → `add-paper-dialog`; delete icon on each row

### Meeting 資訊 Tab

Static display cards (hardcoded constants; editing is out of scope):

- 地點：EC 411
- 時間：週一 16:30 – 18:30
- Teams 會議連結
- NextCloud 連結
- 請假系統連結（leave.winlab.tw）
- 便當系統連結（bento.winlab.tw）

---

## Data Seeding

Start from 2026. The 2026 sheet from `Lab Meetings.xlsx` will be manually seeded into `meetings` via a one-time migration SQL or seed script. Historical data (2024–2025) stays in the Excel file.

---

## Out of Scope

- File upload (PPT / video) — upload status is checkbox only; actual files stay on NextCloud
- Historical data import (2024–2025)
- Speaker rotation auto-scheduling (manual for now)
- Notifications / reminders
