# syntax=docker/dockerfile:1
# winfra-paas container build for the portal monorepo app (apps/portal).
#
# Non-standalone: the runtime serves a normal `.next` build via `next start`.
# This is deliberate — it avoids needing `output: "standalone"` in
# next.config.mjs, so `main` carries ONLY inert files (this Dockerfile,
# .dockerignore, app.yaml) and Vercel's build config is untouched. Trade-off:
# the runtime image ships the full workspace node_modules (fat) and runs
# `next start` (vs a slim standalone server) — accepted for main-branch safety.
#
# NEXT_PUBLIC_* are BUILD-TIME public values (baked here; winfra-paas build
# passes no --build-arg). Server secrets go in at RUNTIME via set_secret (envFrom).

FROM oven/bun:1.3.11 AS builder
WORKDIR /app
# COPY . . so the frozen lockfile matches EVERY workspace (incl. apps/gallery).
COPY . .
RUN bun install --frozen-lockfile
# build-time PUBLIC env (prod Supabase public values, NOT secrets)
ENV NEXT_PUBLIC_SUPABASE_URL="https://yissfqcdmzsxwfnzrflz.supabase.co" \
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="sb_publishable_jwDS4JBmgcomECdzHVitaQ_jS6Z2ioZ" \
    NEXT_PUBLIC_SITE_URL="https://portal.app.winlab.tw" \
    NEXT_PUBLIC_BASE_URL="https://portal.app.winlab.tw" \
    NODE_ENV=production
RUN bunx turbo build --filter=portal

FROM oven/bun:1.3.11-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
# The whole workspace tree: node_modules is hoisted to the repo root (bun
# workspaces), so `next start` resolves @workspace/ui + all deps from there —
# no standalone tracing needed. node_modules stays root-owned (world-readable;
# next reads it). Only .next is chowned to the runtime UID so any ISR/cache
# writes succeed: k8s pins runAsUser=1000 (restricted PSA), which OVERRIDES the
# image USER, so the on-disk owner must be 1000 to be writable at runtime.
COPY --from=builder /app ./
RUN chown -R 1000:1000 /app/apps/portal/.next
USER 1000
WORKDIR /app/apps/portal
EXPOSE 3000
# `bun run start` = the workspace's "next start" script; bun run puts the
# workspace-local node_modules/.bin on PATH (bun installs next into
# apps/portal/node_modules, NOT the repo root). `--` forwards host/port to next.
# cwd = apps/portal → uses its .next + next.config. Binds 0.0.0.0:3000 (app.yaml).
CMD ["bun", "run", "start", "--", "-p", "3000", "-H", "0.0.0.0"]
