# CLAUDE.md

This file briefs Claude Code (claude.ai/code) when working in this repository.

## Product

**portal.winlab.tw** — WinLab's internal portal. The root domain hosts business apps (`/admin`, `/approve`, `/bento`, `/bulletin`, `/games`, `/leave`, `/meetings`, `/profile`, `/receipts`, `/reimburse`, `/trip`), each owned by different people but sharing:

- **Auth** — Supabase Auth, Keycloak as the OIDC provider
- **Profile / session** — one user state across the portal
- **Coding style, component library, layout chrome**

A business app is `apps/portal/app/<name>/` — a route segment, **not** a separate Turborepo workspace. To add one, drop a folder under `apps/portal/app/`. Don't open a new `apps/*` Next.js project.

**Exception**: when an app's design system genuinely diverges from portal (different fonts, different layout metaphor), break it out into a subdomain workspace. Today that's `apps/gallery` (`gallery.winlab.tw`, Instrument Serif, polaroid scatter). Ask the maintainer before opening a new workspace — don't open one just to dodge the shared shell. That's an owner-mindset issue.

## Stack

- **Bun** 1.3+ (`packageManager` is pinned) — always `bun` / `bunx`, never `npm` / `pnpm`
- **Turborepo** 2.x — run commands from the repo root
- **Next.js 16** App Router + React 19 + Turbopack dev
- **Tailwind v4** + **shadcn/ui** (radix-luma style, neutral base, tabler icons)
- **Supabase** JS SDK + `@supabase/ssr` (browser / server / proxy split)
- **Keycloak** as Supabase's OIDC provider (configured in dashboards, never in code)
- **TanStack Query** v5 for client-side data fetching where it's needed
- **pdf-lib** for receipt-archive PDF generation in the browser

## Commands

```bash
bun install                      # `prepare` script installs husky hooks
bun run dev                      # all dev servers (portal on :3000)
bun run build                    # turbo build (respects ^build deps)
bun run lint                     # eslint
bun run typecheck                # tsc --noEmit
bun run format                   # prettier --write

bun run dev --filter=portal         # portal only
turbo run typecheck --filter=portal # bypass the bun wrapper, call turbo directly
```

### Testing

Bun's built-in test runner (`bun test`) — no vitest/jest. Tests are colocated `*.test.ts` next to the code they cover, importing from `bun:test` and the workspace `@/` alias. `bun run test` → `turbo test` fans out to every workspace that defines a `test` script.

```bash
bun run test                     # all workspaces (turbo test)
cd apps/portal && bun test       # one workspace
```

Keep the pure logic in `lib/` (no React, no Supabase I/O) — that's what's unit-testable. RLS / SECURITY DEFINER policies are tested separately against Postgres (pgTAP via `supabase test db`, see `.github/workflows/db-tests.yml`), not by `bun test`.

### Git hooks (husky)

`bun install` activates the hooks:

- **pre-commit** → `lint-staged`: runs `prettier --write` and `eslint --fix --max-warnings=0` on staged files. `.ts/.tsx/.js/.mjs/.cjs` get the full pipeline; `.json/.md/.yml/.yaml/.css` only get prettier.
- **commit-msg** → `commitlint`: rejects messages that don't match Conventional Commits (`feat:` / `fix:` / `chore:` / `docs:` / `refactor:` / `test:` / `perf:` / `style:`), 100-character header limit.

Write commits as `<type>: description`, English, written like a person. Full branch / PR / review rules live in `CONTRIBUTING.md`.

### GitHub issue + PR workflow

**Before pushing and opening a PR**, always follow these steps:

1. **Check for an existing issue** — search with `gh issue list` or `gh issue list --search "<keyword>"`. If one already tracks the bug or feature, note its number.

2. **If no issue exists, create one first**:

```bash
gh issue create \
  --title "<concise title>" \
  --body "<what, why, and how to reproduce if a bug>" \
  --label "bug"         # or "enhancement", "documentation", etc. \
  --assignee "JaeggerJose"   # assign to the relevant person
```

Available labels: `bug`, `enhancement`, `documentation`, `duplicate`, `question`, `help wanted`, `good first issue`, `invalid`, `wontfix`, `dependencies`, `javascript`, `github_actions`.  
Known collaborators: `beenson`, `Tim7179`, `stanleyshen2003`, `N0Ball`, `JaeggerJose`, `zyx1121`, `Metabolism2003`, `qqqqq4545`, `Benedict-CS`.

3. **Reference the issue in the PR body** using `Closes #<number>` so GitHub auto-closes it on merge.

```bash
gh pr create --title "..." --body "$(cat <<'EOF'
Closes #<issue-number>

## Summary
...

## Test plan
- [ ] ...
EOF
)"
```

