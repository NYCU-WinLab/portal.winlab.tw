# Changelog

All notable changes to this project will be documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Initial Turborepo monorepo（Bun + Next.js 16 + React 19 + Tailwind v4 + shadcn/ui）
- Supabase Auth 走 Keycloak OIDC provider
- Root-level `AuthProvider`，跨 app 共用 user state
- Middleware 路由級 auth gating — 未登入自動導回 `/auth/login`
- `/bento` 訂餐系統 — orders、menus、ratings（後移除）、realtime、admin 權限
- `/profile` — Supabase user 全資料顯示
- `PortalShell` chrome — TL/TR/BL/BR 四角 slot 架構
- Design system baseline — `rounded-xl`、`gap-10/4/3`、`border + bg-card` 無 shadow
- Dev system — CI、PR / Issue template、CODEOWNERS、Dependabot、commitlint、husky
