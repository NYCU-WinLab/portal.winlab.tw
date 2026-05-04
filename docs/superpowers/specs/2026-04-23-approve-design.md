# Approve App — Design Spec

- **Date**: 2026-04-23
- **Branch**: `feat/approve-app`
- **Owner**: Loki
- **Status**: Draft (pending user review)

## 1. Overview

Portal 下的新業務 app `/approve`，功能概念參考舊 `approve.winlab.tw` 但不完全等價 — 整合進 portal design system、新增文字方塊 + 分類預填。提供文件簽核 workflow：

- 三 tab dashboard：**代簽 / 已簽 / 送簽**
- 送簽者上傳 PDF、拖放簽名方塊與文字方塊、把每個方塊指派給特定 WinLab 成員
- 簽核者開啟只看到自己的方塊，個人欄位自動預填，簽名支援手繪或上傳
- 預填值跨文件共享：第一次填完自動儲存，下次同類欄位自動帶入
- 送簽有草稿機制，隨時可離開再回來繼續

## 2. Scope

### 2.1 In scope (本 sprint)

- Dashboard 三 tab + 代簽 tab 未處理數 badge
- PDF 上傳 + 送簽編輯器（拖放方塊、assign signer、auto-save draft）
- 簽核頁（僅見自己方塊 + 預填 + 簽名 pad）
- 簽名 pad 支援手繪與上傳圖檔
- 預填值跨文件持久化（signature / contact_address / household_address / id_number / phone）
- 唯讀檢視（`/approve/view/[id]`）：creator 追蹤所有 signer 進度；signer 回看已簽
- 舊 approve 相關 tables 砍掉（legacy cleanup）

### 2.2 Out of scope (下次 sprint)

- Email / IM 通知（signer 被送簽、完成都不主動通知，靠打開 portal 看 badge）
- 順序簽核（sequential signing）— 本版任一 signer 任意順序都能簽
- 一次送多份 PDF
- 下載「已把 value 烙進去」的最終合併 PDF 檔（UI 看得到簽完結果即可）
- 送出後撤回（schema 留 `cancelled` status，UI 不暴露）
- 草稿到期自動清除（永久保留直到 creator 刪）

## 3. Tech Stack

以 portal 既有棧為主，新增 PDF 相關三個 lib：

| Layer              | Package                  | 用途                                   |
| ------------------ | ------------------------ | -------------------------------------- |
| PDF render         | `react-pdf`              | 顯示 PDF 給使用者看                    |
| PDF 拖拉           | `@dnd-kit/core`          | 方塊擺放、resize                       |
| 簽名手繪           | `react-signature-canvas` | 簽名 pad canvas                        |
| PDF 編輯（pass 2） | `pdf-lib`                | 後期若要輸出合併 PDF（本 sprint 不用） |

既有棧不變：Next.js 16 App Router、React 19、Tailwind v4、shadcn/ui、Supabase SDK（@supabase/ssr）、TanStack Query（跟 bento 一樣只在 approve scope 內用）。

## 4. Data Model

### 4.1 Tables (SQL)

所有表以 `approve_*` 前綴 namespace，對齊 bento / debit convention。

