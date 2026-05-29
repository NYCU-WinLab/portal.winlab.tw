# CI / Testing Strategy

> Analysis + phased roadmap for making `portal.winlab.tw`'s CI testing better and more complete.
> Epic: #161 · Charters: #157 #158 #159 #160 · Date: 2026-05-29

## TL;DR

CI is **green but shallow**. The `test` lane covers 6 pure-logic files (~39 tests). The two highest-risk surfaces in the system — **RLS / SECURITY DEFINER SQL** and the **MCP OAuth 2.1 server** — are structurally invisible to CI. The analysis also surfaced a schema-drift incident that must be fixed before any DB testing is possible.

## Current state (verified)

| Item                          | State                                                                                                          |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Workflow                      | single job `check`, sequential `typecheck → lint → test → build`, placeholder Supabase env for build           |
| Test runner                   | Bun's built-in `bun test` (already adopted; **not** vitest/jest)                                               |
| Test files                    | 6 files, ~39 tests, **all `lib/*` pure logic** (debt, approve, bento, leave, gallery-mime, gallery-reactions)  |
| Good hygiene present          | `concurrency` cancel-in-progress, `--frozen-lockfile`, Turbo remote cache, Dependabot (npm + actions)          |
| `apps/mcp` / `packages/ui`    | **no `test` script** → `turbo test` silently skips them (`bun test` exits **0** on zero test files — verified) |
| RLS / 37 migrations           | **zero tests**; no `supabase/config.toml` locally                                                              |
| coverage / audit / SAST / e2e | **none**                                                                                                       |

## Structural blind spots (ranked by risk)

1. **RLS / SECURITY DEFINER SQL untested — critical.** 37 migrations, ~36 SECURITY DEFINER functions, 7 `is_*_admin()` helpers. `bun test` runs in-process JS and cannot touch Postgres. A policy loosened to `using(true)` ships with no gate. Most sensitive: `trip_admin_get_member_signatures()` (one-line `and is_trip_admin()` guards every member's handwritten signature), `approve_*` PII (national ID / household address), `submit_game_score()` RPC gate (prod leaderboards were already polluted with impossible scores before the gate existed).
2. **MCP OAuth 2.1 server entirely untested — critical.** `apps/mcp` hand-rolls a full OAuth 2.1 + PKCE authorization server. `verifyPkce()`, token-endpoint grant validation, and the cookie-state callback flow (rewritten in PR #12, zero regression tests) are the chokepoints between a stolen auth code and a bearer token. Code is cleanly factored (pure fns + injectable stores) so tests are cheap — **but `apps/mcp` has no `test` script**, so any test added is dead weight.
3. **`bun test` exits 0 on empty dir — medium (amplifies 1 & 2).** Combined with mcp/ui having no test script, untested code in the highest-risk workspaces is invisible.
4. **Server-action security logic not unit-testable — high.** `uploadPdf` 50MB cap, `syncSigners` orphan-prune, gallery `isValidClientObjectPath` (path-traversal + ownership, **critical**) are pure logic fused into `"use server"` files; must be extracted to `lib/` first.
5. **Pipeline gaps — medium/low.** No Bun install cache (setup-bun caches only the executable), no coverage gate, no `bun audit`, no CodeQL, single non-parallel job, action tags not SHA-pinned, no `permissions:` hardening.

## Incident-level findings (fix before adding tests)

- **A. Schema drift — security defense not in version control (verified).** `prevent_role_escalation` trigger, `user_profiles`, `has_role()`, `is_bento_admin()`, and `bento_menus`/`bento_orders`/`leaves` base tables have **zero `CREATE` in any migration** — they exist only in the Supabase dashboard. `supabase db reset` rebuilds a DB without the role-escalation defense. Same drift class as the `forms.winlab.tw owner_id` incident. **Blocks all RLS testing.** → #157
- **B. CLAUDE.md doc drift.** `CLAUDE.md:42` still says "No test runner. Don't add one without asking." while `bun test` is adopted and wired into CI. → #158

## Target architecture: test pyramid + multi-job CI

```
 ╱ e2e (Playwright) ╲          schedule/label, non-blocking — auth redirect / gallery upload / bento order
╱ RLS (pgTAP)        ╲         paths: supabase/migrations/**, blocks PR — role escalation / PII isolation
 ╲ contract (MCP/RPC) ╱        bun test + fake store — OAuth grant / tool envelope
  ╲ unit (pure logic)╱         existing lane + coverage gate
   ────────────────
   static: typecheck · lint · bun audit · CodeQL · "no using(true)" grep
```

### Proposed `ci.yml` shape (versions verified 2026-05)

```yaml
name: CI
on: { push: { branches: [main] }, pull_request: {} }
concurrency: { group: ${{ github.workflow }}-${{ github.ref }}, cancel-in-progress: true }
permissions: { contents: read }

jobs:
  check:                                   # fast lane, blocks PR
    strategy: { matrix: { task: [typecheck, lint, test] } }
    runs-on: ubuntu-latest
    env: { TURBO_TOKEN: ..., TURBO_TEAM: ..., TURBO_SCM_BASE: origin/main }
    steps:
      - uses: actions/checkout@<sha>       # v6.0.2
        with: { fetch-depth: 0 }           # --affected needs full history
      - uses: oven-sh/setup-bun@<sha>      # v2.2.0
        with: { bun-version-file: package.json }
      - uses: actions/cache@v4             # missing Bun install cache
        with: { path: ~/.bun/install/cache, key: ${{ runner.os }}-bun-${{ hashFiles('bun.lock') }} }
      - run: bun install --frozen-lockfile
      - run: bunx turbo run ${{ matrix.task }} --affected

  build: { ... }                           # blocks PR, placeholder Supabase env

  rls:                                     # paths: supabase/migrations/**, blocks PR
    steps:
      - uses: supabase/setup-cli@v2
      - run: supabase db start
      - run: supabase test db              # pgTAP + basejump test_helpers

  # e2e (Playwright) + CodeQL: separate workflows, schedule/label, NON-required
```

## Roadmap (charters)

| Phase       | Charter                                                             | Blocked on                                              |
| ----------- | ------------------------------------------------------------------- | ------------------------------------------------------- |
| P0 incident | #157 — backfill dashboard-only schema into migrations               | prod schema access (Supabase MCP or `supabase db dump`) |
| P0          | #158 — mcp/ui test script + CLAUDE.md posture                       | —                                                       |
| P1          | #159 — unit-test high-risk pure logic + CI cache/coverage/audit     | #158 (for mcp tests)                                    |
| P2          | #160 — pgTAP RLS job + CodeQL + Playwright e2e + CI parallelization | #157 (RLS)                                              |

Execution order: **#158 → #159 → P2 CI hardening** (all unblocked), with **#157 → #160 RLS** following once prod schema access is available.

## Sources

- Bun docs: `bun test`, `bunfig.toml` (`coverageThreshold`), happy-dom/testing-library setup (context7)
- oven-sh/setup-bun README v2.2.0 (caches executable only, not deps)
- Supabase docs: database testing, advanced pgTAP (basejump `supabase_test_helpers`)
- Turborepo `run` reference (`--affected`, `TURBO_SCM_BASE`, shallow-checkout caveat)
- GitHub secure-use reference (`permissions: contents: read`, SHA pinning)
- Verified latest (2026-05): `actions/checkout` v6.0.2, `oven-sh/setup-bun` v2.2.0, `codecov/codecov-action` v5, `supabase/setup-cli` v2, `github/codeql-action` v3
