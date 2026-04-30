# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Product

**portal.winlab.tw** — WinLab 的內部 Portal。根域名 `portal.winlab.tw` 下掛多個業務 app（`/bento`、`/invoice`、`/approval`…），每個 app 由不同人維護、業務邏輯獨立，但共用：

- **Auth**：Supabase Auth，OIDC provider 為 Keycloak
- **Profile / session**：跨所有 app 一份
- **Coding style、元件庫、架構骨架**

業務 app = `apps/portal/app/<name>/` 底下的 route segment，**不是** 獨立的 Turborepo workspace。要新增 app 就在 `apps/portal/app/` 下開資料夾，別去 `apps/*` 開新 Next.js。

**例外**：若該 app 的 design system 跟 portal **明顯不同**（不同字體、不同版面 metaphor），才允許獨立 subdomain workspace。目前唯一一個是 `apps/gallery`（`gallery.winlab.tw`，Instrument Serif、拍立得錯落 layout）。新建獨立 workspace 前先問 maintainer，不要因為怕碰共用骨架就直接開新 workspace 偷懶 —— 這是 owner 意識問題。

## 技術棧

- **Bun** 1.3+（`packageManager` 鎖定）— 一律 `bun` / `bunx`，不要 `npm` / `pnpm`
- **Turborepo** 2.x — 所有指令從 root 跑
- **Next.js 16** App Router + React 19 + Turbopack dev
- **Tailwind v4** + **shadcn/ui**（radix-luma style、neutral base、tabler icons）
- **Supabase** JS SDK + `@supabase/ssr`（browser / server / middleware 三分）
- **Keycloak** 作為 Supabase 的 OIDC provider（在 Supabase Dashboard 配置，不在 code）

## Commands

```bash
bun install                      # 會跑 `prepare` 自動裝 husky hooks
bun run dev                      # 所有 dev（web 跑 next dev --turbopack on :3000）
bun run build                    # turbo build（尊重 ^build 相依）
bun run lint                     # eslint
bun run typecheck                # tsc --noEmit
bun run format                   # prettier --write

bun run dev --filter=portal         # 只跑 portal
turbo run typecheck --filter=portal # 繞過 bun wrapper 直接下 turbo
```

無 test runner，別亂裝，要加先問。

### Git hooks（husky）

`bun install` 後 hooks 自動 active：

- **pre-commit** → `lint-staged`：對 staged 檔跑 `prettier --write` + `eslint --fix --max-warnings=0`。`.ts/.tsx/.js/.mjs/.cjs` 會跑全套，`.json/.md/.yml/.yaml/.css` 只跑 prettier
- **commit-msg** → `commitlint`：擋下不符 Conventional Commits 的 message（`feat:` / `fix:` / `chore:` / `docs:` / `refactor:` / `test:` / `perf:` / `style:`），上限 100 字

寫 commit message 時照 `<type>: description` 就好，`description` 用英文、有人味。完整 branch / PR / review 規範在 `CONTRIBUTING.md`。

## 架構

### Monorepo 拓撲

- `apps/portal` — 主消費端 Next.js app（workspace 名稱就叫 `portal`，跑 :3000）。多數業務 route（`/bento`、`/approve`、`/leave`、`/profile`…）都進這裡。
- `apps/gallery` — `gallery.winlab.tw`，獨立 subdomain workspace（跑 :3001）。Design system 跟 portal 不同（Instrument Serif、拍立得錯落 layout），但共用 `@workspace/ui` 的 `<PortalShell>` 四角骨架。
- `apps/mcp` — MCP server，對外暴露 portal 資料的 MCP 介面。
- `packages/ui` — 設計系統 + shadcn 元件的**唯一真實源**，所有 app 共用。`<PortalShell containerClassName=...>` 在這裡，gallery 與 portal 都從這裡 import。
- `packages/eslint-config` — flat config 三個 preset：`base` / `next-js` / `react-internal`
- `packages/typescript-config` — `base.json` / `nextjs.json` / `react-library.json`

### Path aliases

- `@/*` → 各 app 自己的 root（在 `apps/portal/tsconfig.json` 與 `apps/gallery/tsconfig.json` 各自指）
- `@workspace/ui/*` → `packages/ui/src/*`（跨 workspace）

### Supabase 分層（住在 `apps/portal/lib/supabase/`）

| File                                | 用途                                                       | 可以 import 的地方                                |
| ----------------------------------- | ---------------------------------------------------------- | ------------------------------------------------- |
| `client.ts` → `createClient()`      | browser client                                             | Client Components（`"use client"`）、hooks        |
| `server.ts` → `createClient()`      | server client，讀 `next/headers` cookies                   | Server Components、Route Handlers、Server Actions |
| `middleware.ts` → `updateSession()` | request-level session refresh + 未登入時導向 `/auth/login` | 只給 root `middleware.ts` 使用                    |

> Fluid compute 警告（寫在 `server.ts` / `middleware.ts` 的註解）：**不要** 把 Supabase client 放全域變數，每次請求要新建一個。

