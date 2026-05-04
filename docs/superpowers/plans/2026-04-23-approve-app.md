# Approve App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `/approve` — a document approval workflow app inside the portal, covering PDF upload + field placement + signer assignment + multi-signer signing with persistent pre-filled values.

**Architecture:** New business app at `apps/portal/app/approve/` following the bento convention. Supabase tables `approve_*` with RLS as primary authorization layer. Server Actions for mutations, Server Components for reads. TanStack Query only inside `/approve` (like bento). Field coordinates stored as normalized 0..1 floats.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind v4, shadcn/ui, Supabase (@supabase/ssr + @supabase/supabase-js), TanStack Query v5, react-pdf (PDF render), @dnd-kit/core (drag/resize), react-signature-canvas (signature pad).

**Verification model:** Repo has no test runner (CLAUDE.md: "無 test runner，別亂裝"). Each task replaces TDD steps with three checks:

- `bun run typecheck` — TypeScript must pass
- `bun run lint` — ESLint must pass
- **Manual browser smoke test** — open the feature in `bun run dev` and confirm behaviour

**Branch:** `feat/approve-app` (already checked out; spec committed at `47735f9`).

**Supabase project id:** `yissfqcdmzsxwfnzrflz` (winlab).

**Spec reference:** `docs/superpowers/specs/2026-04-23-approve-design.md` — read before starting.

---

## File Structure

**Created under `apps/portal/`:**

```
app/approve/
├─ layout.tsx                               # QueryProvider + PortalShell(Approve) + Toaster
├─ page.tsx                                 # /approve dashboard (three tabs)
├─ actions.ts                               # all server actions
├─ new/page.tsx                             # create draft → redirect
├─ new/[id]/page.tsx                        # draft editor
├─ sign/[id]/page.tsx                       # signing view
├─ view/[id]/page.tsx                       # readonly view
└─ _components/
   ├─ query-provider.tsx                    # mirrors bento
   ├─ document-dashboard.tsx                # three-tab client wrapper
   ├─ document-card.tsx                     # dashboard card
   ├─ inbox-tab-badge.tsx                   # badge with pending count
   ├─ document-editor.tsx                   # editor client shell
   ├─ upload-zone.tsx                       # first-time PDF upload
   ├─ title-input.tsx                       # debounced title
   ├─ signer-picker.tsx                     # multi-select with member join
   ├─ field-palette.tsx                     # 6-button sidebar
   ├─ pdf-canvas.tsx                        # react-pdf wrapper + page nav
   ├─ field-overlay.tsx                     # draggable/resizable field boxes
   ├─ signer-badge.tsx                      # per-field signer dot + popover
   ├─ save-indicator.tsx                    # "已儲存 · 剛才"
   ├─ signing-view.tsx                      # signer client shell
   ├─ signature-pad.tsx                     # dialog with draw/upload tabs
   ├─ signing-field.tsx                     # single field in signing mode
   ├─ document-view.tsx                     # readonly shell
   ├─ signer-progress.tsx                   # sidebar avatars + status
   └─ confirm-dialog.tsx                    # copied from bento/_components

hooks/approve/
├─ query-keys.ts                            # ["approve", …] namespace
├─ use-documents.ts                         # inbox / signed / sent lists
├─ use-document.ts                          # single doc + signers + fields
├─ use-fields.ts                            # field CRUD via server actions
├─ use-signers.ts                           # signer add/remove
├─ use-user-values.ts                       # predefined values
├─ use-signature.ts                         # signature-specific helper
└─ use-inbox-count.ts                       # pending count for badge

lib/approve/
├─ types.ts                                 # Document / Signer / Field / UserValue / Category
├─ field-categories.ts                      # 6 category definitions
├─ pdf.ts                                   # react-pdf loader helpers
├─ storage.ts                               # Supabase Storage path helpers
└─ validation.ts                            # shared validators (client + server reuse)
```

**Created at repo root:**

```
supabase/
└─ migrations/
   └─ 2026-04-23-approve-app.sql            # drop legacy + create approve_* + RLS
```

(If `supabase/migrations/` does not yet exist, this plan creates it. Otherwise the file is appended.)

**Modified:**

- `apps/portal/package.json` — add `react-pdf`, `@dnd-kit/core`, `@dnd-kit/utilities`, `react-signature-canvas`, `@types/react-signature-canvas`
- `packages/ui/src/components/` — shadcn adds `command.tsx`, `popover.tsx`, `tabs.tsx`

---

## Phase 1: Foundation

### Task 1: Install new dependencies

**Files:**

- Modify: `apps/portal/package.json` (indirectly, via `bun add`)

- [ ] **Step 1: Add runtime packages inside the portal workspace**

```bash
cd /Users/loki/portal.winlab.tw/apps/portal
bun add react-pdf@^9 @dnd-kit/core@^6 @dnd-kit/utilities@^3 react-signature-canvas@^1
```

> `bun add` from the monorepo root (even with `--filter=portal`) adds to the **root** package.json, not the workspace. `cd` into the workspace is the reliable way.

- [ ] **Step 2: Add types**

```bash
cd /Users/loki/portal.winlab.tw/apps/portal
bun add --dev @types/react-signature-canvas
```

- [ ] **Step 3: Verify installation**

Run: `bun pm ls --filter=portal | grep -E "react-pdf|dnd-kit|signature-canvas"`
Expected: four lines printed, each starting with the package name.

- [ ] **Step 4: Typecheck stays green (baseline)**

Run: `bun run typecheck`
Expected: no errors. If errors appear that reference the new packages, they will be fixed in later tasks where the imports are introduced.

- [ ] **Step 5: Commit**

```bash
git add apps/portal/package.json bun.lock
git commit -m "chore: bring in react-pdf, dnd-kit and signature-canvas for approve app"
```

### Task 2: Add missing shadcn primitives

**Files:**

- Create: `packages/ui/src/components/command.tsx`
- Create: `packages/ui/src/components/popover.tsx`
- Create: `packages/ui/src/components/tabs.tsx`

- [ ] **Step 1: Run shadcn add from repo root**

```bash
cd /Users/loki/portal.winlab.tw
bunx shadcn@latest add command popover tabs -c apps/portal
```

The `-c apps/portal` targets the `apps/portal/components.json` registry config; files actually land in `packages/ui/src/components/` due to alias.

- [ ] **Step 2: Verify files exist**

Run: `ls packages/ui/src/components/ | grep -E "command|popover|tabs"`
Expected:

```
command.tsx
popover.tsx
tabs.tsx
```

- [ ] **Step 3: Typecheck**

Run: `bun run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/components/command.tsx packages/ui/src/components/popover.tsx packages/ui/src/components/tabs.tsx
git commit -m "chore: add command, popover and tabs shadcn primitives"
```

### Task 3: Database migration — drop legacy, create approve\_\* schema

**Files:**

- Create: `supabase/migrations/2026-04-23-approve-app.sql`

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/2026-04-23-approve-app.sql` with:

```sql
-- Drop legacy tables from the old approve.winlab.tw
drop table if exists public.document_signers cascade;
drop table if exists public.signature_boxes  cascade;
drop table if exists public.user_signatures  cascade;
drop table if exists public.documents        cascade;

-- Documents
create table public.approve_documents (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  file_path     text,
  status        text not null default 'draft'
                  check (status in ('draft','pending','completed','cancelled')),
  created_by    uuid not null references public.user_profiles(id) on delete cascade,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  completed_at  timestamptz
);

-- updated_at trigger
create or replace function public.approve_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger approve_documents_touch
before update on public.approve_documents
for each row execute function public.approve_touch_updated_at();

-- Signers
create table public.approve_signers (
  id            uuid primary key default gen_random_uuid(),
  document_id   uuid not null references public.approve_documents(id) on delete cascade,
  signer_id     uuid not null references public.user_profiles(id) on delete cascade,
  status        text not null default 'pending'
                  check (status in ('pending','signed')),
  signed_at     timestamptz,
  created_at    timestamptz not null default now(),
  unique (document_id, signer_id)
);

-- Fields (placed boxes + eventual values)
create table public.approve_fields (
  id            uuid primary key default gen_random_uuid(),
  document_id   uuid not null references public.approve_documents(id) on delete cascade,
  signer_id     uuid not null references public.user_profiles(id) on delete cascade,
  page          int  not null check (page >= 1),
  x             numeric not null check (x >= 0 and x <= 1),
  y             numeric not null check (y >= 0 and y <= 1),
  width         numeric not null check (width > 0 and width <= 1),
  height        numeric not null check (height > 0 and height <= 1),
  category      text not null
                  check (category in ('signature','contact_address','household_address','id_number','phone','other')),
  label         text,
  value         text,
  signed_at     timestamptz,
  created_at    timestamptz not null default now()
);

-- User pre-filled values (cross-document)
create table public.approve_user_field_values (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.user_profiles(id) on delete cascade,
  category      text not null
                  check (category in ('signature','contact_address','household_address','id_number','phone')),
  value         text not null,
  updated_at    timestamptz not null default now(),
  unique (user_id, category)
);

-- Indexes for hot paths
create index approve_signers_inbox
  on public.approve_signers (signer_id, status)
  where status = 'pending';
create index approve_signers_signed
  on public.approve_signers (signer_id, status, signed_at desc)
  where status = 'signed';
create index approve_documents_created_by
  on public.approve_documents (created_by, created_at desc);
create index approve_fields_document_signer
  on public.approve_fields (document_id, signer_id);

-- Enable RLS
alter table public.approve_documents         enable row level security;
alter table public.approve_signers           enable row level security;
alter table public.approve_fields            enable row level security;
alter table public.approve_user_field_values enable row level security;

-- Policies: approve_documents
create policy "approve_documents_select"
on public.approve_documents for select
using (
  created_by = auth.uid()
  or exists (
    select 1 from public.approve_signers s
    where s.document_id = approve_documents.id and s.signer_id = auth.uid()
  )
);
create policy "approve_documents_insert"
on public.approve_documents for insert
with check (created_by = auth.uid());
create policy "approve_documents_update"
on public.approve_documents for update
using (created_by = auth.uid())
with check (created_by = auth.uid());
create policy "approve_documents_delete"
on public.approve_documents for delete
using (created_by = auth.uid() and status in ('draft','pending'));

-- Policies: approve_signers
create policy "approve_signers_select"
on public.approve_signers for select
using (
  signer_id = auth.uid()
  or exists (
    select 1 from public.approve_documents d
    where d.id = approve_signers.document_id and d.created_by = auth.uid()
  )
);
create policy "approve_signers_insert"
on public.approve_signers for insert
with check (
  exists (
    select 1 from public.approve_documents d
    where d.id = approve_signers.document_id and d.created_by = auth.uid()
  )
);
create policy "approve_signers_update"
on public.approve_signers for update
using (signer_id = auth.uid())
with check (signer_id = auth.uid());
create policy "approve_signers_delete"
on public.approve_signers for delete
using (
  exists (
    select 1 from public.approve_documents d
    where d.id = approve_signers.document_id
      and d.created_by = auth.uid()
      and d.status in ('draft','pending')
  )
);

-- Policies: approve_fields
create policy "approve_fields_select"
on public.approve_fields for select
using (
  signer_id = auth.uid()
  or exists (
    select 1 from public.approve_documents d
    where d.id = approve_fields.document_id and d.created_by = auth.uid()
  )
);
create policy "approve_fields_insert"
on public.approve_fields for insert
with check (
  exists (
    select 1 from public.approve_documents d
    where d.id = approve_fields.document_id
      and d.created_by = auth.uid()
      and d.status = 'draft'
  )
);
create policy "approve_fields_update"
on public.approve_fields for update
using (
  signer_id = auth.uid()
  or exists (
    select 1 from public.approve_documents d
    where d.id = approve_fields.document_id
      and d.created_by = auth.uid()
      and d.status = 'draft'
  )
)
with check (
  signer_id = auth.uid()
  or exists (
    select 1 from public.approve_documents d
    where d.id = approve_fields.document_id
      and d.created_by = auth.uid()
      and d.status = 'draft'
  )
);
create policy "approve_fields_delete"
on public.approve_fields for delete
using (
  exists (
    select 1 from public.approve_documents d
    where d.id = approve_fields.document_id
      and d.created_by = auth.uid()
      and d.status = 'draft'
  )
);

-- Policies: approve_user_field_values
create policy "approve_user_field_values_select"
on public.approve_user_field_values for select
using (user_id = auth.uid());
create policy "approve_user_field_values_insert"
on public.approve_user_field_values for insert
with check (user_id = auth.uid());
create policy "approve_user_field_values_update"
on public.approve_user_field_values for update
using (user_id = auth.uid())
with check (user_id = auth.uid());
create policy "approve_user_field_values_delete"
on public.approve_user_field_values for delete
using (user_id = auth.uid());
```

- [ ] **Step 2: Apply migration via Supabase MCP**

Apply the entire contents of the migration file through `mcp__plugin_supabase_supabase__apply_migration` with:

- `project_id`: `yissfqcdmzsxwfnzrflz`
- `name`: `2026-04-23-approve-app`
- `query`: the full SQL body from Step 1

- [ ] **Step 3: Verify via SQL**

Run via `mcp__plugin_supabase_supabase__execute_sql` against `yissfqcdmzsxwfnzrflz`:

```sql
select tablename from pg_tables where schemaname='public' and tablename like 'approve_%' order by 1;
```

Expected rows:

```
approve_documents
approve_fields
approve_signers
approve_user_field_values
```

And for legacy drop:

```sql
select tablename from pg_tables where schemaname='public' and tablename in ('documents','signature_boxes','document_signers','user_signatures');
```

Expected: zero rows.

- [ ] **Step 4: Advisor check**

Run `mcp__plugin_supabase_supabase__get_advisors` with `project_id=yissfqcdmzsxwfnzrflz`, `type=security`. If any new findings mention `approve_*`, fix before moving on (likely "policy exists but no RLS enabled" — already handled in migration).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/2026-04-23-approve-app.sql
git commit -m "feat: approve schema — drop legacy tables and land approve_* with RLS"
```

