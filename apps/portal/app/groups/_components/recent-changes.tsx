type Row = {
  id: number
  actor_id: string
  member_email: string
  action: string
  outcome: string
  created_at: string
}
type Person = { id: string; name: string | null }

const OUTCOME: Record<string, string> = {
  ok: "",
  already: "（原本就在）",
  not_found: "（原本就不在）",
  protected: "（擋下：擁有者/管理者）",
  denied: "（擋下：沒有權限）",
  error: "（失敗）",
}

export function RecentChanges({
  rows,
  denied = [],
  deniedCount = 0,
  deniedFailed = false,
  people,
  failed = false,
}: {
  /** The latest real changes (everything but `denied`). */
  rows: Row[]
  /** The latest few refused requests, shown only when expanded. */
  denied?: Row[]
  /** How many refused requests there are in all. */
  deniedCount?: number
  /** The refusals query failed: say so rather than drop the toggle. */
  deniedFailed?: boolean
  people: Person[]
  /** The audit query failed: say so rather than show nothing. */
  failed?: boolean
}) {
  if (failed)
    return (
      <section className="flex flex-col gap-2">
        <h2 className="text-sm text-muted-foreground">最近變更</h2>
        <p className="text-xs text-destructive">
          無法讀取最近變更，請稍後重新整理。
        </p>
      </section>
    )
  if (rows.length === 0 && deniedCount === 0 && !deniedFailed) return null
  const nameOf = new Map(people.map((p) => [p.id, p.name]))
  const line = (r: Row) => (
    <li key={r.id}>
      {new Date(r.created_at).toLocaleString("zh-TW", {
        timeZone: "Asia/Taipei",
      })}{" "}
      {nameOf.get(r.actor_id) ?? "某人"}
      {r.action === "add" ? " 加入 " : " 移除 "}
      {r.member_email}
      {OUTCOME[r.outcome] ?? ""}
    </li>
  )
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm text-muted-foreground">最近變更</h2>
      <ul className="flex flex-col gap-1 text-xs">{rows.map(line)}</ul>
      {deniedFailed && (
        <p className="text-xs text-destructive">
          無法讀取被拒絕的請求，請稍後重新整理。
        </p>
      )}
      {deniedCount > 0 && (
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer">
            另有 {deniedCount} 筆被拒絕的請求
          </summary>
          <ul className="mt-1 flex flex-col gap-1">{denied.map(line)}</ul>
          {deniedCount > denied.length && (
            <p className="mt-1">只列出最新 {denied.length} 筆。</p>
          )}
        </details>
      )}
    </section>
  )
}