**路由級 auth gating 已啟用** — `apps/portal/middleware.ts` 呼叫 `updateSession()`，未登入自動導向 `/auth/login`。白名單走 pathname 前綴：`/login` 與 `/auth/*`（login、callback、auth-code-error）不擋。

```ts
// apps/portal/middleware.ts
import { type NextRequest } from "next/server"
import { updateSession } from "@/lib/supabase/middleware"

export async function middleware(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
```

因此 protected page 不用再自己 `redirect("/auth/login")` — middleware 擋下。Server Component 可以直接 `const user = (await getCurrentUser())!` 信任 non-null。例外：`/auth/login` 自己需要 `if (user) redirect("/")` 當「已登入就離開 login 頁」的 UX，這是業務邏輯不是 protection。

### Auth（Keycloak via Supabase OIDC）

**Dashboard 配置清單**（全在 Supabase + Keycloak 控制台做，不進 repo）：

1. Keycloak realm → 建一個 client，"Client Protocol" = `openid-connect`，"Access Type" = `confidential`
2. Keycloak client → "Valid Redirect URIs" 加 `https://yissfqcdmzsxwfnzrflz.supabase.co/auth/v1/callback`
3. Keycloak client → 抄下 `Client ID`（Settings 分頁）與 `Client Secret`（Credentials 分頁）
4. Keycloak realm settings → OpenID Endpoint Configuration → 抄下 `issuer`（這個是 `Keycloak URL`）
5. Supabase Dashboard → Authentication → Providers → Keycloak → 填 Client ID / Secret / Keycloak URL
6. Supabase Dashboard → Authentication → URL Configuration → Redirect URLs 加本地 `http://localhost:3000/auth/callback` 與 production `https://portal.winlab.tw/auth/callback`

**Sign in**：

```ts
// client component
const supabase = createClient()
await supabase.auth.signInWithOAuth({
  provider: "keycloak",
  options: {
    scopes: "openid", // Keycloak 22+ 硬性要求，只給 openid
    redirectTo: `${location.origin}/auth/callback`, // PKCE flow 的回跳點
  },
})
```

> ⚠️ scope 只給 `"openid"`，不要加 `profile email`。Keycloak 22+ 對 scope 很嚴，多塞會拒絕。profile / email claims 在 `openid` scope 下就會帶回來。

**Callback（PKCE code → session exchange）**：已實作於 `apps/portal/app/auth/callback/route.ts`，負責 `exchangeCodeForSession` 並處理 `x-forwarded-host`（reverse proxy 後方也能跑）。錯誤時導到 `/auth/auth-code-error`，那頁需要你自己做。

**Sign out**：

```ts
await supabase.auth.signOut()
```

**讀當前使用者**：middleware 與 server 端優先用 `supabase.auth.getClaims()`（claims 在 JWT 裡，免打 Auth API）；只有要同步新鮮 profile 時才用 `getUser()`。

### SDK-first 原則（重要）

**非必要不寫 Next.js API route / Route Handler。** 優先順序：

1. **Server Component + `server.ts` 的 `createClient()`** — 讀資料的主場
2. **Server Action** — 寫入 / mutation
3. **Client Component + `client.ts`** — 需要即時互動（realtime subscribe、optimistic UI）
4. **Route Handler** — 只有在下列情境才開：Webhook 接收、第三方 OAuth callback、需要非 Supabase cookie/header 操作、檔案 streaming

RLS 是資料層防線，不要為了安全在 API route 包一層。RLS policy 寫清楚比 API route 可靠。

## Coding Style（跟 https://supabase.com/ui 對齊）

把一個 feature 的東西**分開放**，不要全部塞一個檔案：

```
apps/portal/
├─ app/<feature>/
│  ├─ page.tsx              # 純頁面組裝
│  └─ _components/          # 只在這個 feature 用的 UI 片段
├─ components/<feature>-*.tsx   # 跨 feature 共用的組合元件
├─ hooks/use-<feature>.ts       # stateful 行為 / side effect
└─ lib/<feature>/              # 純邏輯、data access、schema

packages/ui/src/
├─ components/*.tsx         # shadcn primitives（Button、Input…）
├─ lib/*.ts                 # cn、utils
└─ hooks/*.ts               # 純 UI 狀態 hook
```

規則：

- **components** 吃 props 渲染 UI；不直接呼 Supabase
- **hooks** 管 state 與 side effect；Supabase client 在這層被呼叫
- **lib** 放 pure function、schema、query builder；不依賴 React
- **Server Component** 直接 call `createClient()` 取資料，把結果 prop 傳給 Client Component

### Reference: `bento` app（多層業務 app 範本）

`apps/portal/app/bento/` 是目前最完整的業務 app，新 app 照這個版型做即可：