```sql
-- 文件本體
create table approve_documents (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  file_path     text not null,
  status        text not null default 'draft'
                  check (status in ('draft','pending','completed','cancelled')),
  created_by    uuid not null references user_profiles(id) on delete cascade,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  completed_at  timestamptz
);

-- 每份文件要誰簽 + 該人的進度
create table approve_signers (
  id            uuid primary key default gen_random_uuid(),
  document_id   uuid not null references approve_documents(id) on delete cascade,
  signer_id     uuid not null references user_profiles(id) on delete cascade,
  status        text not null default 'pending'
                  check (status in ('pending','signed')),
  signed_at     timestamptz,
  created_at    timestamptz not null default now(),
  unique (document_id, signer_id)
);

-- 方塊（送簽擺的 box / 簽核填的值都在這）
create table approve_fields (
  id            uuid primary key default gen_random_uuid(),
  document_id   uuid not null references approve_documents(id) on delete cascade,
  signer_id     uuid not null references user_profiles(id) on delete cascade,
  page          int  not null check (page >= 1),
  x             numeric not null check (x >= 0 and x <= 1),
  y             numeric not null check (y >= 0 and y <= 1),
  width         numeric not null check (width > 0 and width <= 1),
  height        numeric not null check (height > 0 and height <= 1),
  category      text not null
                  check (category in (
                    'signature',
                    'contact_address',
                    'household_address',
                    'id_number',
                    'phone',
                    'other'
                  )),
  label         text,
  value         text,
  signed_at     timestamptz,
  created_at    timestamptz not null default now()
);

-- 使用者預填值（跨文件共享；signer 第一次填後自動儲存）
create table approve_user_field_values (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references user_profiles(id) on delete cascade,
  category      text not null
                  check (category in (
                    'signature',
                    'contact_address',
                    'household_address',
                    'id_number',
                    'phone'
                  )),
  value         text not null,
  updated_at    timestamptz not null default now(),
  unique (user_id, category)
);

-- 索引（常用查詢路徑）
create index approve_signers_inbox
  on approve_signers (signer_id, status)
  where status = 'pending';
create index approve_signers_signed
  on approve_signers (signer_id, status, signed_at desc)
  where status = 'signed';
create index approve_documents_created_by
  on approve_documents (created_by, created_at desc);
create index approve_fields_document_signer
  on approve_fields (document_id, signer_id);
```

**底層邏輯說明**：

- **座標全部 normalized 0..1**（相對頁面寬/高），不存 px。A4/Letter / 不同螢幕渲染都不跑位
- **簽名與其他預填值放同一張表** `approve_user_field_values`，以 `category='signature'` 識別；`value` 存 base64 data URL（純文字簽名與 base64 圖都是 string）
- `approve_fields.category='other'` 不會預填、不會寫入 `approve_user_field_values`
- `approve_documents.status` 起點是 `'draft'`，送出時才變 `'pending'`

### 4.2 RLS Policies

| Table                       | SELECT                                         | INSERT                       | UPDATE                                                                                        | DELETE                                                 |
| --------------------------- | ---------------------------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `approve_documents`         | creator OR (me in signers)                     | creator = `auth.uid()`       | creator（含 status 轉換）                                                                     | creator & status in ('draft','pending')                |
| `approve_signers`           | parent doc creator OR `signer_id = auth.uid()` | parent doc creator           | `signer_id = auth.uid()`（改 status/signed_at）                                               | parent doc creator & doc.status in ('draft','pending') |
| `approve_fields`            | creator OR `signer_id = auth.uid()`            | creator & doc.status='draft' | `signer_id = auth.uid()`（寫 value/signed_at）or creator & doc.status='draft'（編輯器改位置） | creator & doc.status='draft'                           |
| `approve_user_field_values` | self                                           | self                         | self                                                                                          | self                                                   |

> 「signer 只看到自己的 field」是在 DB 層擋（RLS），不只 UI 擋。即使直接對 DB 下 query 也只回得到自己的方塊。

草稿階段 (`status='draft'`) 只有 creator 可見可改（`approve_signers` SELECT 已限 creator OR self，草稿通常還沒加 signers，不會外洩）。送出後 `status='pending'`，signers 才拿到讀取權限。

### 4.3 Storage

- Bucket: `approve-documents`（private）
- Path: `{document_id}/original.pdf`
- Storage RLS 對齊 `approve_documents` 的 SELECT / INSERT policy（creator 寫、creator + signers 讀；草稿階段僅 creator）

### 4.4 Legacy Cleanup (Migration)

舊 `approve.winlab.tw` 的 tables 全砍（使用者確認可丟）：

```sql
drop table if exists public.document_signers cascade;
drop table if exists public.signature_boxes  cascade;
drop table if exists public.user_signatures  cascade;
drop table if exists public.documents        cascade;
```

## 5. Routes & Folder Structure

### 5.1 Routes