### Task 4: Create storage bucket + policies

**Files:**

- None in repo (bucket is created via Supabase dashboard or SQL).

- [ ] **Step 1: Create bucket via SQL**

Run via `execute_sql` against `yissfqcdmzsxwfnzrflz`:

```sql
insert into storage.buckets (id, name, public)
values ('approve-documents', 'approve-documents', false)
on conflict (id) do nothing;
```

- [ ] **Step 2: Create storage RLS policies**

Apply via `apply_migration` (name `2026-04-23-approve-storage-policies`):

```sql
-- Allow the document creator to upload objects under {doc_id}/...
create policy "approve_documents_storage_insert"
on storage.objects for insert
with check (
  bucket_id = 'approve-documents'
  and exists (
    select 1 from public.approve_documents d
    where d.id::text = (storage.foldername(name))[1]
      and d.created_by = auth.uid()
  )
);

-- Allow creator + signers to read
create policy "approve_documents_storage_select"
on storage.objects for select
using (
  bucket_id = 'approve-documents'
  and exists (
    select 1 from public.approve_documents d
    where d.id::text = (storage.foldername(name))[1]
      and (
        d.created_by = auth.uid()
        or exists (
          select 1 from public.approve_signers s
          where s.document_id = d.id and s.signer_id = auth.uid()
        )
      )
  )
);

-- Allow creator to delete (used when re-uploading pdf inside a draft)
create policy "approve_documents_storage_delete"
on storage.objects for delete
using (
  bucket_id = 'approve-documents'
  and exists (
    select 1 from public.approve_documents d
    where d.id::text = (storage.foldername(name))[1]
      and d.created_by = auth.uid()
  )
);
```

- [ ] **Step 3: Verify**

Run via `execute_sql`:

```sql
select id, public from storage.buckets where id='approve-documents';
```

Expected: one row, `public=false`.

```sql
select policyname from pg_policies where schemaname='storage' and tablename='objects' and policyname like 'approve_documents_%';
```

Expected rows (three): `approve_documents_storage_insert`, `approve_documents_storage_select`, `approve_documents_storage_delete`.

- [ ] **Step 4: No commit**

The bucket lives in Supabase cloud — nothing to commit here. Move to next task.

---

## Phase 2: Types and pure lib

### Task 5: `lib/approve/types.ts`

**Files:**

- Create: `apps/portal/lib/approve/types.ts`

- [ ] **Step 1: Write the types file**

```ts
export type DocumentStatus = "draft" | "pending" | "completed" | "cancelled"
export type SignerStatus = "pending" | "signed"

export type FieldCategory =
  | "signature"
  | "contact_address"
  | "household_address"
  | "id_number"
  | "phone"
  | "other"

export type PredefinedCategory = Exclude<FieldCategory, "other">

export type ApproveDocument = {
  id: string
  title: string
  file_path: string | null
  status: DocumentStatus
  created_by: string
  created_at: string
  updated_at: string
  completed_at: string | null
}

export type ApproveSigner = {
  id: string
  document_id: string
  signer_id: string
  status: SignerStatus
  signed_at: string | null
  created_at: string
}

export type ApproveField = {
  id: string
  document_id: string
  signer_id: string
  page: number
  x: number
  y: number
  width: number
  height: number
  category: FieldCategory
  label: string | null
  value: string | null
  signed_at: string | null
  created_at: string
}

export type ApproveUserFieldValue = {
  id: string
  user_id: string
  category: PredefinedCategory
  value: string
  updated_at: string
}

export type SignerProfile = {
  id: string
  name: string
  email: string | null
  avatar_url: string | null
  role: string | null
}
```

- [ ] **Step 2: Typecheck**

Run: `bun run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/portal/lib/approve/types.ts
git commit -m "feat: define approve domain types"
```

### Task 6: `lib/approve/field-categories.ts`

**Files:**

- Create: `apps/portal/lib/approve/field-categories.ts`

- [ ] **Step 1: Write the file**

```ts
import {
  IconHome,
  IconId,
  IconMapPin,
  IconPhone,
  IconSignature,
  IconTextSize,
  type Icon,
} from "@tabler/icons-react"

import type { FieldCategory, PredefinedCategory } from "./types"

export type CategoryDef = {
  id: FieldCategory
  label: string
  icon: Icon
  predefined: boolean
  defaultSize: { width: number; height: number }
}

export const FIELD_CATEGORIES: readonly CategoryDef[] = [
  {
    id: "signature",
    label: "簽名",
    icon: IconSignature,
    predefined: true,
    defaultSize: { width: 0.2, height: 0.08 },
  },
  {
    id: "contact_address",
    label: "聯絡地址",
    icon: IconMapPin,
    predefined: true,
    defaultSize: { width: 0.3, height: 0.05 },
  },
  {
    id: "household_address",
    label: "戶籍地址",
    icon: IconHome,
    predefined: true,
    defaultSize: { width: 0.3, height: 0.05 },
  },
  {
    id: "id_number",
    label: "身分證",
    icon: IconId,
    predefined: true,
    defaultSize: { width: 0.2, height: 0.05 },
  },
  {
    id: "phone",
    label: "手機",
    icon: IconPhone,
    predefined: true,
    defaultSize: { width: 0.2, height: 0.05 },
  },
  {
    id: "other",
    label: "其他",
    icon: IconTextSize,
    predefined: false,
    defaultSize: { width: 0.3, height: 0.05 },
  },
] as const

export function getCategoryDef(id: FieldCategory): CategoryDef {
  const def = FIELD_CATEGORIES.find((c) => c.id === id)
  if (!def) throw new Error(`Unknown field category: ${id}`)
  return def
}

export function isPredefined(id: FieldCategory): id is PredefinedCategory {
  return id !== "other"
}
```

- [ ] **Step 2: Typecheck**

Run: `bun run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/portal/lib/approve/field-categories.ts
git commit -m "feat: define the six field categories approve supports"
```

### Task 7: `lib/approve/storage.ts`

**Files:**

- Create: `apps/portal/lib/approve/storage.ts`

- [ ] **Step 1: Write the helper**

```ts
export const APPROVE_BUCKET = "approve-documents"

export function documentStoragePath(documentId: string): string {
  return `${documentId}/original.pdf`
}
```

- [ ] **Step 2: Typecheck**

Run: `bun run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/portal/lib/approve/storage.ts
git commit -m "feat: centralize approve storage path helper"
```

### Task 8: `lib/approve/pdf.ts` — react-pdf worker config

**Files:**

- Create: `apps/portal/lib/approve/pdf.ts`

- [ ] **Step 1: Write the PDF helper**

```ts
"use client"

import { pdfjs } from "react-pdf"

// Point react-pdf at the worker shipped with pdfjs-dist. Using unpkg keeps the
// worker out of our Next bundle; change to a self-hosted path if offline.
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`

export const PDF_WORKER_VERSION = pdfjs.version
```

- [ ] **Step 2: Typecheck**

Run: `bun run typecheck`
Expected: no errors. If react-pdf types complain, ensure `moduleResolution: "bundler"` is honoured in `tsconfig` (inherited from `@workspace/typescript-config/nextjs.json`).

- [ ] **Step 3: Commit**

```bash
git add apps/portal/lib/approve/pdf.ts
git commit -m "feat: wire react-pdf worker to unpkg mjs build"
```

### Task 9: `lib/approve/validation.ts`

**Files:**

- Create: `apps/portal/lib/approve/validation.ts`

- [ ] **Step 1: Write validators**

```ts
import type { ApproveField, ApproveSigner } from "./types"

export type SubmitValidationInput = {
  title: string
  filePath: string | null
  signers: ApproveSigner[]
  fields: ApproveField[]
}

export type ValidationResult = { ok: true } | { ok: false; reason: string }

export function validateForSubmit(
  input: SubmitValidationInput
): ValidationResult {
  if (!input.title.trim()) return { ok: false, reason: "標題不可空白" }
  if (!input.filePath) return { ok: false, reason: "還沒上傳 PDF" }
  if (input.signers.length === 0)
    return { ok: false, reason: "至少要一位 signer" }

  const signerIds = new Set(input.signers.map((s) => s.signer_id))
  for (const f of input.fields) {
    if (!signerIds.has(f.signer_id)) {
      return { ok: false, reason: "有方塊指派給未登記的 signer" }
    }
  }

  for (const signer of input.signers) {
    const hasField = input.fields.some((f) => f.signer_id === signer.signer_id)
    if (!hasField) {
      return { ok: false, reason: "每位 signer 都至少需要一個方塊" }
    }
  }

  return { ok: true }
}
```

- [ ] **Step 2: Typecheck**

Run: `bun run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/portal/lib/approve/validation.ts
git commit -m "feat: submit-time validator shared between client and server"
```

---

## Phase 3: App shell

### Task 10: Query provider + query keys

**Files:**

- Create: `apps/portal/app/approve/_components/query-provider.tsx`
- Create: `apps/portal/hooks/approve/query-keys.ts`

- [ ] **Step 1: Write the query provider (mirrors bento)**

`apps/portal/app/approve/_components/query-provider.tsx`:

```tsx
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
            refetchOnWindowFocus: true,
          },
        },
      })
  )

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}
```

Note: `refetchOnWindowFocus: true` is intentional for approve (spec §6.1) — we want returning users to see fresh inbox counts.

- [ ] **Step 2: Write query keys**

`apps/portal/hooks/approve/query-keys.ts`:

```ts
export const queryKeys = {
  documents: {
    all: ["approve", "documents"] as const,
    inbox: () => [...queryKeys.documents.all, "inbox"] as const,
    signed: () => [...queryKeys.documents.all, "signed"] as const,
    sent: () => [...queryKeys.documents.all, "sent"] as const,
    detail: (id: string) => [...queryKeys.documents.all, id] as const,
  },
  signers: {
    all: ["approve", "signers"] as const,
    forDocument: (id: string) => [...queryKeys.signers.all, "doc", id] as const,
  },
  fields: {
    all: ["approve", "fields"] as const,
    forDocument: (id: string) => [...queryKeys.fields.all, "doc", id] as const,
  },
  userValues: {
    all: ["approve", "user-values"] as const,
    mine: () => [...queryKeys.userValues.all, "me"] as const,
  },
  inboxCount: ["approve", "inbox-count"] as const,
}
```

- [ ] **Step 3: Typecheck**

Run: `bun run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/portal/app/approve/_components/query-provider.tsx apps/portal/hooks/approve/query-keys.ts
git commit -m "feat: scaffold approve query provider and keys"
```

### Task 11: Layout

**Files:**

- Create: `apps/portal/app/approve/layout.tsx`

- [ ] **Step 1: Write the layout**

```tsx
import type { Metadata } from "next"
import Link from "next/link"

import { Toaster } from "@workspace/ui/components/sonner"

import { PortalShell } from "@/components/portal-shell"

import { QueryProvider } from "./_components/query-provider"

export const metadata: Metadata = {
  title: "Approve | Portal",
  description: "WinLab document approval workflow.",
}

export default function ApproveLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <QueryProvider>
      <PortalShell
        appName="Approve"
        appHref="/approve"
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

- [ ] **Step 2: Create a placeholder page.tsx so the route resolves**

Create `apps/portal/app/approve/page.tsx`:

```tsx
export default function ApprovePage() {
  return (
    <main className="min-h-[60vh] space-y-4">
      <h1 className="text-2xl font-semibold">Approve</h1>
      <p className="text-muted-foreground">dashboard coming in next task.</p>
    </main>
  )
}
```

- [ ] **Step 3: Typecheck + lint**

```bash
bun run typecheck
bun run lint
```

Expected: both pass.

- [ ] **Step 4: Manual browser check**

```bash
bun run dev --filter=portal
```

Open `http://localhost:3000/approve`. Expect to see:

- Top-left corner: `Approve` linking to `/approve`
- Bottom-left corner: `Portal` linking to `/`
- Main area: `Approve` heading with placeholder text

Stop the dev server with Ctrl-C once verified.

- [ ] **Step 5: Commit**

```bash
git add apps/portal/app/approve/layout.tsx apps/portal/app/approve/page.tsx
git commit -m "feat: mount the approve app shell"
```

---

## Phase 4: Server actions

### Task 12: Scaffold `actions.ts` with `createDraft`

**Files:**

- Create: `apps/portal/app/approve/actions.ts`

- [ ] **Step 1: Write the initial actions file**

```ts
"use server"

import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"

import { createClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/user"

async function requireUser() {
  const user = await getCurrentUser()
  if (!user) throw new Error("Unauthenticated")
  return user
}

export async function createDraft(): Promise<never> {
  const user = await requireUser()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("approve_documents")
    .insert({ title: "未命名", created_by: user.id })
    .select("id")
    .single()
  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create draft")
  }
  revalidatePath("/approve")
  redirect(`/approve/new/${data.id}`)
}
```

- [ ] **Step 2: Typecheck**

Run: `bun run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/portal/app/approve/actions.ts
git commit -m "feat: createDraft server action"
```

### Task 13: Add remaining server actions

**Files:**

- Modify: `apps/portal/app/approve/actions.ts`

- [ ] **Step 1: Append the full suite**

Append the following to `actions.ts` (keeping the existing `createDraft` and `requireUser`):

