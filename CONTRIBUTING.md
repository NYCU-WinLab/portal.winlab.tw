# Contributing

Welcome — this file is the _how_. Architecture and design rules live in [`CLAUDE.md`](./CLAUDE.md); environment setup lives in [`README.md`](./README.md).

## Workflow

1. **Branch off `main`** — `main` is locked, direct pushes are rejected.
2. **Write code and run it locally** — `bun run typecheck`, `bun run lint`, `bun run build`, plus a real click-through in dev. CI does not check what your eyes catch.
3. **Open a pull request** — fill in the template (why / what / test plan / screenshots).
4. **Wait for CI green and a code-owner review** — CODEOWNERS auto-assigns the right reviewer.
5. **Squash merge** — keep `main` linear, one commit per PR.

### Branch naming

`<type>/<short-description>`, where `<type>` follows Conventional Commits:

```
feat/profile-avatar-upload
fix/bento-order-close-race
chore/bump-next-to-16.2
docs/clarify-portal-shell-slots
refactor/extract-menu-items-editor
```

### Commit messages

Conventional Commits, English description, written like a person not a robot:

```
feat: add bento order auto-close timer
fix: stop the infinite loop from eating all the RAM
chore: feed dependencies their latest treats
refactor: untangle the spaghetti in auth middleware
```

A commitlint hook (`commit-msg`) blocks anything else, so a malformed header cannot land. Header limit is 100 characters.

### Pull-request title and body

- Title follows the same Conventional Commits format. With squash-merge, this becomes the final commit on `main`.
- Body explains **why** and **what changed**. Reviewers send back PRs that just paste commit messages.

### About CI and Vercel preview deploys

- The required check is `typecheck · lint · build`. Anything else is informational.
- Vercel preview deploys require owner authorization when the commit author is outside the Vercel team — fork PRs and contributions from non-members will show "Authorization required to deploy". This is expected and does not block merges; the maintainer can either click the per-commit authorize link to see a preview, or merge directly and let the production deploy run on `main`.
- First-time contributors will see GitHub Actions stuck on "action required" until a maintainer clicks **Approve and run workflows**. After that, the contributor's later PRs run automatically.

## Code conventions

- **TypeScript** — no `any`, no `@ts-ignore`. If you genuinely need an escape hatch, use `as unknown as X` and leave a comment explaining why.
- **React** — Server Components first; reach for `"use client"` only when interactivity is needed. Supabase calls live in the `hooks/` layer, not inside components.
- **Comments** — write none by default. If you do, write the _why_ (a non-obvious decision, a workaround, an invariant) — never the _what_. Code is self-explanatory; comments aren't.
- **Feedback UX** — `toast` from sonner instead of `alert`; `AlertDialog` (or local `ConfirmDialog`) instead of `confirm()`.
- **Design system** — spacing, padding, and rounding follow the rhythm in CLAUDE.md's Design System section. Don't invent local rules.

## Adding dependencies

- `bun add <pkg> --filter=portal` — only for portal
- `bun add <pkg>` — root or shared across workspaces
- Justify new dependencies in the PR body, especially when the package is large or niche

## Adding shadcn components

```bash
bunx shadcn@latest add <name> -c apps/portal
```

The file lands in `packages/ui/src/components/`. Don't manually copy primitives into `apps/portal/components/`.

## Reviewing pull requests

**On your own PR**:

- Self-review once before requesting one
- Resolve every comment — either fix it or explain why you won't
- Mark conversations resolved as you go

**On someone else's PR**:

- Look at the _why_ before the implementation details
- If you can see a simpler approach, say so
- Hold back on nitpicks unless they really matter; prefix true nitpicks with `nit:`

## Getting unstuck

- **Not sure if it's a bug** — open a Question issue
- **Need a maintainer** — `@zyx1121` (Loki)
- **Urgent** — ping Loki directly
