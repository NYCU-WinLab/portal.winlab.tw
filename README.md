# portal.winlab.tw

NYCU [WinLab](https://winlab.tw) 的內部入口。根域名 `portal.winlab.tw` 下掛多個業務 app（`/bento`、`/invoice`、`/approval`…），每個 app 由不同人維護、業務邏輯獨立，但共用：

- **Auth** — Supabase Auth + Keycloak OIDC
- **Profile / session** — 一份 user state 跨整個 portal
- **Design system** — 元件庫、顆粒度、feedback UX 規範

## 技術棧

Bun 1.3 · Turborepo · Next.js 16（App Router + Turbopack）· React 19 · Tailwind v4 · shadcn/ui · Supabase（SSR cookies）· TanStack Query v5 · Keycloak（Supabase OIDC provider）

## 上手

```bash
bun install
cp apps/portal/.env.example apps/portal/.env.local  # 填 Supabase 兩把 key
bun run dev                                          # http://localhost:3000
```

`.env.local` 需要的值找 [@zyx1121](https://github.com/zyx1121)。Keycloak 相關設定全在 Supabase / Keycloak Dashboard，不進 repo。

## 常用指令

```bash
bun run dev                       # 全棧 dev
bun run dev --filter=portal       # 只跑 portal
bun run build                     # turbo build
bun run typecheck                 # tsc --noEmit
bun run lint                      # eslint
bun run format                    # prettier --write
```

沒裝 test runner — 要加先討論。

## 怎麼加新的 app

業務 app = `apps/portal/app/<name>/` 底下的 route segment，**不是** 獨立 Turborepo workspace。要新增 app 就在 `apps/portal/app/` 下開資料夾，包一層 `<PortalShell appName="..." appHref="/<name>">` 就有 portal 骨架了。

目前最完整的範例是 [`apps/portal/app/bento/`](./apps/portal/app/bento)，新 app 照它的版型做即可。

### 例外：獨立 subdomain workspace

當 app 的 design system 跟 portal **明顯不同**（字體、版面 metaphor），才開新 workspace 在 `apps/<name>/`，跑 subdomain（如 `gallery.winlab.tw`）。骨架還是 `<PortalShell>`（住在 `@workspace/ui`），但字體、容器寬度、互動可以自己玩。

目前的範例是 [`apps/gallery/`](./apps/gallery)（Instrument Serif、拍立得錯落 layout）。**先問 maintainer 才開新 workspace**，避免重複造輪子。

## 怎麼加 shadcn 元件

```bash
bunx shadcn@latest add <component> -c apps/portal
```

儘管帶 `-c apps/portal`，檔案會寫到 `packages/ui/src/components/`（跨 workspace 共用）。別手動往 `apps/portal/components/` 丟原始 shadcn primitive。

## Design system 規範（重點摘要）

- **Layout** 統一用 `<PortalShell>`：TL 當前 app、TR app 內 nav、BL 回 portal 首頁、BR ©
- **Card 殼** `border + rounded-xl + bg-card`，無 shadow、無 ring
- **間距顆粒度**：section 間 `gap-10`、section 內 `gap-4`、card list 間 `gap-3`、list card padding `p-4`
- **Feedback**：notification 用 `toast`（sonner）、destructive 確認用 `ConfirmDialog`，**不要** `alert()` / `confirm()`
- **SDK-first**：Server Component → Server Action → Client Component → Route Handler（最後才開）；非必要不寫 API route

完整規範與架構細節：[`CLAUDE.md`](./CLAUDE.md)（給 Claude Code 讀的，但人類也看得懂）。

## 開發流程

### Branch

- 從 `main` 開 branch
- 命名：`<type>/<short-description>`，例：`feat/profile-avatar-upload`、`fix/bento-order-close-race`
- `main` 被鎖，不能直推

### Commit

Conventional Commits — description 用英文、有人味：

```
feat: add bento order auto-close timer
fix: stop the infinite loop from eating all the RAM
chore: feed dependencies their latest treats
docs: ...
refactor: ...
test: ...
perf: ...
style: ...
```

### PR

- 標題照 commit 風格
- Body 講 **why** 和 **what changed**，別只貼 commit messages
- 等 CI 綠 + review pass 才 merge
- 自己先把 PR 走一遍再請人看，改完 conversation mark resolved

## Contributors

- [@zyx1121](https://github.com/zyx1121)（Loki）— maintainer