| Path                 | 角色       | 備註                                              |
| -------------------- | ---------- | ------------------------------------------------- |
| `/approve`           | Dashboard  | 三 tab：代簽 / 已簽 / 送簽                        |
| `/approve/new`       | 新送簽入口 | 建 draft 後 `router.replace('/approve/new/[id]')` |
| `/approve/new/[id]`  | 編輯 draft | auto-save；送出後 redirect `/approve`             |
| `/approve/sign/[id]` | 簽核頁     | 只給 signer 看自己方塊                            |
| `/approve/view/[id]` | 唯讀       | creator 追蹤全貌；signer 回看已簽                 |

Auth gating 已由 root `middleware.ts` 處理（未登入 redirect `/auth/login`），新 route 不需自行 redirect。

### 5.2 Folder Structure

```
apps/portal/
├─ app/approve/
│  ├─ layout.tsx                    # QueryProvider + PortalShell(Approve) + Toaster
│  ├─ page.tsx                      # /approve — 三 tabs
│  ├─ new/page.tsx                  # /approve/new — 建 draft redirect
│  ├─ new/[id]/page.tsx             # /approve/new/[id] — 編輯 draft
│  ├─ sign/[id]/page.tsx            # /approve/sign/[id]
│  ├─ view/[id]/page.tsx            # /approve/view/[id]
│  ├─ actions.ts                    # Server Actions
│  └─ _components/
│     ├─ document-dashboard.tsx
│     ├─ document-card.tsx
│     ├─ document-editor.tsx        # 送簽 — draft 模式 auto-save
│     ├─ signer-picker.tsx
│     ├─ field-palette.tsx
│     ├─ field-overlay.tsx          # 編輯+簽核共用
│     ├─ signer-badge.tsx
│     ├─ signing-view.tsx
│     ├─ signature-pad.tsx
│     ├─ document-view.tsx          # 唯讀檢視
│     ├─ save-indicator.tsx         # 「已儲存 · 剛才」顯示
│     └─ confirm-dialog.tsx         # 已在 bento 下，evaluate 是否上提 components/
├─ hooks/approve/
│  ├─ query-keys.ts                 # ["approve", ...] namespace
│  ├─ use-documents.ts              # inbox / signed / sent lists
│  ├─ use-document.ts               # detail (含 signers + fields)
│  ├─ use-fields.ts                 # CRUD fields (編輯器 debounced write)
│  ├─ use-user-values.ts            # 讀預填值 + upsert (on sign submit)
│  ├─ use-signature.ts              # 讀 signature data URL + upsert
│  ├─ use-signers.ts                # add/remove signer for draft
│  └─ use-inbox-count.ts            # 代簽 badge 數字
└─ lib/approve/
   ├─ types.ts                      # Document / Signer / Field / UserValue / Category
   ├─ field-categories.ts           # 6 種 category 定義 (id + label + icon)
   ├─ pdf.ts                        # react-pdf loader helpers
   └─ storage.ts                    # Supabase Storage path helpers
```

對齊 bento 既有 convention：feature UI 在 `_components/`、stateful hooks 在 `hooks/approve/`、pure logic 在 `lib/approve/`。

## 6. UX / Flows

### 6.1 Dashboard (`/approve`)

