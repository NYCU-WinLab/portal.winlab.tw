# Changelog

All notable changes are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- `/admin` super-admin panel for managing user roles, gated by `user_profiles.is_admin`
- `/receipts` admin-only receipt review wall — uploads any image or PDF, archives it as a single PDF per row, status workflow (pending / approved / rejected), preview dialog, row actions for renaming and deleting
- `/meetings` lab-meeting scheduler — weekly schedule, presenter sign-up, teacher-paper sharing
- `/trip` travel-document app — file uploads, admin folder export, dynamic signature stamping at view time
- `/reimburse` lab cash-flow bookkeeping (egress + ingress, schema migrated from the legacy `egress` / `ingress` tables)
- `/approve` document signing with PDF field placement and Resend email outbox via Vercel Cron
- `/leave` Monday-meeting attendance sign-ups
- `/profile` lab stats card aggregating bento / leave / approve / trip activity (replaced the old auth dump)
- `apps/gallery` — the lab's art wall on `gallery.winlab.tw`, with renamable works and MIME-resilient uploads
- `apps/mcp` — MCP server with OAuth 2.1, exposing bento and leave tools over `mcp.winlab.tw`
- Theme toggle on portal home, defaulting to dark
- Portal home receipts link, only visible to receipts admins

### Changed

- Renamed `middleware.ts` → `proxy.ts` to follow the Next.js 16 file-convention rename, with the function exported as `proxy()` instead of `middleware()`
- Widened `<PortalShell>` content container from `max-w-2xl` (672px) to `max-w-4xl` (896px) so forms and lists breathe
- Bumped Next.js to 16.2.4, react-pdf to 10.4.1, @eslint/js to 10.x, actions/checkout to v6
- Receipts archive everything as PDF — phone photos get wrapped into a single-page PDF, real PDFs pass through untouched, downloads name the file by the row's title

### Fixed

- Self-healing in `AuthProvider` when the local Supabase state goes stale
- Cross-subdomain cookie cleanup on auth callback failure (keeps stale `sb-*` cookies and PKCE code-verifier from sticking)
- Dialog scroll behaviour when the content overflows the viewport
- Mobile uploads for gallery — raised the 1 MB cap and accepted HEIC / HEIF
- Reimburse PDF auto-generation removed; the app is bookkeeping-only now
- `next-env.d.ts` no longer fights prettier — added to `.prettierignore` so dev mode and build mode can disagree about the types path without making the working tree dirty

## [0.1.0] — Initial cut

### Added

- Initial Turborepo monorepo (Bun + Next.js 16 + React 19 + Tailwind v4 + shadcn/ui)
- Supabase Auth via Keycloak OIDC provider
- Root-level `AuthProvider` sharing user state across apps
- Middleware-driven auth gating — unauthenticated requests redirect to `/auth/login`
- `/bento` lunch-ordering system — orders, menus, realtime, admin scope
- `/profile` initial Supabase user dump
- `<PortalShell>` chrome — TL/TR/BL/BR slot architecture
- Design system baseline — `rounded-xl`, `gap-10/4/3` rhythm, `border + bg-card` with no shadows
- Dev system — CI workflow, PR / Issue templates, CODEOWNERS, Dependabot, commitlint, husky