```
apps/portal/
├─ app/bento/
│  ├─ layout.tsx                          # Toaster + QueryProvider + RealtimeNotifications + PortalShell
│  ├─ page.tsx                            # /bento — orders list
│  ├─ menus/page.tsx                      # /bento/menus — restaurant CRUD
│  ├─ orders/[id]/page.tsx                # /bento/orders/[id] — order detail
│  └─ _components/                        # 只有 bento 用的 UI（order-card、restaurant-card、…）
├─ hooks/bento/                           # bento-only data hooks（use-orders、use-menus、…）
│  └─ query-keys.ts                       # TanStack Query keys，全以 ["bento", …] 開頭 namespace 隔離
└─ lib/bento/                             # bento 型別與純工具（types.ts、date.ts、menu.ts）
```

- **TanStack Query 只在 bento 用**：所以 `QueryProvider` 留在 `bento/layout.tsx`，不上提到 root
- **Toaster 也在 bento layout**：其他 app 要用 toast 時再提到 root layout（目前 YAGNI 不上提）
- **AuthProvider 在 root layout**（跨 app 共用 user state），bento hooks 用 `@/hooks/use-auth`
- **Admin 是 app-scoped**：`useAdmin()` 讀 `user_profiles.roles.bento = ["admin"]`，權限範圍不跨 app

### Feedback UX 規範

- **Notification**（成功/失敗訊息）一律用 `sonner` 的 `toast.success()` / `toast.error()`，不要用 `alert()`
- **Destructive 確認**（刪除、不可逆操作）用 `_components/confirm-dialog.tsx`（shadcn `AlertDialog`），不要用 `confirm()`
- `<Toaster />` 放在需要的 app layout 內（例：`bento/layout.tsx`），不重複掛

### 加 shadcn 元件

**root 目錄**下：

```bash
bunx shadcn@latest add <component> -c apps/portal
```

儘管帶 `-c apps/portal`，檔案會因 `apps/portal/components.json` alias 寫入 `packages/ui/src/components/`。別手動往 `apps/portal/components/` 丟原始 shadcn primitive。

### 加 Supabase UI（註冊過 `@supabase` namespace）

```bash
bunx shadcn@latest add @supabase/<item>
# 例：@supabase/password-based-auth-nextjs、@supabase/realtime-cursor…
```

registry 定義在 `apps/portal/components.json` 的 `registries."@supabase"` 欄位。

## Design System

Layout 統一由 `apps/portal/components/portal-shell.tsx` 的 `<PortalShell>` 負責。骨架是**中央內容 + 四角 fixed** —— 靈感對齊 [www.winlab.tw](https://github.com/NYCU-WinLab/www.winlab.tw)。

```tsx
<PortalShell appName="Profile">{children}</PortalShell>
```

| 角落 | 內容                                                         | 狀態 |
| ---- | ------------------------------------------------------------ | ---- |
| 左上 | appName，連結 `appHref`（預設 `/`），通常指向該 app 自己首頁 | 實作 |
| 右下 | `© {new Date().getFullYear()}`                               | 實作 |
| 右上 | `topRight?: ReactNode` slot — app 內 nav                     | slot |
| 左下 | `bottomLeft?: ReactNode` slot — 返回 portal 首頁入口         | slot |

Corner 容器樣式鎖死：`fixed z-50 p-6 text-muted-foreground text-xs`。TR/BL 為 **optional slot props**（`topRight?` / `bottomLeft?`），app 只傳內容不傳樣式，一致性由 shell 保障。TL 的 `appHref` 預設 `/`（給 portal / 單層 app 如 profile 用）；多層 app（如 bento）應傳 `appHref="/bento"` 讓 TL 作為 app home，並用 BL 放 `<Link href="/">Portal</Link>` 當回主頁入口。

中央內容容器：`mx-auto w-full max-w-2xl px-6 py-20`。寬度 2xl、上下各 5rem 確保 corner 不覆蓋內容。短頁要視覺置中在自己內容上加 `min-h-[60vh] flex-col justify-center`。

**每個 route 自己決定 `appName`**（Portal、Profile、Bento…）。不在 root `layout.tsx` 統一設，避免全 app 綁死同一名字；多層 sub-route 的 app 則在該 app 的 `layout.tsx` 包一次 shell。

## 風格約定

- **Prettier**：無分號、雙引號、2-space、`printWidth: 80`、`trailingComma: "es5"`。`prettier-plugin-tailwindcss` 自動排 class；`cn` / `cva` 已註冊為 Tailwind function。
- **ESLint**：root `.eslintrc.js` 只設 `ignorePatterns`，真規則在各 workspace 透過 `@workspace/eslint-config` 載入。
- **Theme**：`apps/portal/components/theme-provider.tsx` 包 `next-themes`，註冊了全域 `d` 鍵切 dark mode（輸入框時停用）。不要重複這段邏輯。
- **Commit**：Conventional Commits，description 用英文、有人味；不加 Co-Authored-By。

## Env

`apps/portal/.env.local`（已 gitignore）：

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
```

範本 `apps/portal/.env.example` 會進 repo。新 env key 一律兩邊同步加。
