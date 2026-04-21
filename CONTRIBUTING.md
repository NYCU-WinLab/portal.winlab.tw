# Contributing

歡迎來改 portal.winlab.tw。這份文件只講 how。設計規範與架構看 [`CLAUDE.md`](./CLAUDE.md)，環境變數與上手看 [`README.md`](./README.md)。

## 工作流程

1. **從 `main` 開 branch** — `main` 被鎖，不能直推
2. **寫 code + 自己跑過** — `bun run typecheck`、`bun run lint`、`bun run build`，dev server 實際點一遍
3. **開 PR** — 走 PR template，填 why / what / test plan / screenshot
4. **等 CI 綠 + reviewer pass** — 不綠不能 merge，CODEOWNERS 會自動指派
5. **Squash merge** — 保持 main 線性、一個 PR 一個 commit

### Branch 命名

`<type>/<short-description>` — type 跟 Conventional Commits 對齊：

```
feat/profile-avatar-upload
fix/bento-order-close-race
chore/bump-next-to-16.2
docs/clarify-portal-shell-slots
refactor/extract-menu-items-editor
```

### Commit message

Conventional Commits + 英文 description，有人味，不要機器人風格：

```
feat: add bento order auto-close timer
fix: stop the infinite loop from eating all the RAM
chore: feed dependencies their latest treats
refactor: untangle the spaghetti in auth middleware
```

commitlint hook 會擋掉不對格式的 message，放心寫不用怕手滑。

### PR 標題

跟 commit 格式一樣。Squash merge 時這個會變成最終 commit message。

### PR body

走 template — 沒填 **why** 跟 **what changed** 的會被 reviewer 退。

## Code conventions

- **TS**：別 `any`、別 `@ts-ignore`。真的要 escape hatch 用 `as unknown as X` + 註解
- **React**：Server Component 優先，Client 只在需要互動時用；Supabase call 只在 `hooks/` 層
- **Comment**：沒必要不寫。寫就寫 why（非直覺的決策、workaround、約束），不要寫 what（code 自解釋）
- **Feedback UX**：`toast` 不 `alert`，`ConfirmDialog` 不 `confirm()`
- **Design system**：顆粒度（gap、padding、rounded）照 CLAUDE.md Design System 段走，別自己發明

## 加依賴

- `bun add <pkg> --filter=portal` — 只給 portal 用
- `bun add <pkg>` — root / 跨 workspace
- 加新 dep 在 PR body 解釋 why（特別是大或小眾的套件）

## 加 shadcn 元件

```bash
bunx shadcn@latest add <name> -c apps/portal
```

進 `packages/ui/src/components/`，別手動放 `apps/portal/components/`。

## Review guidelines

**自己的 PR**：

- 先自己 review 一遍再請人看
- 每條 reviewer comment 要嘛修、要嘛回覆為什麼不修
- 改完 mark resolved

**看別人的 PR**：

- 優先看 **why** 通不通，再看實作細節
- 找得到更簡單的做法要講出來
- 雞毛蒜皮先忍住，除非真的重要（nitpick 可以標 `nit:` prefix）

## 遇到問題

- **不確定是不是 bug** — 開 Question issue
- **找 maintainer** — @zyx1121（Loki）
- **急的** — 直接敲 Loki