```
┌─────────────────────────────────────────────────────────────┐
│ Approve                                           [+ 送簽]  │
│                                                             │
│ [ 代簽 (3) ]  [ 已簽 ]  [ 送簽 ]                              │
│                                                             │
│ ┌──────────────────────────────────────────────────────┐    │
│ │ 📄 申請書                                             │    │
│ │    送簽：Alice · 2026-04-20                           │    │
│ └──────────────────────────────────────────────────────┘    │
│ ┌──────────────────────────────────────────────────────┐    │
│ │ 📄 設備借用單                                          │    │
│ │    送簽：Bob · 2026-04-19                             │    │
│ └──────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

| Tab                          | Query                                                            | 卡片點下去                                                            |
| ---------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------- |
| 代簽 (badge = pending count) | `approve_signers WHERE signer_id=me AND status='pending'`        | `/approve/sign/[id]`                                                  |
| 已簽                         | `approve_signers WHERE signer_id=me AND status='signed'`         | `/approve/view/[id]`                                                  |
| 送簽                         | `approve_documents WHERE created_by=me ORDER BY updated_at DESC` | `/approve/new/[id]` (若 status='draft') / `/approve/view/[id]` (其他) |

- 代簽 badge 在 count > 0 時顯示，數字取自 `useInboxCount()`
- 送簽卡片左上角小 badge 顯示狀態：`草稿 / 送簽中 / 已完成 / 已取消`
- TanStack Query 設 `refetchOnWindowFocus: true`，不需 realtime subscription

### 6.2 送簽編輯器 (`/approve/new` → `/approve/new/[id]`)

**進入 flow**：

1. 使用者點 dashboard `[+ 送簽]` → 導向 `/approve/new`
2. `/approve/new` 的 Server Component `insert approve_documents (status='draft', title='未命名')`，拿到 id
3. `redirect('/approve/new/[id]')` (Next.js `redirect()`)
4. 之後使用者不論 reload / 返回都走 `/approve/new/[id]`

**UI 佈局**：

```
┌───────────────────────────────────────────────────────────────────┐
│ /approve/new/[id]                                                 │
│ Title: [ 申請書         ]             已儲存 · 剛才  [ 送出 ]       │
│                                                                   │
│ Signers: [Alice ×] [Bob ×]  [+ 加 signer]                         │
│                                                                   │
│ ┌─ Palette ─┐  ┌──────────────────────────────────────────┐       │
│ │ 簽名       │  │ PDF page 1/3                            │       │
│ │ 聯絡地址   │  │                                          │       │
│ │ 戶籍地址   │  │   [field] (A)                            │       │
│ │ 身分證     │  │     ↑ Alice (color dot)                  │       │
│ │ 手機      │  │                                          │       │
│ │ 其他       │  │                                          │       │
│ └───────────┘  │                                          │       │
│                └──────────────────────────────────────────┘       │
│                                                                   │
│ [ 上一頁 ] Page 1/3 [ 下一頁 ]                                     │
└───────────────────────────────────────────────────────────────────┘
```

**互動細節**：

- **上傳 PDF**：第一次進入時顯示 upload zone；成功上傳到 Storage (`approve-documents/{id}/original.pdf`) 後 update `approve_documents.file_path`
- **Signer picker**：multi-select shadcn Command + Popover，從 `user_profiles` 拉；顯示時 `LEFT JOIN members ON lower(email)` 取 `avatar_url` / `role`；每個 signer 配一個 color dot 用來標方塊指派
- **Field palette**：6 個 button，click 一個 button 進入「placement mode」（cursor 變 crosshair）→ click PDF 某處 → 生成方塊（預設大小：signature 20% × 8%；text 30% × 5% normalized）
- **Field overlay**：`dnd-kit` draggable，四角 resize handle；右上角 `SignerBadge` (color dot + initial) click 開 popover 改指派
- **`other` 方塊**：額外顯示 small label input（送簽者填用途，例「請填 extension」）
- **刪除方塊**：hover 右上角顯示 `×`
- **分頁**：react-pdf `numPages` 拿總頁數；頁面下方有分頁 nav

**Auto-save**：

- Field 位置變動（drag / resize）→ debounce 500ms → `upsert approve_fields`
- Field 刪除 / 新增 → 即時 delete / insert
- Title 變動 → debounce 500ms → update `approve_documents.title`
- Signer 變動 → 即時 insert/delete `approve_signers`
- `approve_documents.updated_at` 透過 DB trigger 或在 Server Action 每次寫入時手動更新
- 右上角 `<SaveIndicator>` 顯示 `儲存中... / 已儲存 · {relative_time}`

**Validation (送出前)**：

- `title` 非空
- `file_path` 非空（已上傳 PDF）
- `approve_signers` 至少一筆
- 每個 signer 至少有一個 `approve_fields`
- 每個 `approve_fields.signer_id` 在 `approve_signers` 內

Client 先擋、Server Action 再驗一次（trust but verify）。

**送出**：

```ts
// apps/portal/app/approve/actions.ts
async function submitDocument(documentId: string) {
  // 1. Validate (所有上列條件)
  // 2. update approve_documents set status='pending' where id=? and created_by=me and status='draft'
  // 3. revalidatePath('/approve')
  // 4. redirect('/approve')
}
```

### 6.3 簽核頁 (`/approve/sign/[id]`)

**Server Component 預載**：

- document row
- my signer row (`signer_id = me`)
- 若無 → `notFound()`
- 若 `my_signer.status='signed'` → `redirect('/approve/view/[id]')`
- my fields (RLS 已過濾)
- my `approve_user_field_values` (for 預填)

**UI 佈局**：

```
┌───────────────────────────────────────────────────────────────────┐
│ /approve/sign/[id]                                                │
│ 申請書                                  送簽者：Alice               │
│                                                                   │
│ ┌──────────────────────────────────────────────────────────────┐  │
│ │ PDF page 1/3                                                 │  │
│ │                                                              │  │
│ │   [signature box]  [text box 聯絡地址 (預填)]                  │  │
│ │                                                              │  │
│ └──────────────────────────────────────────────────────────────┘  │
│                                                                   │
│ [ 上一頁 ] Page 1/3 [ 下一頁 ]      進度：3/5                      │
│                                                                   │
│ [ 返回 ]                          [ 送出簽核 ] (primary)            │
└───────────────────────────────────────────────────────────────────┘
```

**預填邏輯（初始化 local state）**：

```ts
for (const field of myFields) {
  if (field.category === "other") {
    state[field.id] = ""
  } else {
    const saved = userFieldValues.find((v) => v.category === field.category)
    state[field.id] = saved?.value ?? ""
  }
}
```

**互動**：

- **signature field**：click 開啟 shadcn Dialog 內嵌 `<SignaturePad>`
- **text field (predefined)**：inline `<input>`，value 為預填值，可修改（修改後會覆蓋 `approve_user_field_values` 的 saved）
- **text field (`other`)**：inline `<input>`，`placeholder = field.label ?? '請填寫'`

**送出 validation**：所有 `myFields` 的 value 非空。

**Server Action `submitSignature(documentId, values)`**：

```ts
// 1. update approve_fields set value=?, signed_at=now()
//    where document_id=? and signer_id=me and id in (...)
// 2. upsert approve_user_field_values (exclude 'other' categories)
//    包含 category='signature' 的 base64
// 3. update approve_signers set status='signed', signed_at=now()
//    where document_id=? and signer_id=me
// 4. if (select count(*) from approve_signers where document_id=? and status='pending') = 0
//    then update approve_documents set status='completed', completed_at=now()
// 5. revalidatePath('/approve')
// 6. redirect('/approve')
```

依賴 Supabase 的隱式 statement ordering；因為 RLS 限制，所有 update 只會影響自己的 row，即使沒交易也不會寫到他人資料。步驟 4 的 check-and-update 若有 race（兩個 signer 同時按最後一個送出）可能都 update success，但都設 status='completed'，最終狀態一致，無害。

### 6.4 簽名 Pad (`<SignaturePad>`)

shadcn Dialog，內含 `<Tabs>` 兩個 tab：**手繪 / 上傳**。

```
┌──────────────────────────────────────┐
│ 簽名                             [×] │
│                                      │
│ [ 手繪 ] [ 上傳 ]                      │
│ ───────                              │
│                                      │
│  ┌────────────────────────────────┐  │
│  │ (react-signature-canvas)       │  │
│  │                                │  │
│  └────────────────────────────────┘  │
│                                      │
│  上次簽名：[thumbnail] [套用]          │
│                                      │
│  [ 清除 ]          [ 取消 ] [ 確認 ]   │
└──────────────────────────────────────┘
```

- **手繪 tab**：`react-signature-canvas`，`toDataURL('image/png')` 產出 base64
- **上傳 tab**：`<input type="file" accept="image/png,image/jpeg,image/svg+xml">` → `FileReader.readAsDataURL` → base64；顯示 preview，允許重選
- **「上次簽名」區塊**：若 `approve_user_field_values.category='signature'` 有值，顯示 thumbnail + 「套用」button — 點「套用」直接把該 base64 data URL 當 dialog 結果回寫 `field.value`，不進 canvas 編輯（讓使用者快速重用）
- **確認**：回寫 `field.value = dataUrl`；實際 persist 到 `approve_user_field_values` 延後到 `submitSignature` 時 upsert（避免每簽一份就打一次 DB）

### 6.5 唯讀檢視 (`/approve/view/[id]`)

Server Component 先判身份與狀態：

| me 的身份 / 狀態 | 動作                                              |
| ---------------- | ------------------------------------------------- |
| creator          | render creator 模式                               |
| signer 已簽      | render signer 模式                                |
| signer 未簽      | `redirect('/approve/sign/[id]')` (該去簽不是回看) |
| 與此 doc 無關    | `notFound()` (RLS 也會擋)                         |

**Render 模式**：

- **me = creator**：
  - PDF + 所有方塊（已簽顯示 value；未簽顯示灰底 + "待 {signer_name} 簽"）
  - 側欄 signer 進度列表：`{avatar} {name} · pending | signed · {signed_at}`
- **me = signer (且已簽)**：
  - PDF + 自己方塊 (readonly input 顯示 value)
  - 側欄 signer 進度列表（含 self + 其他人狀態）

## 7. Server Actions（總表）

| Action                | 參數                 | 描述                                                                     |
| --------------------- | -------------------- | ------------------------------------------------------------------------ |
| `createDraft`         | —                    | 建 `approve_documents (status='draft')`，redirect 到 `/approve/new/[id]` |
| `uploadPdf`           | `docId, file`        | 上傳到 Storage，update `approve_documents.file_path`                     |
| `updateDocumentTitle` | `docId, title`       | debounced title update                                                   |
| `setSigners`          | `docId, signerIds[]` | 同步 signer list（diff insert/delete）                                   |
| `upsertField`         | `docId, field`       | 編輯器 debounced field write（位置/大小/category/label/assign）          |
| `deleteField`         | `fieldId`            | 編輯器刪方塊                                                             |
| `submitDocument`      | `docId`              | validate → status: draft → pending                                       |
| `submitSignature`     | `docId, values`      | 見 6.3 五步驟                                                            |
| `deleteDocument`      | `docId`              | creator 刪自己的 document（draft 或 cancelled）                          |

每一個都在 Server Action 層做 auth + RLS 再驗（不完全依賴 RLS 作為唯一防線）。

**Field id 由 editor 端先產生**（`crypto.randomUUID()`），`upsertField` 第一次寫就是 insert、之後 update；這樣 client 可樂觀 render 新方塊，不用等 server round-trip 回 id。

## 8. Field Category 定義

`lib/approve/field-categories.ts`：

```ts
export const FIELD_CATEGORIES = [
  { id: "signature", label: "簽名", icon: IconSignature, predefined: true },
  {
    id: "contact_address",
    label: "聯絡地址",
    icon: IconMapPin,
    predefined: true,
  },
  {
    id: "household_address",
    label: "戶籍地址",
    icon: IconHome,
    predefined: true,
  },
  { id: "id_number", label: "身分證", icon: IconId, predefined: true },
  { id: "phone", label: "手機", icon: IconPhone, predefined: true },
  { id: "other", label: "其他", icon: IconTextSize, predefined: false },
] as const
```

`predefined: true` 的 category 會走預填邏輯（讀 + upsert `approve_user_field_values`）。

## 9. Non-functional

### 9.1 Security

- RLS 是資料層主防線（見 4.2）
- Server Action 層 double-check：每個 action 先 `const user = await getCurrentUser()`，再用 user.id 做 WHERE 條件而非信任 client 傳入的 id
- Storage bucket RLS 對齊 `approve_documents` 的 SELECT
- Signature base64 儲存上限：Postgres text 理論 1GB，實務 Supabase row limit 遠低於此；簽名 PNG 大多 < 50KB，無風險

### 9.2 Performance

- 方塊座標用 normalized 0..1，render 時乘以 page 實際像素寬高
- 簽名預填值雖然是 base64，但一個 user 每 category 只一筆，總 payload 小
- Auto-save debounce 500ms 避免每 pixel 都打 DB
- Dashboard list query 都走 index（見 4.1 的 `create index`）

### 9.3 Accessibility

- Signature pad dialog 有 focus trap（shadcn Dialog 自帶）
- Field overlay 用真實 `<input>` / `<textarea>` 元素，screen reader 友善
- Palette 用 `<button>`，鍵盤可 focus + Enter

## 10. Component Interaction Map

```
DocumentDashboard
 ├── DocumentCard          (代簽/已簽/送簽)
 └── InboxBadge            (代簽 tab)

