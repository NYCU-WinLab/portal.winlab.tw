# Archived migrations (pre-baseline)

These are the granular, per-feature migrations the repo carried **before** the
schema was squashed into a single captured baseline
(`../migrations/00000000000000_remote_baseline.sql`).

They are kept for their narrative value — the RLS reasoning, the
`trip-admin-scope` security rationale, the `game-scores-rpc-gate` explanation,
etc. — but they are **no longer applied** by `supabase db reset` (only
`supabase/migrations/*.sql` is). The baseline already contains their cumulative
effect, captured authoritatively from production.

The repo's migration history before 2026-04-23 lived only in the Supabase
dashboard (never committed); the baseline captures the full production schema as
of 2026-05-29, so `git` is now the source of truth. See
`docs/ci-testing-strategy.md` and issue #157.

New migrations go in `../migrations/` as usual and build on top of the baseline.