```ts
import type { ApproveField, FieldCategory } from "@/lib/approve/types"
import { validateForSubmit } from "@/lib/approve/validation"
import { APPROVE_BUCKET, documentStoragePath } from "@/lib/approve/storage"
import { isPredefined } from "@/lib/approve/field-categories"

export async function uploadPdf(formData: FormData): Promise<void> {
  const user = await requireUser()
  const documentId = formData.get("documentId")
  const file = formData.get("file")
  if (typeof documentId !== "string" || !(file instanceof File)) {
    throw new Error("bad payload")
  }
  if (file.size > 50 * 1024 * 1024) throw new Error("PDF too large (>50MB)")

  const supabase = await createClient()
  const { data: doc, error: docErr } = await supabase
    .from("approve_documents")
    .select("id,status")
    .eq("id", documentId)
    .eq("created_by", user.id)
    .maybeSingle()
  if (docErr || !doc) throw new Error("document not found")
  if (doc.status !== "draft") throw new Error("only drafts can re-upload")

  const path = documentStoragePath(documentId)
  const { error: upErr } = await supabase.storage
    .from(APPROVE_BUCKET)
    .upload(path, file, { upsert: true, contentType: "application/pdf" })
  if (upErr) throw new Error(upErr.message)

  const { error: updErr } = await supabase
    .from("approve_documents")
    .update({ file_path: path })
    .eq("id", documentId)
    .eq("created_by", user.id)
  if (updErr) throw new Error(updErr.message)

  revalidatePath(`/approve/new/${documentId}`)
}

export async function updateDocumentTitle(
  documentId: string,
  title: string
): Promise<void> {
  const user = await requireUser()
  const supabase = await createClient()
  const { error } = await supabase
    .from("approve_documents")
    .update({ title })
    .eq("id", documentId)
    .eq("created_by", user.id)
    .eq("status", "draft")
  if (error) throw new Error(error.message)
}

export async function setSigners(
  documentId: string,
  signerIds: string[]
): Promise<void> {
  const user = await requireUser()
  const supabase = await createClient()

  const { data: doc } = await supabase
    .from("approve_documents")
    .select("id")
    .eq("id", documentId)
    .eq("created_by", user.id)
    .eq("status", "draft")
    .maybeSingle()
  if (!doc) throw new Error("document not found or not editable")

  const { data: existing } = await supabase
    .from("approve_signers")
    .select("signer_id")
    .eq("document_id", documentId)
  const existingIds = new Set((existing ?? []).map((r) => r.signer_id))
  const desired = new Set(signerIds)

  const toAdd = [...desired].filter((id) => !existingIds.has(id))
  const toRemove = [...existingIds].filter((id) => !desired.has(id))

  if (toRemove.length) {
    await supabase
      .from("approve_signers")
      .delete()
      .eq("document_id", documentId)
      .in("signer_id", toRemove)
    // Fields assigned to removed signers are orphaned until editor resolves;
    // cascade by also deleting their fields to keep validation honest.
    await supabase
      .from("approve_fields")
      .delete()
      .eq("document_id", documentId)
      .in("signer_id", toRemove)
  }
  if (toAdd.length) {
    await supabase.from("approve_signers").insert(
      toAdd.map((signer_id) => ({
        document_id: documentId,
        signer_id,
      }))
    )
  }
  revalidatePath(`/approve/new/${documentId}`)
}

export type UpsertFieldInput = {
  id: string
  documentId: string
  signerId: string
  page: number
  x: number
  y: number
  width: number
  height: number
  category: FieldCategory
  label?: string | null
}

export async function upsertField(input: UpsertFieldInput): Promise<void> {
  const user = await requireUser()
  const supabase = await createClient()
  const { data: doc } = await supabase
    .from("approve_documents")
    .select("id")
    .eq("id", input.documentId)
    .eq("created_by", user.id)
    .eq("status", "draft")
    .maybeSingle()
  if (!doc) throw new Error("document not editable")

  const { error } = await supabase.from("approve_fields").upsert({
    id: input.id,
    document_id: input.documentId,
    signer_id: input.signerId,
    page: input.page,
    x: input.x,
    y: input.y,
    width: input.width,
    height: input.height,
    category: input.category,
    label: input.label ?? null,
  })
  if (error) throw new Error(error.message)
}

export async function deleteField(
  documentId: string,
  fieldId: string
): Promise<void> {
  const user = await requireUser()
  const supabase = await createClient()
  const { data: doc } = await supabase
    .from("approve_documents")
    .select("id")
    .eq("id", documentId)
    .eq("created_by", user.id)
    .eq("status", "draft")
    .maybeSingle()
  if (!doc) throw new Error("document not editable")

  const { error } = await supabase
    .from("approve_fields")
    .delete()
    .eq("id", fieldId)
    .eq("document_id", documentId)
  if (error) throw new Error(error.message)
}

export async function submitDocument(documentId: string): Promise<void> {
  const user = await requireUser()
  const supabase = await createClient()
  const [{ data: doc }, { data: signers }, { data: fields }] =
    await Promise.all([
      supabase
        .from("approve_documents")
        .select("id,title,file_path,status,created_by")
        .eq("id", documentId)
        .eq("created_by", user.id)
        .maybeSingle(),
      supabase
        .from("approve_signers")
        .select("*")
        .eq("document_id", documentId),
      supabase.from("approve_fields").select("*").eq("document_id", documentId),
    ])
  if (!doc) throw new Error("document not found")
  if (doc.status !== "draft") throw new Error("not a draft")

  const v = validateForSubmit({
    title: doc.title,
    filePath: doc.file_path,
    signers: (signers ?? []) as never,
    fields: (fields ?? []) as never,
  })
  if (!v.ok) throw new Error(v.reason)

  const { error } = await supabase
    .from("approve_documents")
    .update({ status: "pending" })
    .eq("id", documentId)
    .eq("created_by", user.id)
    .eq("status", "draft")
  if (error) throw new Error(error.message)

  revalidatePath("/approve")
  revalidatePath(`/approve/new/${documentId}`)
  redirect("/approve")
}

export type SignatureValue = { fieldId: string; value: string }

export async function submitSignature(
  documentId: string,
  values: SignatureValue[]
): Promise<void> {
  const user = await requireUser()
  const supabase = await createClient()

  const { data: my } = await supabase
    .from("approve_signers")
    .select("id,status")
    .eq("document_id", documentId)
    .eq("signer_id", user.id)
    .maybeSingle()
  if (!my) throw new Error("you are not a signer")
  if (my.status === "signed") throw new Error("already signed")

  const { data: myFields } = await supabase
    .from("approve_fields")
    .select("id,category")
    .eq("document_id", documentId)
    .eq("signer_id", user.id)
  if (!myFields || myFields.length === 0) {
    throw new Error("no fields assigned to you")
  }

  const byId = new Map(values.map((v) => [v.fieldId, v.value]))
  for (const f of myFields) {
    const v = byId.get(f.id)
    if (!v || !v.trim()) throw new Error("all fields must be filled")
  }

  const now = new Date().toISOString()
  for (const f of myFields) {
    const v = byId.get(f.id)!
    await supabase
      .from("approve_fields")
      .update({ value: v, signed_at: now })
      .eq("id", f.id)
      .eq("signer_id", user.id)
  }

  // Persist predefined values for future pre-fill
  const upserts = myFields
    .filter((f) => isPredefined(f.category as FieldCategory))
    .map((f) => ({
      user_id: user.id,
      category: f.category,
      value: byId.get(f.id)!,
      updated_at: now,
    }))
  if (upserts.length) {
    await supabase
      .from("approve_user_field_values")
      .upsert(upserts, { onConflict: "user_id,category" })
  }

  await supabase
    .from("approve_signers")
    .update({ status: "signed", signed_at: now })
    .eq("id", my.id)

  const { count } = await supabase
    .from("approve_signers")
    .select("id", { count: "exact", head: true })
    .eq("document_id", documentId)
    .eq("status", "pending")
  if ((count ?? 0) === 0) {
    await supabase
      .from("approve_documents")
      .update({ status: "completed", completed_at: now })
      .eq("id", documentId)
  }

  revalidatePath("/approve")
  redirect("/approve")
}

export async function deleteDocument(documentId: string): Promise<void> {
  const user = await requireUser()
  const supabase = await createClient()
  const { error } = await supabase
    .from("approve_documents")
    .delete()
    .eq("id", documentId)
    .eq("created_by", user.id)
    .in("status", ["draft", "pending", "cancelled"])
  if (error) throw new Error(error.message)
  revalidatePath("/approve")
}
```

Note the silent cascade in `setSigners` — fields assigned to removed signers are also removed so submit validation stays consistent.

- [ ] **Step 2: Typecheck + lint**

```bash
bun run typecheck
bun run lint
```

Expected: both pass. The `as never` casts are intentional — Supabase generated types aren't wired yet; domain types from `lib/approve/types.ts` represent reality.

- [ ] **Step 3: Commit**

```bash
git add apps/portal/app/approve/actions.ts
git commit -m "feat: the rest of the approve server actions"
```

---

## Phase 5: Read-side hooks

### Task 14: `use-documents.ts`

**Files:**

- Create: `apps/portal/hooks/approve/use-documents.ts`

- [ ] **Step 1: Write the hook**

```ts
"use client"

import { useQuery } from "@tanstack/react-query"

import { createClient } from "@/lib/supabase/client"
import type { ApproveDocument, ApproveSigner } from "@/lib/approve/types"

import { queryKeys } from "./query-keys"

type InboxRow = ApproveSigner & {
  document: ApproveDocument & {
    creator: { id: string; name: string | null; email: string | null } | null
  }
}

export function useInboxDocuments(userId: string | null) {
  return useQuery({
    queryKey: queryKeys.documents.inbox(),
    enabled: !!userId,
    queryFn: async (): Promise<InboxRow[]> => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from("approve_signers")
        .select(
          `id, document_id, signer_id, status, signed_at, created_at,
           document:approve_documents(
             id, title, file_path, status, created_by, created_at, updated_at, completed_at,
             creator:user_profiles!created_by(id, name, email)
           )`
        )
        .eq("signer_id", userId!)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
      if (error) throw error
      return (data ?? []) as unknown as InboxRow[]
    },
  })
}

export function useSignedDocuments(userId: string | null) {
  return useQuery({
    queryKey: queryKeys.documents.signed(),
    enabled: !!userId,
    queryFn: async (): Promise<InboxRow[]> => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from("approve_signers")
        .select(
          `id, document_id, signer_id, status, signed_at, created_at,
           document:approve_documents(
             id, title, file_path, status, created_by, created_at, updated_at, completed_at,
             creator:user_profiles!created_by(id, name, email)
           )`
        )
        .eq("signer_id", userId!)
        .eq("status", "signed")
        .order("signed_at", { ascending: false })
      if (error) throw error
      return (data ?? []) as unknown as InboxRow[]
    },
  })
}

export function useSentDocuments(userId: string | null) {
  return useQuery({
    queryKey: queryKeys.documents.sent(),
    enabled: !!userId,
    queryFn: async (): Promise<ApproveDocument[]> => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from("approve_documents")
        .select("*")
        .eq("created_by", userId!)
        .order("updated_at", { ascending: false })
      if (error) throw error
      return (data ?? []) as unknown as ApproveDocument[]
    },
  })
}
```

- [ ] **Step 2: Typecheck + lint**

```bash
bun run typecheck
bun run lint
```

Expected: both pass.

- [ ] **Step 3: Commit**

```bash
git add apps/portal/hooks/approve/use-documents.ts
git commit -m "feat: dashboard list hooks — inbox, signed, sent"
```

### Task 15: `use-document.ts`

**Files:**

- Create: `apps/portal/hooks/approve/use-document.ts`

- [ ] **Step 1: Write the hook**

```ts
"use client"

import { useQuery } from "@tanstack/react-query"

import { createClient } from "@/lib/supabase/client"
import type {
  ApproveDocument,
  ApproveField,
  ApproveSigner,
  SignerProfile,
} from "@/lib/approve/types"

import { queryKeys } from "./query-keys"

export type DocumentBundle = {
  document: ApproveDocument
  signers: (ApproveSigner & { profile: SignerProfile | null })[]
  fields: ApproveField[]
}

export function useDocument(id: string) {
  return useQuery({
    queryKey: queryKeys.documents.detail(id),
    queryFn: async (): Promise<DocumentBundle> => {
      const supabase = createClient()
      const [doc, signers, fields] = await Promise.all([
        supabase.from("approve_documents").select("*").eq("id", id).single(),
        supabase
          .from("approve_signers")
          .select(
            `id, document_id, signer_id, status, signed_at, created_at,
             profile:user_profiles!signer_id(
               id, name, email,
               member:members!inner(avatar_url, role)
             )`
          )
          .eq("document_id", id),
        supabase.from("approve_fields").select("*").eq("document_id", id),
      ])
      if (doc.error) throw doc.error
      if (signers.error) throw signers.error
      if (fields.error) throw fields.error

      return {
        document: doc.data as ApproveDocument,
        signers: (signers.data ?? []).map((row: any) => ({
          ...row,
          profile: row.profile
            ? {
                id: row.profile.id,
                name: row.profile.name ?? row.profile.email ?? "Unknown",
                email: row.profile.email ?? null,
                avatar_url: row.profile.member?.avatar_url ?? null,
                role: row.profile.member?.role ?? null,
              }
            : null,
        })),
        fields: (fields.data ?? []) as ApproveField[],
      }
    },
  })
}
```

Note: the members join is `!inner` — a user_profile without a matching member row will show `profile: null`. Acceptable fallback because `member` is a display-only enrichment. If behaviour doesn't match your labs roster, rework to a left join via a view in a later polish task.

- [ ] **Step 2: Typecheck + lint**

```bash
bun run typecheck
bun run lint
```

Expected: both pass.

- [ ] **Step 3: Commit**

