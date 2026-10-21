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
  people,
  failed = false,
}: {
  rows: Row[]
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
  if (rows.length === 0) return null
  const nameOf = new Map(people.map((p) => [p.id, p.name]))
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm text-muted-foreground">最近變更</h2>
      <ul className="flex flex-col gap-1 text-xs">
        {rows.map((r) => (
          <li key={r.id}>
            {new Date(r.created_at).toLocaleString("zh-TW", {
              timeZone: "Asia/Taipei",
            })}{" "}
            {nameOf.get(r.actor_id) ?? "某人"}
            {r.action === "add" ? " 加入 " : " 移除 "}
            {r.member_email}
            {OUTCOME[r.outcome] ?? ""}
          </li>
        ))}
      </ul>
    </section>
  )
}