Never open a PR without a linked issue. Exceptions: typo fixes, dependency bumps, and trivial chores where an issue would be pure overhead.

## Architecture

### Monorepo topology

- `apps/portal` — the main Next.js app on `portal.winlab.tw` (workspace name `portal`, runs on :3000). Most business routes (`/admin`, `/approve`, `/bento`, `/bulletin`, `/games`, `/leave`, `/meetings`, `/profile`, `/receipts`, `/reimburse`, `/trip`) live here.
- `apps/gallery` — `gallery.winlab.tw`, an independent subdomain workspace (runs on :3005). Instrument Serif polaroid layout with custom `<GalleryShell>` chrome.
- `packages/ui` — the single source of truth for the design system and shadcn primitives. `<PortalShell>` lives here; portal and gallery (via its own shell) import from it.
- `packages/eslint-config` — flat-config presets: `base` / `next-js` / `react-internal`.
- `packages/typescript-config` — `base.json` / `nextjs.json` / `react-library.json`.

### Path aliases

- `@/*` → each app's own root (configured in `apps/portal/tsconfig.json` and `apps/gallery/tsconfig.json` separately)
- `@workspace/ui/*` → `packages/ui/src/*` (cross-workspace)

### Supabase layering (lives in `apps/portal/lib/supabase/`)

| File                                | Purpose                                                    | Where to import it                                |
| ----------------------------------- | ---------------------------------------------------------- | ------------------------------------------------- |
| `client.ts` → `createClient()`      | browser client                                             | Client Components (`"use client"`), hooks         |
| `server.ts` → `createClient()`      | server client, reads `next/headers` cookies                | Server Components, Route Handlers, Server Actions |
| `middleware.ts` → `updateSession()` | request-level session refresh + redirects to `/auth/login` | only the root `proxy.ts` should use this          |

> Fluid-compute caveat (also commented in `server.ts` / `middleware.ts`): never store the Supabase client in a global variable. Build a fresh one per request.

**Route-level auth gating is on** — `apps/portal/proxy.ts` (Next.js 16 renamed the `middleware.ts` convention to `proxy.ts`) calls `updateSession()` and redirects unauthenticated requests to `/auth/login`. The allow-list is pathname-prefix based: `/login` and `/auth/*` (login, callback, auth-code-error) skip the gate.

```ts
// apps/portal/proxy.ts
import { type NextRequest } from "next/server"
import { updateSession } from "@/lib/supabase/middleware"

export async function proxy(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
```

Because the proxy already gates protected pages, individual pages don't need their own `redirect("/auth/login")`. Server Components can do `const user = (await getCurrentUser())!` and trust the non-null. The exception is `/auth/login` itself, which uses `if (user) redirect("/")` to bounce already-authenticated users away — that's UX, not protection.

### Auth (Keycloak via Supabase OIDC)

Dashboard checklist (lives entirely in Supabase + Keycloak consoles, never in code):

1. Keycloak realm → create a client, "Client Protocol" = `openid-connect`, "Access Type" = `confidential`.
2. Keycloak client → "Valid Redirect URIs" = `https://yissfqcdmzsxwfnzrflz.supabase.co/auth/v1/callback`.
3. Keycloak client → copy `Client ID` (Settings tab) and `Client Secret` (Credentials tab).
4. Keycloak realm settings → OpenID Endpoint Configuration → copy the `issuer` value (this is the Keycloak URL).
5. Supabase Dashboard → Authentication → Providers → Keycloak → fill in Client ID / Secret / Keycloak URL.
6. Supabase Dashboard → Authentication → URL Configuration → add `http://localhost:3000/auth/callback` and `https://portal.winlab.tw/auth/callback` to the Redirect URLs.

**Sign in**:

```ts
// client component
const supabase = createClient()
await supabase.auth.signInWithOAuth({
  provider: "keycloak",
  options: {
    scopes: "openid", // Keycloak 22+ rejects more
    redirectTo: `${location.origin}/auth/callback`, // PKCE flow callback
  },
})
```

> Scope is `"openid"` only. Don't add `profile email`. Keycloak 22+ is strict about scopes; profile and email claims come back inside `openid` anyway.

**Callback (PKCE code → session exchange)**: implemented in `apps/portal/app/auth/callback/route.ts`, which calls `exchangeCodeForSession` and handles `x-forwarded-host` so it works behind reverse proxies. On error it redirects to `/auth/auth-code-error`.

**Sign out**:

```ts
await supabase.auth.signOut()
```

**Reading the current user**: prefer `supabase.auth.getClaims()` in middleware and on the server (claims live in the JWT, no Auth API call needed). Use `getUser()` only when you need the freshest profile.

