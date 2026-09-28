# @workspace/db

The Supabase CLI project shared by portal and gallery: migrations in `supabase/migrations`, pgTAP RLS tests in `supabase/tests`, and `supabase/config.toml`.

Run CLI commands from this directory:

```bash
cd packages/db
supabase db start   # boot a local Postgres with every migration applied
supabase test db    # run the pgTAP tests, same as the DB tests workflow
```

Prod migrations are applied with `apply_migration`, not by a deploy. No app depends on this package, so a commit that only touches it does not rebuild portal or gallery on Vercel.