```bash
git add apps/portal/hooks/approve/use-document.ts
git commit -m "feat: per-document fetch with signer profile join"
```

### Task 16: `use-inbox-count.ts`

**Files:**

- Create: `apps/portal/hooks/approve/use-inbox-count.ts`

- [ ] **Step 1: Write the hook**

```ts
"use client"

import { useQuery } from "@tanstack/react-query"

import { createClient } from "@/lib/supabase/client"

import { queryKeys } from "./query-keys"

export function useInboxCount(userId: string | null) {
  return useQuery({
    queryKey: queryKeys.inboxCount,
    enabled: !!userId,
    queryFn: async (): Promise<number> => {
      const supabase = createClient()
      const { count, error } = await supabase
        .from("approve_signers")
        .select("id", { count: "exact", head: true })
        .eq("signer_id", userId!)
        .eq("status", "pending")
      if (error) throw error
      return count ?? 0
    },
  })
}
```

- [ ] **Step 2: Typecheck + lint**

```bash
bun run typecheck
bun run lint
```

Expected: both pass.

- [ ] **Step 3: Commit**

```bash
git add apps/portal/hooks/approve/use-inbox-count.ts
git commit -m "feat: inbox count hook for the 代簽 badge"
```

### Task 17: `use-user-values.ts` + `use-signature.ts`

**Files:**

- Create: `apps/portal/hooks/approve/use-user-values.ts`
- Create: `apps/portal/hooks/approve/use-signature.ts`

- [ ] **Step 1: Write `use-user-values.ts`**

```ts
"use client"

import { useQuery } from "@tanstack/react-query"

import { createClient } from "@/lib/supabase/client"
import type { ApproveUserFieldValue } from "@/lib/approve/types"

import { queryKeys } from "./query-keys"

export function useUserValues(userId: string | null) {
  return useQuery({
    queryKey: queryKeys.userValues.mine(),
    enabled: !!userId,
    queryFn: async (): Promise<ApproveUserFieldValue[]> => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from("approve_user_field_values")
        .select("*")
        .eq("user_id", userId!)
      if (error) throw error
      return (data ?? []) as unknown as ApproveUserFieldValue[]
    },
  })
}
```

- [ ] **Step 2: Write `use-signature.ts`**

```ts
"use client"

import { useUserValues } from "./use-user-values"

export function useSavedSignature(userId: string | null) {
  const q = useUserValues(userId)
  const signature =
    q.data?.find((v) => v.category === "signature")?.value ?? null
  return { ...q, signature }
}
```

- [ ] **Step 3: Typecheck + lint**

```bash
bun run typecheck
bun run lint
```

Expected: both pass.

- [ ] **Step 4: Commit**

```bash
git add apps/portal/hooks/approve/use-user-values.ts apps/portal/hooks/approve/use-signature.ts
git commit -m "feat: read hooks for pre-filled values and saved signature"
```

---

## Phase 6: Dashboard

### Task 18: Document card + dashboard page

**Files:**

- Create: `apps/portal/app/approve/_components/document-card.tsx`
- Create: `apps/portal/app/approve/_components/document-dashboard.tsx`
- Modify: `apps/portal/app/approve/page.tsx`

- [ ] **Step 1: Write `document-card.tsx`**

```tsx
"use client"

import Link from "next/link"

import { Badge } from "@workspace/ui/components/badge"
import { Card } from "@workspace/ui/components/card"
import type { ApproveDocument, DocumentStatus } from "@/lib/approve/types"

const STATUS_LABEL: Record<DocumentStatus, string> = {
  draft: "草稿",
  pending: "送簽中",
  completed: "已完成",
  cancelled: "已取消",
}

export function DocumentCard({
  href,
  title,
  subtitle,
  status,
}: {
  href: string
  title: string
  subtitle: string
  status?: ApproveDocument["status"]
}) {
  return (
    <Link href={href} className="block">
      <Card className="group space-y-1 p-4 transition-colors hover:bg-muted/40">
        <div className="flex items-center justify-between">
          <h3 className="font-medium">{title}</h3>
          {status && <Badge variant="secondary">{STATUS_LABEL[status]}</Badge>}
        </div>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </Card>
    </Link>
  )
}
```

- [ ] **Step 2: Write `document-dashboard.tsx`**

```tsx
"use client"

import { useState } from "react"

import { Button } from "@workspace/ui/components/button"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs"
import { IconPlus } from "@tabler/icons-react"
import Link from "next/link"

import { useAuth } from "@/hooks/use-auth"
import {
  useInboxDocuments,
  useSentDocuments,
  useSignedDocuments,
} from "@/hooks/approve/use-documents"
import { useInboxCount } from "@/hooks/approve/use-inbox-count"

import { DocumentCard } from "./document-card"

export function DocumentDashboard() {
  const { user } = useAuth()
  const userId = user?.id ?? null
  const [tab, setTab] = useState("inbox")

  const inboxCount = useInboxCount(userId)
  const inbox = useInboxDocuments(userId)
  const signed = useSignedDocuments(userId)
  const sent = useSentDocuments(userId)

  return (
    <main className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Approve</h1>
        <Button asChild>
          <Link href="/approve/new">
            <IconPlus className="size-4" />
            送簽
          </Link>
        </Button>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="inbox">
            代簽
            {(inboxCount.data ?? 0) > 0 && (
              <span className="ml-2 rounded bg-primary/20 px-1.5 text-xs tabular-nums">
                {inboxCount.data}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="signed">已簽</TabsTrigger>
          <TabsTrigger value="sent">送簽</TabsTrigger>
        </TabsList>

        <TabsContent value="inbox" className="space-y-2">
          {(inbox.data ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">沒有待簽文件</p>
          )}
          {(inbox.data ?? []).map((row) => (
            <DocumentCard
              key={row.id}
              href={`/approve/sign/${row.document_id}`}
              title={row.document.title}
              subtitle={`送簽：${row.document.creator?.name ?? "?"} · ${row.created_at.slice(0, 10)}`}
            />
          ))}
        </TabsContent>

        <TabsContent value="signed" className="space-y-2">
          {(signed.data ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">還沒簽過任何文件</p>
          )}
          {(signed.data ?? []).map((row) => (
            <DocumentCard
              key={row.id}
              href={`/approve/view/${row.document_id}`}
              title={row.document.title}
              subtitle={`簽於 ${row.signed_at?.slice(0, 10) ?? ""}`}
            />
          ))}
        </TabsContent>

        <TabsContent value="sent" className="space-y-2">
          {(sent.data ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">還沒送過任何文件</p>
          )}
          {(sent.data ?? []).map((doc) => (
            <DocumentCard
              key={doc.id}
              href={
                doc.status === "draft"
                  ? `/approve/new/${doc.id}`
                  : `/approve/view/${doc.id}`
              }
              title={doc.title}
              subtitle={`更新於 ${doc.updated_at.slice(0, 10)}`}
              status={doc.status}
            />
          ))}
        </TabsContent>
      </Tabs>
    </main>
  )
}
```

- [ ] **Step 3: Replace `page.tsx`**

```tsx
import { DocumentDashboard } from "./_components/document-dashboard"

export default function ApprovePage() {
  return <DocumentDashboard />
}
```

- [ ] **Step 4: Typecheck + lint**

```bash
bun run typecheck
bun run lint
```

Expected: both pass.

- [ ] **Step 5: Manual browser check**

`bun run dev --filter=portal`, open `/approve`.

- Three tabs visible. Inbox tab shows count badge if you seed a signer row for yourself (optional).
- Empty states shown for all tabs by default.
- `+ 送簽` button navigates to `/approve/new` (will 404 until next task — acceptable).

- [ ] **Step 6: Commit**

```bash
git add apps/portal/app/approve/_components/document-card.tsx apps/portal/app/approve/_components/document-dashboard.tsx apps/portal/app/approve/page.tsx
git commit -m "feat: three-tab approve dashboard"
```

---

## Phase 7: Editor — shell + upload

### Task 19: `/approve/new` — create draft and redirect

**Files:**

- Create: `apps/portal/app/approve/new/page.tsx`

- [ ] **Step 1: Write the page**

```tsx
import { createDraft } from "../actions"

export default async function NewDraftPage() {
  await createDraft()
  return null
}
```

(Server Component that calls the action; `createDraft` throws or redirects, so the return is unreachable at runtime.)

- [ ] **Step 2: Typecheck**

Run: `bun run typecheck`
Expected: no errors.

- [ ] **Step 3: Manual browser check**

`bun run dev --filter=portal`, visit `/approve/new`. Expect an immediate redirect to `/approve/new/<uuid>`. Verify a new row appears in `approve_documents` via Supabase MCP:

```sql
select id, title, status, created_at from public.approve_documents order by created_at desc limit 1;
```

- [ ] **Step 4: Commit**

```bash
git add apps/portal/app/approve/new/page.tsx
git commit -m "feat: /approve/new seeds a draft then redirects"
```

### Task 20: `/approve/new/[id]` page scaffold + upload zone

**Files:**

- Create: `apps/portal/app/approve/new/[id]/page.tsx`
- Create: `apps/portal/app/approve/_components/upload-zone.tsx`
- Create: `apps/portal/app/approve/_components/document-editor.tsx`

- [ ] **Step 1: Write the page**

```tsx
import { notFound } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/user"

import { DocumentEditor } from "../../_components/document-editor"

export default async function EditDraftPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const user = (await getCurrentUser())!
  const supabase = await createClient()
  const { data } = await supabase
    .from("approve_documents")
    .select("*")
    .eq("id", id)
    .eq("created_by", user.id)
    .maybeSingle()
  if (!data) notFound()
  if (data.status !== "draft") {
    // Already submitted — no more editing.
    notFound()
  }

  return (
    <DocumentEditor
      documentId={id}
      initialTitle={data.title}
      initialFilePath={data.file_path}
    />
  )
}
```

- [ ] **Step 2: Write `upload-zone.tsx`**

```tsx
"use client"

import { useState } from "react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import { IconUpload } from "@tabler/icons-react"

import { uploadPdf } from "../actions"

export function UploadZone({
  documentId,
  onUploaded,
}: {
  documentId: string
  onUploaded: (filePath: string) => void
}) {
  const [busy, setBusy] = useState(false)

  async function handle(file: File) {
    if (file.type !== "application/pdf") {
      toast.error("只收 PDF")
      return
    }
    if (file.size > 50 * 1024 * 1024) {
      toast.error("PDF 超過 50MB")
      return
    }
    setBusy(true)
    try {
      const form = new FormData()
      form.set("documentId", documentId)
      form.set("file", file)
      await uploadPdf(form)
      onUploaded(`${documentId}/original.pdf`)
      toast.success("PDF 已上傳")
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <label className="flex h-40 cursor-pointer flex-col items-center justify-center gap-2 rounded border border-dashed text-muted-foreground hover:bg-muted/40">
      <IconUpload className="size-6" />
      <span>{busy ? "上傳中..." : "點這裡選 PDF"}</span>
      <input
        type="file"
        accept="application/pdf"
        className="hidden"
        disabled={busy}
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) handle(f)
        }}
      />
      <Button type="button" variant="ghost" size="sm" tabIndex={-1}>
        或拖放 PDF 到這裡（稍後支援）
      </Button>
    </label>
  )
}
```

- [ ] **Step 3: Write a minimal `document-editor.tsx`**

```tsx
"use client"

import { useState } from "react"

import { UploadZone } from "./upload-zone"

export function DocumentEditor({
  documentId,
  initialTitle,
  initialFilePath,
}: {
  documentId: string
  initialTitle: string
  initialFilePath: string | null
}) {
  const [filePath, setFilePath] = useState(initialFilePath)

  return (
    <main className="space-y-4">
      <h1 className="text-2xl font-semibold">{initialTitle}</h1>
      {!filePath ? (
        <UploadZone documentId={documentId} onUploaded={setFilePath} />
      ) : (
        <p className="text-muted-foreground">
          PDF already uploaded: {filePath}
        </p>
      )}
    </main>
  )
}
```

- [ ] **Step 4: Typecheck + lint**

```bash
bun run typecheck
bun run lint
```

Expected: both pass.

- [ ] **Step 5: Manual browser check**

`bun run dev --filter=portal`. Go to `/approve/new` — a fresh draft page opens. Upload a small PDF. Expect:

- toast "PDF 已上傳"
- the upload zone replaced by a sentence showing the file path
- `approve_documents.file_path` in Supabase set for this row

- [ ] **Step 6: Commit**

```bash
git add apps/portal/app/approve/new/[id]/page.tsx apps/portal/app/approve/_components/upload-zone.tsx apps/portal/app/approve/_components/document-editor.tsx
git commit -m "feat: draft editor shell + PDF upload zone"
```

### Task 21: Title input with debounced auto-save

**Files:**

- Create: `apps/portal/app/approve/_components/title-input.tsx`
- Create: `apps/portal/app/approve/_components/save-indicator.tsx`
- Modify: `apps/portal/app/approve/_components/document-editor.tsx`

- [ ] **Step 1: Write `save-indicator.tsx`**

```tsx
"use client"

export type SaveStatus = "idle" | "saving" | "saved" | "error"

export function SaveIndicator({
  status,
  at,
}: {
  status: SaveStatus
  at: Date | null
}) {
  if (status === "saving") {
    return <span className="text-xs text-muted-foreground">儲存中...</span>
  }
  if (status === "error") {
    return <span className="text-xs text-destructive">儲存失敗</span>
  }
  if (status === "saved" && at) {
    return (
      <span className="text-xs text-muted-foreground">
        已儲存 · {relative(at)}
      </span>
    )
  }
  return null
}

function relative(at: Date): string {
  const diff = Date.now() - at.getTime()
  if (diff < 10_000) return "剛才"
  if (diff < 60_000) return `${Math.floor(diff / 1000)} 秒前`
  return `${Math.floor(diff / 60_000)} 分前`
}
```

