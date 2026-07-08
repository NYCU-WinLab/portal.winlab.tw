# portal.winlab.tw

The internal portal for NYCU [WinLab](https://winlab.tw). The root domain hosts a handful of business apps under `portal.winlab.tw/<name>`, each owned by different people but sharing the same:

- **Auth** — Supabase Auth fronted by Keycloak (OIDC)
- **Profile / session** — one user state across the whole portal
- **Design system** — components, spacing, feedback UX

## Stack

Bun 1.3 · Turborepo 2 · Next.js 16 (App Router + Turbopack) · React 19 · Tailwind v4 · shadcn/ui · Supabase (`@supabase/ssr`) · TanStack Query v5 · Keycloak (Supabase OIDC provider) · pdf-lib

## Apps

| Path         | What it is                                                      |
| ------------ | --------------------------------------------------------------- |
| `/`          | Home — welcome card + nav to every app                          |
| `/admin`     | Super-admin role management (gated by `user_profiles.is_admin`) |
| `/approve`   | Document signing with PDF field placement + email outbox        |
| `/bento`     | Lunch-ordering for the lab — orders, menus, realtime            |
| `/bulletin`  | Announcements board                                             |
| `/debt`      | Bill-splitting + monthly settlement cron                        |
| `/games`     | Mini-games (2048, snake, …) with global leaderboards            |
| `/leave`     | Monday-meeting attendance sign-ups                              |
| `/meetings`  | Lab-meeting weekly schedule + teacher papers                    |
| `/profile`   | Personal account + bento / leave / approve / trip stats         |
| `/receipts`  | Admin-only receipt review (PDF archive workflow)                |
| `/reimburse` | Lab cash-flow bookkeeping (egress + ingress)                    |
| `/trip`      | Travel-document uploads with admin folder export                |

One app lives on its own subdomain because its design system diverges from portal:

- [`apps/gallery`](./apps/gallery) — `gallery.winlab.tw`, the lab's art wall (Instrument Serif, polaroid layout)

## Get started

```bash
bun install
cp apps/portal/.env.example apps/portal/.env.local   # fill the two Supabase keys
cp apps/gallery/.env.example apps/gallery/.env.local # gallery keys (see below)
bun run dev                                          # http://localhost:3000
```

For gallery-only dev: `bun run dev --filter=gallery` → http://localhost:3005

### Gallery env (`apps/gallery/.env.local`)

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=          # server-only — mention resolution + admin writes
GALLERY_API_SECRET=           # mention notification API (Apps Script)
```

`.env.local` values live with [@zyx1121](https://github.com/zyx1121). Keycloak setup happens entirely in the Supabase + Keycloak dashboards — never in code.

## Common commands

```bash
bun run dev                       # everything (portal :3000, gallery :3005)
bun run dev --filter=portal       # just portal
bun run dev --filter=gallery      # just gallery (:3005)
bun run build                     # turbo build
bun run typecheck                 # tsc --noEmit
bun run lint                      # eslint
bun run format                    # prettier --write
```

No test runner yet — bring it up in an issue before adding one.

## Adding a new app

A business app is a `apps/portal/app/<name>/` route segment, **not** a separate Turborepo workspace. To start a new one, drop a folder under `apps/portal/app/`, wrap it with `<PortalShell appName="..." appHref="/<name>">`, and you've got the chrome for free.

The most complete reference today is [`apps/portal/app/bento/`](./apps/portal/app/bento) — copy that layout for the next app.

### When to break out into a subdomain workspace

Only when the app's design system genuinely diverges from portal — different fonts, different layout metaphor. Otherwise, keep it inside `apps/portal/app/`. Ask a maintainer before opening a new workspace; do not create one just to dodge the shared shell.

The lone example is [`apps/gallery`](./apps/gallery), which earned its own subdomain because it uses Instrument Serif and a polaroid scatter layout.

## Adding shadcn components

```bash
bunx shadcn@latest add <component> -c apps/portal
```

Even though the flag points at `apps/portal`, the file lands in `packages/ui/src/components/` (workspace-shared). Do not drop raw shadcn primitives directly into `apps/portal/components/`.

## Design system at a glance

- **Layout** — every app uses `<PortalShell>`: TL = current app, TR = in-app nav, BL = back to portal home, BR = ©
- **Cards** — `border + rounded-xl + bg-card`, no shadow, no ring
- **Spacing rhythm** — `gap-10` between sections, `gap-4` inside a section, `gap-3` between list cards, `p-4` for list-card padding
- **Feedback** — `toast` from sonner for messages; `AlertDialog` (or local `ConfirmDialog`) for destructive confirms. **No** `alert()`, **no** `confirm()`
- **SDK-first** — Server Component → Server Action → Client Component → Route Handler (last resort). Avoid wrapping Supabase in API routes; trust RLS

The full spec lives in [`CLAUDE.md`](./CLAUDE.md). Written for Claude Code, but humans read it fine.

## Workflow

### Branches

- Branch off `main`. `main` is locked — direct pushes are rejected.
- Naming: `<type>/<short-description>`, e.g. `feat/profile-avatar-upload`, `fix/bento-order-close-race`.

### Commits

Conventional Commits, English description, with personality:

```
feat: add bento order auto-close timer
fix: stop the infinite loop from eating all the RAM
chore: feed dependencies their latest treats
```

A commit-msg hook rejects malformed messages, so you cannot land a bad header by accident.

### Pull requests

- PR title follows the same Conventional Commits format
- Body explains the **why** and **what changed** — not a copy of commit messages
- Self-review before requesting one; resolve conversations as you address them
- Wait for CI green; deployments to Vercel may need owner authorization for outside contributors (see `CONTRIBUTING.md`)

## Contributors

- [@zyx1121](https://github.com/zyx1121) — maintainer