### Permission model

Two layers:

- **Super admin** — `user_profiles.is_admin = true`. Only super admins can manage roles via the `/admin` panel. The `prevent_role_escalation` BEFORE UPDATE trigger blocks direct writes to `roles` / `is_admin` from anyone but `service_role`, which is why the admin RPCs elevate role inside `SECURITY DEFINER` functions before mutating.
- **App-scoped roles** — `user_profiles.roles` is `jsonb` shaped like `{ "<app>": ["admin", ...] }`. The generic `has_role(user_id, system_name, role_name)` SQL function is the real primitive — most apps' RLS policies call it inline, e.g. bento: `has_role(auth.uid(), 'bento', 'admin')`. A handful of apps additionally have a no-arg convenience wrapper bound to `auth.uid()` — currently `is_meetings_admin()`, `is_portal_admin()`, `is_receipts_admin()`, `is_reimburse_admin()`, `is_trip_admin()` — but **not every app has one** (bento, games, leave, approve, bulletin don't); check the migrations before assuming a wrapper exists rather than reaching for `has_role()` directly. `useAdmin()`-style hooks (`hooks/<app>/use-admin.ts`) read the same `roles` jsonb on the client.

When adding a new admin-controlled action, write the SECURITY DEFINER RPC + helper first, then the hook. Don't gate writes purely on the client.

### SDK-first principle (important)

**Don't write a Next.js API route or Route Handler unless you have to.** Order of preference:

1. **Server Component + `server.ts`'s `createClient()`** — reads
2. **Server Action** — writes / mutations
3. **Client Component + `client.ts`** — when interactivity is needed (realtime subscribe, optimistic UI)
4. **Route Handler** — only for: webhook receivers, third-party OAuth callbacks, non-Supabase cookie/header work, file streaming, Vercel Cron targets, bearer-token-gated endpoints for external bots/integrations

RLS is the data-layer line of defense. Don't wrap a Supabase call in an API route to "make it secure" — write the RLS policy correctly instead.

Real examples of each, all under `apps/portal/app/api/`:

- **Cron** (declared in root `vercel.json`'s `crons` array) — `cron/approve-emails`, `cron/receipts-emails`.
- **External bot integration** (bearer token via `Authorization` header, CORS-open, service-role Supabase client) — `bulletin/unnotified`, `bulletin/unnotified-mentions`, `bulletin/unnotified-broadcasts`, `bulletin/mark-notified`, `bulletin/mark-mentions-notified`, `bulletin/mark-broadcast-notified`, `bulletin/messages`.
- **File streaming / third-party service calls** — `meetings/upload`, `meetings/sync-files`, `meetings/check-video`, `meetings/schedule`.

## Coding style (aligned with https://supabase.com/ui)

Split a feature across files, don't dump everything into one:

```
apps/portal/
├─ app/<feature>/
│  ├─ page.tsx              # composition only
│  └─ _components/          # UI fragments scoped to this feature
├─ components/<feature>-*.tsx   # shared composite components across features
├─ hooks/<feature>/use-<thing>.ts # stateful behaviour / side effects
└─ lib/<feature>/                # pure logic, data access, schema

packages/ui/src/
├─ components/*.tsx         # shadcn primitives (Button, Input, …)
├─ lib/*.ts                 # cn, utils
└─ hooks/*.ts               # pure UI state hooks
```

Rules:

- **components** take props, render UI. They don't call Supabase directly.
- **hooks** own state and side effects. The Supabase client is called here.
- **lib** holds pure functions, schemas, query builders. No React.
- **Server Components** call `createClient()` directly to fetch and pass props down to client components.

### Reference: the `bento` app (multi-route business app template)

`apps/portal/app/bento/` is the most complete business app today. New apps should follow this layout:

```
apps/portal/
├─ app/bento/
│  ├─ layout.tsx                          # Toaster + QueryProvider + RealtimeNotifications + PortalShell
│  ├─ page.tsx                            # /bento — orders list
│  ├─ menus/page.tsx                      # /bento/menus — restaurant CRUD
│  ├─ orders/[id]/page.tsx                # /bento/orders/[id] — order detail
│  └─ _components/                        # bento-only UI (order-card, restaurant-card, …)
├─ hooks/bento/                           # bento-only data hooks (use-orders, use-menus, …)
│  └─ query-keys.ts                       # TanStack Query keys, all namespaced under ["bento", …]
└─ lib/bento/                             # bento types and pure helpers (types.ts, date.ts, menu.ts)
```

- **TanStack Query is per-app, not root** — `admin`, `approve`, `bento`, `games`, `leave`, `meetings`, `receipts`, `trip` each mount their own `_components/query-provider.tsx` + `QueryProvider` inside that app's `layout.tsx` (`bulletin` and `reimburse` don't use it). The provider file is copy-pasted identically across apps (bento's and receipts's are byte-for-byte the same) — that's the established pattern here, not an oversight to "fix" by deduping.
- **`<Toaster />` is mounted per-app**, same reasoning — it's in the root `page.tsx` plus almost every app layout (`admin`, `approve`, `bento`, `bulletin`, `games`, `leave`, `meetings`, `receipts`, `reimburse`, `trip`). Don't double-mount within one layout tree.
- **`AuthProvider` lives in root layout** because user state is shared. Bento hooks consume `@/hooks/use-auth`.
- **Admin is app-scoped** — `useAdmin()` reads `user_profiles.roles.bento = ["admin"]`. Other apps follow the same pattern with their own hook: `useReceiptsAdmin()`, `useMeetingsAdmin()`, `useTripAdmin()`, `usePortalAdmin()` (for `/admin` itself). Not every app has a dedicated hook (e.g. games, leave, approve, bulletin gate purely via RLS + `has_role()`).