- [ ] **Step 2: Write `title-input.tsx`**

```tsx
"use client"

import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { Input } from "@workspace/ui/components/input"

import { updateDocumentTitle } from "../actions"
import { SaveIndicator, type SaveStatus } from "./save-indicator"

export function TitleInput({
  documentId,
  initial,
}: {
  documentId: string
  initial: string
}) {
  const [value, setValue] = useState(initial)
  const [status, setStatus] = useState<SaveStatus>("idle")
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const t = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    return () => {
      if (t.current) clearTimeout(t.current)
    }
  }, [])

  function onChange(next: string) {
    setValue(next)
    setStatus("saving")
    if (t.current) clearTimeout(t.current)
    t.current = setTimeout(async () => {
      try {
        await updateDocumentTitle(documentId, next.trim() || "未命名")
        setStatus("saved")
        setSavedAt(new Date())
      } catch (e) {
        toast.error((e as Error).message)
        setStatus("error")
      }
    }, 500)
  }

  return (
    <div className="flex items-center gap-3">
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="標題"
        className="max-w-xs"
      />
      <SaveIndicator status={status} at={savedAt} />
    </div>
  )
}
```

- [ ] **Step 3: Hook it into `document-editor.tsx`**

Replace the previous `document-editor.tsx` body with:

```tsx
"use client"

import { useState } from "react"

import { TitleInput } from "./title-input"
import { UploadZone } from "./upload-zone"

export function DocumentEditor({
  documentId,
  initialTitle,
  initialFilePath,
}: {
  documentId: string
  initialTitle: string
  initialFilePath: string | null
}) {
  const [filePath, setFilePath] = useState(initialFilePath)

  return (
    <main className="space-y-4">
      <TitleInput documentId={documentId} initial={initialTitle} />
      {!filePath ? (
        <UploadZone documentId={documentId} onUploaded={setFilePath} />
      ) : (
        <p className="text-sm text-muted-foreground">
          PDF: <code className="text-xs">{filePath}</code>
        </p>
      )}
    </main>
  )
}
```

- [ ] **Step 4: Typecheck + lint**

```bash
bun run typecheck
bun run lint
```

Expected: both pass.

- [ ] **Step 5: Manual browser check**

Edit a draft's title. After 500ms the indicator flips `儲存中... → 已儲存 · 剛才`. Reload — new title persists.

- [ ] **Step 6: Commit**

```bash
git add apps/portal/app/approve/_components/title-input.tsx apps/portal/app/approve/_components/save-indicator.tsx apps/portal/app/approve/_components/document-editor.tsx
git commit -m "feat: debounced title input with save indicator"
```

### Task 22: Signer picker

**Files:**

- Create: `apps/portal/app/approve/_components/signer-picker.tsx`
- Modify: `apps/portal/app/approve/_components/document-editor.tsx`

- [ ] **Step 1: Write `signer-picker.tsx`**

```tsx
"use client"

import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@workspace/ui/components/avatar"
import { Button } from "@workspace/ui/components/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@workspace/ui/components/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import { IconPlus, IconX } from "@tabler/icons-react"

import { createClient } from "@/lib/supabase/client"
import { setSigners } from "../actions"

type Candidate = {
  id: string
  name: string
  email: string | null
  avatar_url: string | null
}

export function SignerPicker({
  documentId,
  initialSignerIds,
  onChange,
}: {
  documentId: string
  initialSignerIds: string[]
  onChange: (ids: string[]) => void
}) {
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [selected, setSelected] = useState<string[]>(initialSignerIds)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    ;(async () => {
      const supabase = createClient()
      const { data } = await supabase.from("user_profiles").select(
        `id, name, email,
           member:members!inner(avatar_url)`
      )
      setCandidates(
        (data ?? []).map((row: any) => ({
          id: row.id,
          name: row.name ?? row.email ?? "Unknown",
          email: row.email,
          avatar_url: row.member?.avatar_url ?? null,
        }))
      )
    })()
  }, [])

  const byId = useMemo(() => {
    const m = new Map<string, Candidate>()
    for (const c of candidates) m.set(c.id, c)
    return m
  }, [candidates])

  async function mutate(next: string[]) {
    setSelected(next)
    onChange(next)
    try {
      await setSigners(documentId, next)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {selected.map((id) => {
        const c = byId.get(id)
        return (
          <span
            key={id}
            className="flex items-center gap-1 rounded-full border bg-muted/40 py-0.5 pr-2 pl-1 text-xs"
          >
            <Avatar className="size-5">
              <AvatarImage src={c?.avatar_url ?? undefined} />
              <AvatarFallback>{(c?.name ?? "?").slice(0, 1)}</AvatarFallback>
            </Avatar>
            {c?.name ?? id.slice(0, 6)}
            <button
              type="button"
              aria-label="remove"
              onClick={() => mutate(selected.filter((s) => s !== id))}
            >
              <IconX className="size-3" />
            </button>
          </span>
        )
      })}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" size="sm">
            <IconPlus className="size-4" />加 signer
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-60 p-0">
          <Command>
            <CommandInput placeholder="搜尋成員..." />
            <CommandList>
              <CommandEmpty>沒有符合</CommandEmpty>
              <CommandGroup>
                {candidates
                  .filter((c) => !selected.includes(c.id))
                  .map((c) => (
                    <CommandItem
                      key={c.id}
                      onSelect={() => {
                        mutate([...selected, c.id])
                        setOpen(false)
                      }}
                    >
                      <Avatar className="size-5">
                        <AvatarImage src={c.avatar_url ?? undefined} />
                        <AvatarFallback>{c.name.slice(0, 1)}</AvatarFallback>
                      </Avatar>
                      <span>{c.name}</span>
                    </CommandItem>
                  ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
}
```

- [ ] **Step 2: Load initial signers on the server page and pass them in**

Modify `apps/portal/app/approve/new/[id]/page.tsx` — change the return to load signers:

```tsx
import { notFound } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/user"

import { DocumentEditor } from "../../_components/document-editor"

export default async function EditDraftPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const user = (await getCurrentUser())!
  const supabase = await createClient()
  const { data: doc } = await supabase
    .from("approve_documents")
    .select("*")
    .eq("id", id)
    .eq("created_by", user.id)
    .maybeSingle()
  if (!doc) notFound()
  if (doc.status !== "draft") notFound()

  const { data: signers } = await supabase
    .from("approve_signers")
    .select("signer_id")
    .eq("document_id", id)

  return (
    <DocumentEditor
      documentId={id}
      initialTitle={doc.title}
      initialFilePath={doc.file_path}
      initialSignerIds={(signers ?? []).map((s) => s.signer_id)}
    />
  )
}
```

- [ ] **Step 3: Wire the picker into the editor**

Replace `apps/portal/app/approve/_components/document-editor.tsx`:

```tsx
"use client"

import { useState } from "react"

import { SignerPicker } from "./signer-picker"
import { TitleInput } from "./title-input"
import { UploadZone } from "./upload-zone"

export function DocumentEditor({
  documentId,
  initialTitle,
  initialFilePath,
  initialSignerIds,
}: {
  documentId: string
  initialTitle: string
  initialFilePath: string | null
  initialSignerIds: string[]
}) {
  const [filePath, setFilePath] = useState(initialFilePath)
  const [signerIds, setSignerIds] = useState(initialSignerIds)

  return (
    <main className="space-y-4">
      <TitleInput documentId={documentId} initial={initialTitle} />
      <div>
        <div className="mb-1 text-xs text-muted-foreground">Signers</div>
        <SignerPicker
          documentId={documentId}
          initialSignerIds={signerIds}
          onChange={setSignerIds}
        />
      </div>
      {!filePath ? (
        <UploadZone documentId={documentId} onUploaded={setFilePath} />
      ) : (
        <p className="text-sm text-muted-foreground">
          PDF: <code className="text-xs">{filePath}</code>
        </p>
      )}
    </main>
  )
}
```

- [ ] **Step 4: Typecheck + lint**

```bash
bun run typecheck
bun run lint
```

Expected: both pass.

- [ ] **Step 5: Manual browser check**

Open the editor. Add two signers via the popover. Verify `approve_signers` gets two rows for the document (via Supabase SQL). Remove a signer — row disappears.

- [ ] **Step 6: Commit**

```bash
git add apps/portal/app/approve/_components/signer-picker.tsx apps/portal/app/approve/_components/document-editor.tsx apps/portal/app/approve/new/[id]/page.tsx
git commit -m "feat: multi-select signer picker wired to setSigners action"
```

---

## Phase 8: Editor — PDF + field placement

### Task 23: PDF canvas

**Files:**

- Create: `apps/portal/app/approve/_components/pdf-canvas.tsx`

- [ ] **Step 1: Write the canvas wrapper**

```tsx
"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import { Document, Page } from "react-pdf"

import "react-pdf/dist/Page/AnnotationLayer.css"
import "react-pdf/dist/Page/TextLayer.css"

import "@/lib/approve/pdf" // side-effect: worker registration

import { Button } from "@workspace/ui/components/button"
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react"

export type PageSize = { width: number; height: number }

export function PdfCanvas({
  fileUrl,
  page,
  onPageChange,
  onPageSize,
  children,
}: {
  fileUrl: string
  page: number
  onPageChange: (next: number) => void
  onPageSize?: (size: PageSize) => void
  children?: (size: PageSize) => ReactNode
}) {
  const [numPages, setNumPages] = useState(0)
  const [size, setSize] = useState<PageSize | null>(null)
  const pageRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (size) onPageSize?.(size)
  }, [size, onPageSize])

  return (
    <div className="space-y-2">
      <div
        ref={pageRef}
        className="relative mx-auto w-fit rounded border bg-background"
      >
        <Document
          file={fileUrl}
          onLoadSuccess={({ numPages }) => setNumPages(numPages)}
        >
          <Page
            pageNumber={page}
            width={720}
            onLoadSuccess={({ width, height }) => setSize({ width, height })}
          />
        </Document>
        {size && children ? (
          <div className="pointer-events-none absolute inset-0">
            <div className="pointer-events-auto h-full w-full">
              {children(size)}
            </div>
          </div>
        ) : null}
      </div>

      <div className="flex items-center justify-center gap-3 text-sm">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <IconChevronLeft className="size-4" />
          上一頁
        </Button>
        <span className="text-muted-foreground tabular-nums">
          {page} / {numPages || "—"}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={page >= numPages}
          onClick={() => onPageChange(page + 1)}
        >
          下一頁
          <IconChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck + lint**

```bash
bun run typecheck
bun run lint
```

Expected: both pass.

- [ ] **Step 3: Commit**

```bash
git add apps/portal/app/approve/_components/pdf-canvas.tsx
git commit -m "feat: pdf-canvas wraps react-pdf with paging"
```

### Task 24: Field palette

**Files:**

- Create: `apps/portal/app/approve/_components/field-palette.tsx`

- [ ] **Step 1: Write the palette**

```tsx
"use client"

import { Button } from "@workspace/ui/components/button"

import {
  FIELD_CATEGORIES,
  type CategoryDef,
} from "@/lib/approve/field-categories"

export function FieldPalette({
  activeCategory,
  onPick,
}: {
  activeCategory: CategoryDef["id"] | null
  onPick: (id: CategoryDef["id"] | null) => void
}) {
  return (
    <aside className="flex flex-col gap-1">
      <div className="mb-1 text-xs text-muted-foreground">方塊</div>
      {FIELD_CATEGORIES.map((c) => {
        const Icon = c.icon
        const active = activeCategory === c.id
        return (
          <Button
            key={c.id}
            type="button"
            variant={active ? "default" : "outline"}
            size="sm"
            onClick={() => onPick(active ? null : c.id)}
            className="justify-start"
          >
            <Icon className="size-4" />
            {c.label}
          </Button>
        )
      })}
    </aside>
  )
}
```

- [ ] **Step 2: Typecheck + lint**

```bash
bun run typecheck
bun run lint
```

Expected: both pass.

- [ ] **Step 3: Commit**

```bash
git add apps/portal/app/approve/_components/field-palette.tsx
git commit -m "feat: field palette sidebar toggles placement mode"
```

### Task 25: Field overlay with drag/resize/delete

**Files:**

- Create: `apps/portal/app/approve/_components/signer-badge.tsx`
- Create: `apps/portal/app/approve/_components/field-overlay.tsx`

- [ ] **Step 1: Write `signer-badge.tsx`**

```tsx
"use client"

import { useMemo } from "react"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@workspace/ui/components/avatar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import { Button } from "@workspace/ui/components/button"

import type { SignerProfile } from "@/lib/approve/types"

// Pick a deterministic hue per signer id so the same person always gets
// the same colour across sessions and devices.
export function signerColor(signerId: string): string {
  let hash = 0
  for (let i = 0; i < signerId.length; i++) {
    hash = (hash * 31 + signerId.charCodeAt(i)) | 0
  }
  return `hsl(${((hash % 360) + 360) % 360} 75% 45%)`
}

export function SignerBadge({
  signers,
  currentId,
  onChange,
}: {
  signers: SignerProfile[]
  currentId: string
  onChange: (id: string) => void
}) {
  const current = useMemo(
    () => signers.find((s) => s.id === currentId) ?? null,
    [signers, currentId]
  )

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="absolute -top-2 -right-2 size-5 rounded-full border"
          style={{ background: signerColor(currentId) }}
          aria-label="change signer"
        />
      </PopoverTrigger>
      <PopoverContent className="w-56 space-y-1 p-1">
        <div className="px-2 py-1 text-xs text-muted-foreground">
          指派給：{current?.name ?? "?"}
        </div>
        {signers.map((s) => (
          <Button
            key={s.id}
            type="button"
            variant="ghost"
            size="sm"
            className="w-full justify-start"
            onClick={() => onChange(s.id)}
          >
            <Avatar className="size-5">
              <AvatarImage src={s.avatar_url ?? undefined} />
              <AvatarFallback>{s.name.slice(0, 1)}</AvatarFallback>
            </Avatar>
            {s.name}
          </Button>
        ))}
      </PopoverContent>
    </Popover>
  )
}
```

- [ ] **Step 2: Write `field-overlay.tsx`**

```tsx
"use client"