DocumentEditor (/approve/new/[id])
 ├── TitleInput            (debounced)
 ├── SaveIndicator
 ├── SignerPicker          (multi-select + join members)
 ├── FieldPalette          (6 categories)
 ├── PDFCanvas             (react-pdf)
 └── FieldOverlay[]        (dnd-kit draggable)
      └── SignerBadge      (popover to reassign)

SigningView (/approve/sign/[id])
 ├── PDFCanvas
 ├── FieldOverlay[]        (my fields only, readonly rects)
 │    ├── SignaturePad     (dialog on click)
 │    └── TextInput        (inline)
 └── SubmitButton

DocumentView (/approve/view/[id])
 ├── PDFCanvas
 ├── FieldOverlay[]        (readonly; creator 看全部 / signer 看 my)
 └── SignerProgress        (avatar + status list)
```

## 11. Decisions (原 Open Questions，對齊後定死)

- **Schema 方向**：新 `approve_*` namespace，舊 tables 砍
- **Signer pool**：`user_profiles`，顯示時 `LEFT JOIN members ON lower(email) = lower(email)` 取 avatar / role
- **PDF stack**：react-pdf + dnd-kit + pdf-lib（第一版只用到前兩個）
- **Signer 模型**：1:N 無順序（任一 signer 任意時間都能簽）
- **座標**：normalized 0..1
- **簽名儲存**：塞 `approve_user_field_values.category='signature'`，value 是 base64 data URL
- **Auto-save debounce**：500ms
- **PDF 大小上限**：50MB（Supabase 預設），超過 client 層擋
- **自送自簽**：允許（creator 也能是 signer）
- **`updated_at`**：用 DB trigger 自動維護，避免 Server Action 忘記寫

## 12. Implementation Phases（交給 writing-plans 拆）

粗略分 phase，實際 granularity 給 `writing-plans` skill 去細拆：

1. **Schema + RLS**：drop legacy, create new tables, policies, storage bucket
2. **App shell**：`/approve` route、layout、三 tab dashboard (static)
3. **Data hooks**：query-keys, use-documents, use-document, use-fields, use-user-values
4. **送簽編輯器 base**：`/approve/new/[id]`, PDF render, upload, title, signer picker
5. **送簽編輯器 fields**：field palette, overlay, dnd-kit drag/resize, signer assign
6. **送簽編輯器 auto-save**：debounce, save indicator, submit flow
7. **簽核頁**：`/approve/sign/[id]`, predefined value preload, text input fields, submit
8. **簽名 pad**：canvas + upload tabs, dialog, 預填 signature
9. **唯讀頁**：`/approve/view/[id]`, dual mode (creator / signed signer)
10. **代簽 badge**：use-inbox-count, tab badge render
11. **Polish**：toast feedback, confirm dialog for destructive (delete doc / field), empty states

## 13. Appendix — Reference

- 舊 approve.winlab.tw: https://github.com/zyx1121/approve.winlab.tw
- Bento app 作為新 app 範本：`apps/portal/app/bento/`
- Portal shell 規範：`CLAUDE.md § Design System`
- Supabase 分層：`CLAUDE.md § Supabase 分層`