### Feedback UX

- **Notifications** — always `toast.success()` / `toast.error()` from sonner. Never `alert()`.
- **Destructive confirmations** — use the shadcn `AlertDialog` (or each app's local `ConfirmDialog` if it has one). Never `confirm()`.
- `<Toaster />` is mounted per-app in the layout that needs it. Don't double-mount.

### Adding shadcn components

From the **repo root**:

```bash
bunx shadcn@latest add <component> -c apps/portal
```

Even with `-c apps/portal`, the file is written to `packages/ui/src/components/` because of `apps/portal/components.json`'s alias config. Don't drop raw shadcn primitives into `apps/portal/components/` by hand.

### Adding Supabase UI (registered under `@supabase` namespace)

```bash
bunx shadcn@latest add @supabase/<item>
# e.g. @supabase/password-based-auth-nextjs, @supabase/realtime-cursor…
```

The registry is configured under `apps/portal/components.json`'s `registries."@supabase"` field.

## Design system

Layout is owned by `apps/portal/components/portal-shell.tsx`'s `<PortalShell>`. The chrome is **central content + four fixed corners** — inspired by [www.winlab.tw](https://github.com/NYCU-WinLab/www.winlab.tw).

```tsx
<PortalShell appName="Profile">{children}</PortalShell>
```

| Corner | Content                                                           | Status |
| ------ | ----------------------------------------------------------------- | ------ |
| TL     | `appName`, links to `appHref` (defaults to `/`), usually app home | filled |
| BR     | `© {new Date().getFullYear()}`                                    | filled |
| TR     | `topRight?: ReactNode` slot — in-app nav                          | slot   |
| BL     | `bottomLeft?: ReactNode` slot — back to portal home               | slot   |

Corner styling is locked: `fixed z-50 p-6 text-muted-foreground text-xs`. TR / BL are **optional slot props** (`topRight?` / `bottomLeft?`) — apps pass content, not classes; consistency stays in the shell. TL's `appHref` defaults to `/` (good for portal home and single-route apps like `/profile`); multi-route apps (e.g. bento) should pass `appHref="/bento"` so TL becomes the app's home, and use BL for `<Link href="/">Portal</Link>`.

Central content container: `mx-auto w-full max-w-4xl px-6 py-20`. Width is 4xl (56rem / 896px), 5rem of vertical padding so corners never overlap content. For short pages that should feel centred, add `min-h-[60vh] flex-col justify-center` to the content.

**Each route picks its own `appName`** (Portal, Profile, Bento, …). Don't set it once in the root `layout.tsx` — that would freeze every app to the same name. Multi-route apps wrap `<PortalShell>` in their own `layout.tsx`.

## Style conventions

- **Prettier** — no semicolons, double quotes, 2-space indent, `printWidth: 80`, `trailingComma: "es5"`. `prettier-plugin-tailwindcss` sorts classes; `cn` and `cva` are registered as Tailwind functions.
- **ESLint** — root `.eslintrc.js` only sets `ignorePatterns`; the real rules come from `@workspace/eslint-config`, loaded per workspace.
- **Theme** — `apps/portal/components/theme-provider.tsx` wraps `next-themes` and registers a global `d` key for toggling dark mode (disabled inside inputs). Don't duplicate that logic.
- **Commits** — Conventional Commits, English description, with personality. No `Co-Authored-By` lines.

## Env

`apps/portal/.env.local` (gitignored):

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
```

`apps/portal/.env.example` is the template and is checked in. Whenever a new env key gets added, update both at once.