import { useRef, useState } from "react"

import { IconX } from "@tabler/icons-react"

import type { ApproveField, SignerProfile } from "@/lib/approve/types"
import { getCategoryDef } from "@/lib/approve/field-categories"

import type { PageSize } from "./pdf-canvas"
import { SignerBadge, signerColor } from "./signer-badge"

export type FieldOverlayHandlers = {
  onMove: (
    id: string,
    patch: Partial<Pick<ApproveField, "x" | "y" | "width" | "height">>
  ) => void
  onReassign: (id: string, signerId: string) => void
  onRemove: (id: string) => void
}

export function FieldOverlay({
  fields,
  pageSize,
  signers,
  handlers,
}: {
  fields: ApproveField[]
  pageSize: PageSize
  signers: SignerProfile[]
  handlers: FieldOverlayHandlers
}) {
  return (
    <>
      {fields.map((f) => (
        <FieldBox
          key={f.id}
          field={f}
          pageSize={pageSize}
          signers={signers}
          handlers={handlers}
        />
      ))}
    </>
  )
}

function FieldBox({
  field,
  pageSize,
  signers,
  handlers,
}: {
  field: ApproveField
  pageSize: PageSize
  signers: SignerProfile[]
  handlers: FieldOverlayHandlers
}) {
  const [dragging, setDragging] = useState(false)
  const startRef = useRef<{
    x: number
    y: number
    fx: number
    fy: number
  } | null>(null)
  const def = getCategoryDef(field.category)

  function onPointerDown(e: React.PointerEvent) {
    e.stopPropagation()
    setDragging(true)
    ;(e.target as Element).setPointerCapture(e.pointerId)
    startRef.current = { x: e.clientX, y: e.clientY, fx: field.x, fy: field.y }
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!dragging || !startRef.current) return
    const dx = (e.clientX - startRef.current.x) / pageSize.width
    const dy = (e.clientY - startRef.current.y) / pageSize.height
    handlers.onMove(field.id, {
      x: clamp01(startRef.current.fx + dx),
      y: clamp01(startRef.current.fy + dy),
    })
  }

  function onPointerUp(e: React.PointerEvent) {
    setDragging(false)
    ;(e.target as Element).releasePointerCapture(e.pointerId)
    startRef.current = null
  }

  return (
    <div
      className="absolute rounded border-2 bg-background/40 text-[10px]"
      style={{
        left: field.x * pageSize.width,
        top: field.y * pageSize.height,
        width: field.width * pageSize.width,
        height: field.height * pageSize.height,
        borderColor: signerColor(field.signer_id),
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <span className="px-1">{def.label}</span>
      <SignerBadge
        signers={signers}
        currentId={field.signer_id}
        onChange={(id) => handlers.onReassign(field.id, id)}
      />
      <button
        type="button"
        aria-label="remove"
        onClick={(e) => {
          e.stopPropagation()
          handlers.onRemove(field.id)
        }}
        className="absolute -right-2 -bottom-2 rounded-full border bg-background p-0.5"
      >
        <IconX className="size-3" />
      </button>
      <ResizeHandle
        onDelta={(dw, dh) =>
          handlers.onMove(field.id, {
            width: clamp01(field.width + dw / pageSize.width),
            height: clamp01(field.height + dh / pageSize.height),
          })
        }
      />
    </div>
  )
}

function ResizeHandle({
  onDelta,
}: {
  onDelta: (dx: number, dy: number) => void
}) {
  const startRef = useRef<{ x: number; y: number } | null>(null)
  return (
    <div
      className="absolute right-0 bottom-0 size-2 cursor-se-resize bg-foreground"
      onPointerDown={(e) => {
        e.stopPropagation()
        ;(e.target as Element).setPointerCapture(e.pointerId)
        startRef.current = { x: e.clientX, y: e.clientY }
      }}
      onPointerMove={(e) => {
        if (!startRef.current) return
        onDelta(e.clientX - startRef.current.x, e.clientY - startRef.current.y)
        startRef.current = { x: e.clientX, y: e.clientY }
      }}
      onPointerUp={(e) => {
        startRef.current = null
        ;(e.target as Element).releasePointerCapture(e.pointerId)
      }}
    />
  )
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n))
}
```

We're handling drag/resize manually instead of pulling dnd-kit's `DndContext`. The `@dnd-kit/core` dep is installed for future re-ordering features but this overlay uses Pointer Events directly — simpler, zero extra renders, and the skill says "don't design for hypothetical requirements."

- [ ] **Step 3: Typecheck + lint**

```bash
bun run typecheck
bun run lint
```

Expected: both pass.

- [ ] **Step 4: Commit**

```bash
git add apps/portal/app/approve/_components/signer-badge.tsx apps/portal/app/approve/_components/field-overlay.tsx
git commit -m "feat: field overlay with manual drag, resize and reassign"
```

### Task 26: Wire palette + overlay + PDF into editor

**Files:**

- Modify: `apps/portal/app/approve/_components/document-editor.tsx`

- [ ] **Step 1: Rewrite the editor**

```tsx
"use client"

import { useCallback, useMemo, useRef, useState } from "react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"

import { createClient } from "@/lib/supabase/client"
import { APPROVE_BUCKET, documentStoragePath } from "@/lib/approve/storage"
import type {
  ApproveField,
  FieldCategory,
  SignerProfile,
} from "@/lib/approve/types"
import { getCategoryDef } from "@/lib/approve/field-categories"

import { deleteField, submitDocument, upsertField } from "../actions"

import { FieldOverlay } from "./field-overlay"
import { FieldPalette } from "./field-palette"
import { PdfCanvas } from "./pdf-canvas"
import { SignerPicker } from "./signer-picker"
import { TitleInput } from "./title-input"
import { UploadZone } from "./upload-zone"

export function DocumentEditor({
  documentId,
  initialTitle,
  initialFilePath,
  initialSignerIds,
  initialFields,
  initialSignerProfiles,
}: {
  documentId: string
  initialTitle: string
  initialFilePath: string | null
  initialSignerIds: string[]
  initialFields: ApproveField[]
  initialSignerProfiles: SignerProfile[]
}) {
  const [filePath, setFilePath] = useState(initialFilePath)
  const [signerIds, setSignerIds] = useState(initialSignerIds)
  const [signerProfiles, setSignerProfiles] = useState(initialSignerProfiles)
  const [fields, setFields] = useState(initialFields)
  const [page, setPage] = useState(1)
  const [palette, setPalette] = useState<FieldCategory | null>(null)

  const debounceRefs = useRef<Map<string, NodeJS.Timeout>>(new Map())

  const signedUrl = useSignedUrl(filePath, documentId)

  const fieldsOnPage = useMemo(
    () => fields.filter((f) => f.page === page),
    [fields, page]
  )

  const scheduleSave = useCallback(
    (field: ApproveField) => {
      const existing = debounceRefs.current.get(field.id)
      if (existing) clearTimeout(existing)
      const t = setTimeout(async () => {
        try {
          await upsertField({
            id: field.id,
            documentId,
            signerId: field.signer_id,
            page: field.page,
            x: field.x,
            y: field.y,
            width: field.width,
            height: field.height,
            category: field.category,
            label: field.label,
          })
        } catch (e) {
          toast.error((e as Error).message)
        }
      }, 500)
      debounceRefs.current.set(field.id, t)
    },
    [documentId]
  )

  function onMove(id: string, patch: Partial<ApproveField>) {
    setFields((prev) => {
      const next = prev.map((f) => (f.id === id ? { ...f, ...patch } : f))
      const moved = next.find((f) => f.id === id)
      if (moved) scheduleSave(moved)
      return next
    })
  }

  function onReassign(id: string, signerId: string) {
    setFields((prev) => {
      const next = prev.map((f) =>
        f.id === id ? { ...f, signer_id: signerId } : f
      )
      const moved = next.find((f) => f.id === id)
      if (moved) scheduleSave(moved)
      return next
    })
  }

  async function onRemove(id: string) {
    const prev = fields
    setFields(prev.filter((f) => f.id !== id))
    try {
      await deleteField(documentId, id)
    } catch (e) {
      setFields(prev)
      toast.error((e as Error).message)
    }
  }

  function onCanvasClick(
    e: React.MouseEvent,
    size: { width: number; height: number }
  ) {
    if (!palette) return
    if (signerIds.length === 0) {
      toast.error("先加 signer")
      return
    }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const def = getCategoryDef(palette)
    const nx = (e.clientX - rect.left) / size.width
    const ny = (e.clientY - rect.top) / size.height
    const newField: ApproveField = {
      id: crypto.randomUUID(),
      document_id: documentId,
      signer_id: signerIds[0]!,
      page,
      x: clamp01(nx - def.defaultSize.width / 2),
      y: clamp01(ny - def.defaultSize.height / 2),
      width: def.defaultSize.width,
      height: def.defaultSize.height,
      category: palette,
      label: palette === "other" ? "請填寫" : null,
      value: null,
      signed_at: null,
      created_at: new Date().toISOString(),
    }
    setFields((prev) => [...prev, newField])
    scheduleSave(newField)
  }

  async function onSubmit() {
    try {
      await submitDocument(documentId)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <main className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <TitleInput documentId={documentId} initial={initialTitle} />
        <Button type="button" onClick={onSubmit}>
          送出
        </Button>
      </div>

      <div>
        <div className="mb-1 text-xs text-muted-foreground">Signers</div>
        <SignerPicker
          documentId={documentId}
          initialSignerIds={signerIds}
          onChange={async (ids) => {
            setSignerIds(ids)
            // Refresh profiles list for overlay badges
            const supabase = createClient()
            const { data } = await supabase
              .from("user_profiles")
              .select(`id, name, email, member:members!inner(avatar_url, role)`)
              .in("id", ids)
            setSignerProfiles(
              (data ?? []).map((row: any) => ({
                id: row.id,
                name: row.name ?? row.email ?? "Unknown",
                email: row.email ?? null,
                avatar_url: row.member?.avatar_url ?? null,
                role: row.member?.role ?? null,
              }))
            )
          }}
        />
      </div>

      {!filePath ? (
        <UploadZone documentId={documentId} onUploaded={setFilePath} />
      ) : (
        <div className="flex gap-4">
          <FieldPalette activeCategory={palette} onPick={setPalette} />
          <div className="flex-1">
            {signedUrl ? (
              <PdfCanvas fileUrl={signedUrl} page={page} onPageChange={setPage}>
                {(size) => (
                  <div
                    className="h-full w-full"
                    onClick={(e) => onCanvasClick(e, size)}
                    style={{ cursor: palette ? "crosshair" : "default" }}
                  >
                    <FieldOverlay
                      fields={fieldsOnPage}
                      pageSize={size}
                      signers={signerProfiles}
                      handlers={{ onMove, onReassign, onRemove }}
                    />
                  </div>
                )}
              </PdfCanvas>
            ) : (
              <p className="text-muted-foreground">載入 PDF...</p>
            )}
          </div>
        </div>
      )}
    </main>
  )
}

function useSignedUrl(filePath: string | null, documentId: string) {
  const [url, setUrl] = useState<string | null>(null)
  useMemo(() => {
    if (!filePath) {
      setUrl(null)
      return
    }
    const supabase = createClient()
    supabase.storage
      .from(APPROVE_BUCKET)
      .createSignedUrl(documentStoragePath(documentId), 60 * 30)
      .then(({ data }) => setUrl(data?.signedUrl ?? null))
  }, [filePath, documentId])
  return url
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n))
}
```

- [ ] **Step 2: Update the server page to pass initial fields + profiles**

Replace `apps/portal/app/approve/new/[id]/page.tsx`:

```tsx
import { notFound } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/user"
import type { ApproveField, SignerProfile } from "@/lib/approve/types"

import { DocumentEditor } from "../../_components/document-editor"

export default async function EditDraftPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const user = (await getCurrentUser())!
  const supabase = await createClient()
  const { data: doc } = await supabase
    .from("approve_documents")
    .select("*")
    .eq("id", id)
    .eq("created_by", user.id)
    .maybeSingle()
  if (!doc) notFound()
  if (doc.status !== "draft") notFound()

  const [{ data: signers }, { data: fields }] = await Promise.all([
    supabase
      .from("approve_signers")
      .select(
        `signer_id,
         profile:user_profiles!signer_id(
           id, name, email, member:members!inner(avatar_url, role)
         )`
      )
      .eq("document_id", id),
    supabase.from("approve_fields").select("*").eq("document_id", id),
  ])

  const signerIds = (signers ?? []).map((s: any) => s.signer_id)
  const profiles: SignerProfile[] = (signers ?? []).map((s: any) => ({
    id: s.profile?.id ?? s.signer_id,
    name: s.profile?.name ?? s.profile?.email ?? "Unknown",
    email: s.profile?.email ?? null,
    avatar_url: s.profile?.member?.avatar_url ?? null,
    role: s.profile?.member?.role ?? null,
  }))

  return (
    <DocumentEditor
      documentId={id}
      initialTitle={doc.title}
      initialFilePath={doc.file_path}
      initialSignerIds={signerIds}
      initialFields={(fields ?? []) as ApproveField[]}
      initialSignerProfiles={profiles}
    />
  )
}
```

- [ ] **Step 3: Typecheck + lint**

```bash
bun run typecheck
bun run lint
```

Expected: both pass.

- [ ] **Step 4: Manual browser check**

Open a draft with a PDF and at least one signer.

- Click `簽名` in palette, then click the PDF — a new box appears.
- Drag it. Resize via bottom-right handle. Click the coloured dot — reassign signer popover opens.
- Click the `×` — box deletes.
- Paginate — boxes on other pages stay hidden.
- Reload page — boxes persist (via DB round-trip).

Verify DB rows via SQL:

```sql
select id, page, x, y, width, height, category from public.approve_fields where document_id='<the id>';
```

- [ ] **Step 5: Commit**

```bash
git add apps/portal/app/approve/_components/document-editor.tsx apps/portal/app/approve/new/[id]/page.tsx
git commit -m "feat: PDF editor with field placement, drag, resize and reassign"
```

### Task 27: Submit flow validation

**Files:**

- Modify: `apps/portal/app/approve/_components/document-editor.tsx` (minor)

- [ ] **Step 1: Client-side pre-check before calling `submitDocument`**

Modify `onSubmit` in `document-editor.tsx`:

```ts
async function onSubmit() {
  const { validateForSubmit } = await import("@/lib/approve/validation")
  const v = validateForSubmit({
    title: initialTitle, // stale on purpose; server validates the truth
    filePath,
    signers: signerIds.map((id) => ({
      id: "",
      document_id: documentId,
      signer_id: id,
      status: "pending",
      signed_at: null,
      created_at: "",
    })),
    fields,
  })
  if (!v.ok) {
    toast.error(v.reason)
    return
  }
  try {
    await submitDocument(documentId)
  } catch (e) {
    toast.error((e as Error).message)
  }
}
```

- [ ] **Step 2: Typecheck + lint**

```bash
bun run typecheck
bun run lint
```

Expected: both pass.

- [ ] **Step 3: Manual browser check**

- Click `送出` with no signers or no fields — toast explains the issue.
- Add everything — click `送出`. Expect redirect to `/approve`, the doc now shows up on the **送簽** tab with status `送簽中`.

- [ ] **Step 4: Commit**

```bash
git add apps/portal/app/approve/_components/document-editor.tsx
git commit -m "feat: pre-submit validation so 送出 tells you exactly what's missing"
```

---

## Phase 9: Signing

### Task 28: `/approve/sign/[id]` — server load + signing view shell

**Files:**

- Create: `apps/portal/app/approve/sign/[id]/page.tsx`
- Create: `apps/portal/app/approve/_components/signing-view.tsx`

- [ ] **Step 1: Write the page**

```tsx
import { notFound, redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/user"
import type {
  ApproveDocument,
  ApproveField,
  ApproveUserFieldValue,
} from "@/lib/approve/types"

import { SigningView } from "../../_components/signing-view"

export default async function SignPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const user = (await getCurrentUser())!
  const supabase = await createClient()

  const { data: doc } = await supabase
    .from("approve_documents")
    .select("id,title,file_path,status")
    .eq("id", id)
    .maybeSingle()
  if (!doc) notFound()

  const { data: my } = await supabase
    .from("approve_signers")
    .select("id,status")
    .eq("document_id", id)
    .eq("signer_id", user.id)
    .maybeSingle()
  if (!my) notFound()
  if (my.status === "signed") redirect(`/approve/view/${id}`)

  const [{ data: fields }, { data: values }] = await Promise.all([
    supabase
      .from("approve_fields")
      .select("*")
      .eq("document_id", id)
      .eq("signer_id", user.id),
    supabase
      .from("approve_user_field_values")
      .select("*")
      .eq("user_id", user.id),
  ])

  return (
    <SigningView
      document={doc as ApproveDocument}
      fields={(fields ?? []) as ApproveField[]}
      savedValues={(values ?? []) as ApproveUserFieldValue[]}
    />
  )
}
```

- [ ] **Step 2: Write a minimal `signing-view.tsx`**

```tsx
"use client"

import { useMemo, useState } from "react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"

import { createClient } from "@/lib/supabase/client"
import { APPROVE_BUCKET, documentStoragePath } from "@/lib/approve/storage"
import type {
  ApproveDocument,
  ApproveField,
  ApproveUserFieldValue,
} from "@/lib/approve/types"
import { isPredefined } from "@/lib/approve/field-categories"

import { submitSignature, type SignatureValue } from "../actions"

import { PdfCanvas } from "./pdf-canvas"
import { SigningField } from "./signing-field"

export function SigningView({
  document,
  fields,
  savedValues,
}: {
  document: ApproveDocument
  fields: ApproveField[]
  savedValues: ApproveUserFieldValue[]
}) {
  const [state, setState] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    for (const f of fields) {
      if (isPredefined(f.category)) {
        init[f.id] =
          savedValues.find((v) => v.category === f.category)?.value ?? ""
      } else {
        init[f.id] = ""
      }
    }
    return init
  })
  const [page, setPage] = useState(1)
  const [signedUrl, setSignedUrl] = useState<string | null>(null)

  useMemo(() => {
    if (!document.file_path) return
    const supabase = createClient()
    supabase.storage
      .from(APPROVE_BUCKET)
      .createSignedUrl(documentStoragePath(document.id), 60 * 30)
      .then(({ data }) => setSignedUrl(data?.signedUrl ?? null))
  }, [document.file_path, document.id])

  const totalFields = fields.length
  const filledCount = Object.values(state).filter((v) => v.trim()).length
  const fieldsOnPage = useMemo(
    () => fields.filter((f) => f.page === page),
    [fields, page]
  )

  async function onSubmit() {
    for (const f of fields) {
      if (!state[f.id]?.trim()) {
        toast.error("還有欄位沒填")
        return
      }
    }
    const values: SignatureValue[] = fields.map((f) => ({
      fieldId: f.id,
      value: state[f.id]!,
    }))
    try {
      await submitSignature(document.id, values)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <main className="space-y-4">
      <h1 className="text-2xl font-semibold">{document.title}</h1>
      <p className="text-xs text-muted-foreground">
        進度：{filledCount}/{totalFields}
      </p>

      {signedUrl && (
        <PdfCanvas fileUrl={signedUrl} page={page} onPageChange={setPage}>
          {(size) => (
            <>
              {fieldsOnPage.map((f) => (
                <SigningField
                  key={f.id}
                  field={f}
                  pageSize={size}
                  value={state[f.id] ?? ""}
                  onChange={(v) => setState((s) => ({ ...s, [f.id]: v }))}
                />
              ))}
            </>
          )}
        </PdfCanvas>
      )}

      <div className="flex justify-end">
        <Button type="button" onClick={onSubmit}>
          送出簽核
        </Button>
      </div>
    </main>
  )
}
```

- [ ] **Step 3: Create a placeholder `signing-field.tsx`** (real one in next task)

```tsx
"use client"

import type { ApproveField } from "@/lib/approve/types"
import { getCategoryDef } from "@/lib/approve/field-categories"

import type { PageSize } from "./pdf-canvas"

export function SigningField({
  field,
  pageSize,
  value,
  onChange,
}: {
  field: ApproveField
  pageSize: PageSize
  value: string
  onChange: (next: string) => void
}) {
  const def = getCategoryDef(field.category)
  return (
    <div
      className="absolute rounded border bg-background"
      style={{
        left: field.x * pageSize.width,
        top: field.y * pageSize.height,
        width: field.width * pageSize.width,
        height: field.height * pageSize.height,
      }}
    >
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.label ?? def.label}
        className="h-full w-full bg-transparent px-1 text-xs outline-none"
      />
    </div>
  )
}
```

- [ ] **Step 4: Typecheck + lint**

```bash
bun run typecheck
bun run lint
```

Expected: both pass.

- [ ] **Step 5: Manual browser check**

As a signer (seed yourself in the editor as your own signer, or use two browser profiles):

- Open `/approve/sign/<id>` — see only your own fields.
- Fields with saved values pre-fill; `other` fields are blank.
- Fill everything, click `送出簽核` — redirect to `/approve`. Doc moves to `已簽`.

- [ ] **Step 6: Commit**

```bash
git add apps/portal/app/approve/sign/[id]/page.tsx apps/portal/app/approve/_components/signing-view.tsx apps/portal/app/approve/_components/signing-field.tsx
git commit -m "feat: signing view with per-signer fields and pre-fill"
```

### Task 29: Signature pad (draw + upload + reuse last)

**Files:**

- Create: `apps/portal/app/approve/_components/signature-pad.tsx`
- Modify: `apps/portal/app/approve/_components/signing-field.tsx`

- [ ] **Step 1: Write `signature-pad.tsx`**

```tsx
"use client"

import { useRef, useState } from "react"
import SignatureCanvas from "react-signature-canvas"

import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui/components/dialog"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs"

export function SignaturePad({
  trigger,
  savedSignature,
  onConfirm,
}: {
  trigger: React.ReactNode
  savedSignature: string | null
  onConfirm: (dataUrl: string) => void
}) {
  const [open, setOpen] = useState(false)
  const canvasRef = useRef<SignatureCanvas | null>(null)
  const [uploaded, setUploaded] = useState<string | null>(null)
  const [tab, setTab] = useState<"draw" | "upload">("draw")

  function confirm() {
    let dataUrl: string | null = null
    if (tab === "draw") {
      const c = canvasRef.current
      if (!c || c.isEmpty()) return
      dataUrl = c.getCanvas().toDataURL("image/png")
    } else {
      dataUrl = uploaded
    }
    if (!dataUrl) return
    onConfirm(dataUrl)
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>簽名</DialogTitle>
        </DialogHeader>
        <Tabs value={tab} onValueChange={(v) => setTab(v as "draw" | "upload")}>
          <TabsList>
            <TabsTrigger value="draw">手繪</TabsTrigger>
            <TabsTrigger value="upload">上傳</TabsTrigger>
          </TabsList>
          <TabsContent value="draw" className="space-y-2">
            <div className="rounded border bg-background">
              <SignatureCanvas
                ref={canvasRef}
                canvasProps={{ width: 480, height: 180, className: "block" }}
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => canvasRef.current?.clear()}
            >
              清除
            </Button>
          </TabsContent>
          <TabsContent value="upload" className="space-y-2">
            <input
              type="file"
              accept="image/png,image/jpeg,image/svg+xml"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (!f) return
                const reader = new FileReader()
                reader.onload = () => setUploaded(String(reader.result))
                reader.readAsDataURL(f)
              }}
            />
            {uploaded && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={uploaded}
                alt="signature preview"
                className="max-h-40 rounded border bg-background"
              />
            )}
          </TabsContent>
        </Tabs>

        {savedSignature && (
          <div className="flex items-center gap-2 rounded border p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={savedSignature}
              alt="last signature"
              className="h-12 bg-background"
            />
            <span className="text-xs text-muted-foreground">上次簽名</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="ml-auto"
              onClick={() => {
                onConfirm(savedSignature)
                setOpen(false)
              }}
            >
              套用
            </Button>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            取消
          </Button>
          <Button onClick={confirm}>確認</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Rewrite `signing-field.tsx` to branch on signature vs text**

```tsx
"use client"

import { Button } from "@workspace/ui/components/button"

import type { ApproveField } from "@/lib/approve/types"
import { getCategoryDef } from "@/lib/approve/field-categories"

import type { PageSize } from "./pdf-canvas"
import { SignaturePad } from "./signature-pad"

export function SigningField({
  field,
  pageSize,
  value,
  savedSignature,
  onChange,
}: {
  field: ApproveField
  pageSize: PageSize
  value: string
  savedSignature: string | null
  onChange: (next: string) => void
}) {
  const def = getCategoryDef(field.category)
  const style: React.CSSProperties = {
    left: field.x * pageSize.width,
    top: field.y * pageSize.height,
    width: field.width * pageSize.width,
    height: field.height * pageSize.height,
  }

  if (field.category === "signature") {
    return (
      <div className="absolute rounded border bg-background" style={style}>
        {value ? (
          <SignaturePad
            savedSignature={savedSignature}
            onConfirm={onChange}
            trigger={
              <button type="button" className="block h-full w-full">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={value}
                  alt="signature"
                  className="h-full w-full object-contain"
                />
              </button>
            }
          />
        ) : (
          <SignaturePad
            savedSignature={savedSignature}
            onConfirm={onChange}
            trigger={
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-full w-full"
              >
                點擊簽名
              </Button>
            }
          />
        )}
      </div>
    )
  }

  return (
    <div className="absolute rounded border bg-background" style={style}>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.label ?? def.label}
        className="h-full w-full bg-transparent px-1 text-xs outline-none"
      />
    </div>
  )
}
```

- [ ] **Step 3: Pass `savedSignature` through the signing view**

Modify `signing-view.tsx` — add this derivation and pass-through:

```ts
const savedSignature =
  savedValues.find((v) => v.category === "signature")?.value ?? null
```

and inside the map:

```tsx
<SigningField
  key={f.id}
  field={f}
  pageSize={size}
  value={state[f.id] ?? ""}
  savedSignature={savedSignature}
  onChange={(v) => setState((s) => ({ ...s, [f.id]: v }))}
/>
```

- [ ] **Step 4: Typecheck + lint**

```bash
bun run typecheck
bun run lint
```

Expected: both pass.

- [ ] **Step 5: Manual browser check**

- Open a sign page with a signature field. Click — dialog opens.
- Draw on canvas → 確認 → the signature rasterises into the box.
- Open the dialog again → `套用` (上次簽名) → reuses without redraw.
- Upload tab → pick a PNG → preview shows → 確認 → placed in box.
- Submit. Check `approve_user_field_values` SQL — new `signature` row for this user.

```sql
select category, updated_at from public.approve_user_field_values where user_id='<your uuid>';
```

- [ ] **Step 6: Commit**

```bash
git add apps/portal/app/approve/_components/signature-pad.tsx apps/portal/app/approve/_components/signing-field.tsx apps/portal/app/approve/_components/signing-view.tsx
git commit -m "feat: signature pad — draw, upload, and reuse last"
```

---

## Phase 10: Readonly view

### Task 30: `/approve/view/[id]` + document-view

**Files:**

- Create: `apps/portal/app/approve/view/[id]/page.tsx`
- Create: `apps/portal/app/approve/_components/document-view.tsx`
- Create: `apps/portal/app/approve/_components/signer-progress.tsx`

- [ ] **Step 1: Write the page**

```tsx
import { notFound, redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/user"
import type {
  ApproveDocument,
  ApproveField,
  ApproveSigner,
  SignerProfile,
} from "@/lib/approve/types"

import { DocumentView } from "../../_components/document-view"

export default async function ViewPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const user = (await getCurrentUser())!
  const supabase = await createClient()

  const { data: doc } = await supabase
    .from("approve_documents")
    .select("*")
    .eq("id", id)
    .maybeSingle()
  if (!doc) notFound()

  const isCreator = doc.created_by === user.id
  let isSigner = false
  if (!isCreator) {
    const { data: my } = await supabase
      .from("approve_signers")
      .select("status")
      .eq("document_id", id)
      .eq("signer_id", user.id)
      .maybeSingle()
    if (!my) notFound()
    if (my.status === "pending") redirect(`/approve/sign/${id}`)
    isSigner = true
  }

  const [{ data: signers }, { data: fields }] = await Promise.all([
    supabase
      .from("approve_signers")
      .select(
        `id, document_id, signer_id, status, signed_at, created_at,
         profile:user_profiles!signer_id(
           id, name, email, member:members!inner(avatar_url, role)
         )`
      )
      .eq("document_id", id),
    supabase.from("approve_fields").select("*").eq("document_id", id),
  ])

  const withProfile: (ApproveSigner & { profile: SignerProfile | null })[] = (
    signers ?? []
  ).map((s: any) => ({
    id: s.id,
    document_id: s.document_id,
    signer_id: s.signer_id,
    status: s.status,
    signed_at: s.signed_at,
    created_at: s.created_at,
    profile: s.profile
      ? {
          id: s.profile.id,
          name: s.profile.name ?? s.profile.email ?? "Unknown",
          email: s.profile.email ?? null,
          avatar_url: s.profile.member?.avatar_url ?? null,
          role: s.profile.member?.role ?? null,
        }
      : null,
  }))

  return (
    <DocumentView
      document={doc as ApproveDocument}
      signers={withProfile}
      fields={(fields ?? []) as ApproveField[]}
      viewerRole={isCreator ? "creator" : isSigner ? "signer" : "creator"}
      viewerId={user.id}
    />
  )
}
```

- [ ] **Step 2: Write `signer-progress.tsx`**

```tsx
"use client"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@workspace/ui/components/avatar"

import type { ApproveSigner, SignerProfile } from "@/lib/approve/types"

export function SignerProgress({
  rows,
}: {
  rows: (ApproveSigner & { profile: SignerProfile | null })[]
}) {
  return (
    <aside className="space-y-2">
      <div className="text-xs text-muted-foreground">Signers</div>
      {rows.map((r) => (
        <div key={r.id} className="flex items-center gap-2 text-sm">
          <Avatar className="size-6">
            <AvatarImage src={r.profile?.avatar_url ?? undefined} />
            <AvatarFallback>
              {r.profile?.name?.slice(0, 1) ?? "?"}
            </AvatarFallback>
          </Avatar>
          <span className="flex-1 truncate">
            {r.profile?.name ?? r.signer_id}
          </span>
          <span
            className={
              r.status === "signed"
                ? "text-xs text-muted-foreground"
                : "text-xs"
            }
          >
            {r.status === "signed" ? r.signed_at?.slice(0, 10) : "pending"}
          </span>
        </div>
      ))}
    </aside>
  )
}
```

- [ ] **Step 3: Write `document-view.tsx`**

```tsx
"use client"

import { useMemo, useState } from "react"

import { createClient } from "@/lib/supabase/client"
import { APPROVE_BUCKET, documentStoragePath } from "@/lib/approve/storage"
import type {
  ApproveDocument,
  ApproveField,
  ApproveSigner,
  SignerProfile,
} from "@/lib/approve/types"

import { PdfCanvas } from "./pdf-canvas"
import { SignerProgress } from "./signer-progress"
import { signerColor } from "./signer-badge"

export function DocumentView({
  document,
  signers,
  fields,
  viewerRole,
  viewerId,
}: {
  document: ApproveDocument
  signers: (ApproveSigner & { profile: SignerProfile | null })[]
  fields: ApproveField[]
  viewerRole: "creator" | "signer"
  viewerId: string
}) {
  const [page, setPage] = useState(1)
  const [signedUrl, setSignedUrl] = useState<string | null>(null)

  useMemo(() => {
    if (!document.file_path) return
    const supabase = createClient()
    supabase.storage
      .from(APPROVE_BUCKET)
      .createSignedUrl(documentStoragePath(document.id), 60 * 30)
      .then(({ data }) => setSignedUrl(data?.signedUrl ?? null))
  }, [document.file_path, document.id])

  const visible =
    viewerRole === "creator"
      ? fields
      : fields.filter((f) => f.signer_id === viewerId)
  const onPage = visible.filter((f) => f.page === page)
  const nameBySigner = new Map(
    signers.map((s) => [s.signer_id, s.profile?.name ?? "?"])
  )

  return (
    <main className="space-y-4">
      <h1 className="text-2xl font-semibold">{document.title}</h1>
      <div className="flex gap-6">
        <div className="flex-1">
          {signedUrl && (
            <PdfCanvas fileUrl={signedUrl} page={page} onPageChange={setPage}>
              {(size) => (
                <>
                  {onPage.map((f) => (
                    <div
                      key={f.id}
                      className="absolute rounded border bg-background/70"
                      style={{
                        left: f.x * size.width,
                        top: f.y * size.height,
                        width: f.width * size.width,
                        height: f.height * size.height,
                        borderColor: signerColor(f.signer_id),
                      }}
                    >
                      {f.value ? (
                        f.category === "signature" ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={f.value}
                            alt="signature"
                            className="h-full w-full object-contain"
                          />
                        ) : (
                          <span className="block px-1 text-xs">{f.value}</span>
                        )
                      ) : (
                        <span className="block px-1 text-[10px] text-muted-foreground">
                          待 {nameBySigner.get(f.signer_id)} 簽
                        </span>
                      )}
                    </div>
                  ))}
                </>
              )}
            </PdfCanvas>
          )}
        </div>
        <div className="w-56">
          <SignerProgress rows={signers} />
        </div>
      </div>
    </main>
  )
}
```

- [ ] **Step 4: Typecheck + lint**

```bash
bun run typecheck
bun run lint
```

Expected: both pass.

- [ ] **Step 5: Manual browser check**

- As creator, open `/approve/view/<id>`: see all fields. Unsigned boxes show `待 X 簽`; signed ones show the value (signature image or text).
- As signer who already signed, open `/approve/view/<id>`: see only your own values.
- Try opening a doc you're neither creator nor signer of — expect 404.

- [ ] **Step 6: Commit**

```bash
git add apps/portal/app/approve/view/[id]/page.tsx apps/portal/app/approve/_components/document-view.tsx apps/portal/app/approve/_components/signer-progress.tsx
git commit -m "feat: readonly view for creator and signed signers"
```

---

## Phase 11: Polish

### Task 31: Delete draft button + confirm dialog

**Files:**

- Create: `apps/portal/app/approve/_components/confirm-dialog.tsx`
- Modify: `apps/portal/app/approve/_components/document-editor.tsx`

- [ ] **Step 1: Copy the confirm-dialog from bento**

Create `apps/portal/app/approve/_components/confirm-dialog.tsx` with the exact same content as `apps/portal/app/bento/_components/confirm-dialog.tsx` (verbatim).

- [ ] **Step 2: Add a delete button to the editor**

Inside `document-editor.tsx`, add in the top action bar next to `送出`:

```tsx
import { useRouter } from "next/navigation"

import { deleteDocument } from "../actions"
import { ConfirmDialog } from "./confirm-dialog"

// ...inside DocumentEditor:
const router = useRouter()
```

Replace the header row with:

```tsx
<div className="flex items-center justify-between gap-3">
  <TitleInput documentId={documentId} initial={initialTitle} />
  <div className="flex items-center gap-2">
    <ConfirmDialog
      trigger={<Button variant="outline">刪除草稿</Button>}
      title="刪除草稿？"
      description="刪了就沒了。"
      confirmText="刪除"
      variant="destructive"
      onConfirm={async () => {
        try {
          await deleteDocument(documentId)
          router.push("/approve")
        } catch (e) {
          toast.error((e as Error).message)
        }
      }}
    />
    <Button type="button" onClick={onSubmit}>
      送出
    </Button>
  </div>
</div>
```

- [ ] **Step 3: Typecheck + lint**

```bash
bun run typecheck
bun run lint
```

Expected: both pass.

- [ ] **Step 4: Manual browser check**

Open a draft, click `刪除草稿` → dialog → confirm → redirected to `/approve`, doc no longer in 送簽 tab. Storage object also removed by RLS-driven cascade? (No — `approve_documents` delete cascades rows but not storage objects. Leaving orphaned PDFs is acceptable for this sprint; revisit in a later cleanup task.)

- [ ] **Step 5: Commit**

```bash
git add apps/portal/app/approve/_components/confirm-dialog.tsx apps/portal/app/approve/_components/document-editor.tsx
git commit -m "feat: let me nuke my own drafts"
```

### Task 32: Final end-to-end smoke + lint + typecheck

**Files:**

- None.

- [ ] **Step 1: Run full typecheck and lint**

```bash
bun run typecheck
bun run lint
```

Expected: both pass.

- [ ] **Step 2: Full manual playthrough**

1. `/approve` — three tabs render.
2. `[+ 送簽]` → `/approve/new/<id>`.
3. Title renames, saves in the indicator.
4. Upload a real PDF (> 1 page preferred).
5. Add two signers (yourself + another test user).
6. Place a signature field for each signer + one `其他` field.
7. Drag, resize, reassign, delete a field.
8. Submit — redirect to `/approve`, doc is in 送簽 tab.
9. As signer 1 (yourself): open `/approve/sign/<id>`. Sign. Submit.
10. As signer 2: sign. Submit → doc becomes `completed`.
11. As creator: `/approve/view/<id>` — all fields populated.
12. As signer 1: `/approve/view/<id>` — only own fields shown.

- [ ] **Step 3: Supabase advisor check**

Via MCP: `mcp__plugin_supabase_supabase__get_advisors` with `type=security` and `type=performance` against `yissfqcdmzsxwfnzrflz`. Address any `approve_*`-related findings.

- [ ] **Step 4: Commit (docs-only or empty — skip if no changes)**

If the smoke run produced any tweaks, commit them with a descriptive message. Otherwise proceed.

- [ ] **Step 5: Push branch + open PR (if ready)**

```bash
git push -u origin feat/approve-app
```

Then either open a PR by hand via the GitHub UI or (if using `gh`):

```bash
gh pr create --title "feat: approve app" --body "$(cat <<'EOF'
## Summary
- New `/approve` app inside portal with three-tab dashboard (代簽 / 已簽 / 送簽)
- PDF upload + field-placement editor with drag/resize/reassign and debounced auto-save
- Signing view with per-signer field filtering, predefined pre-fill, and signature pad (draw / upload / reuse last)
- Readonly view with creator-vs-signer branching
- `approve_*` schema with RLS as primary authorization layer; legacy approve tables dropped

## Test plan
- [x] Dashboard tabs + empty states
- [x] Upload + place + submit happy path
- [x] Sign flow with pre-fill and signature pad
- [x] Multi-signer completes → doc `completed`
- [x] Readonly view creator vs signer
- [x] RLS: signer cannot SELECT other signers' fields
EOF
)"
```

---

## Self-Review Notes

- **Spec coverage** — each section of `docs/superpowers/specs/2026-04-23-approve-design.md` mapped to at least one task:
  - §4 schema + RLS → Task 3
  - §4.3 storage → Task 4
  - §4.4 legacy cleanup → Task 3
  - §5 routes + folder → Tasks 10–30
  - §6.1 dashboard → Task 18
  - §6.2 editor (all bullets) → Tasks 19–27
  - §6.3 signing → Tasks 28–29
  - §6.4 signature pad → Task 29
  - §6.5 readonly → Task 30
  - §7 actions table → Tasks 12–13
  - §8 categories → Task 6
  - §11 decisions — all respected (coord normalized, signature in `approve_user_field_values`, debounce 500ms, 50MB cap, trigger-based updated_at)
  - §12 phase 11 polish — Task 31 covers destructive confirm; empty states covered throughout via `.length === 0` branches
- **Placeholders** — none: every code step has real TypeScript / SQL.
- **Type consistency** — `ApproveField`, `ApproveSigner`, `SignerProfile`, `FieldCategory`, `SaveStatus`, `SignatureValue`, `UpsertFieldInput`, `SubmitValidationInput`, `CategoryDef` all consistent across all tasks.
- **Action signatures** — `createDraft()`, `uploadPdf(FormData)`, `updateDocumentTitle(docId, title)`, `setSigners(docId, ids[])`, `upsertField(UpsertFieldInput)`, `deleteField(docId, fieldId)`, `submitDocument(docId)`, `submitSignature(docId, values[])`, `deleteDocument(docId)` — match §7 of the spec.
