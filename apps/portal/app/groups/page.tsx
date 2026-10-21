import { createClient } from "@/lib/supabase/server"

import { listMyGroups } from "./actions"
import { GroupList } from "./_components/group-list"

export const dynamic = "force-dynamic"
// Vercel Fluid's default and the Hobby ceiling. An action's 60 s budget
// (BATCH_BUDGET_MS) plus one call's tail and the after() audit fit well in it.
export const maxDuration = 300

export default async function GroupsPage() {
  const result = await listMyGroups()

  if (result.status === "unconfigured")
    return <p className="text-muted-foreground">Google 群組整合尚未設定。</p>
  if (result.status !== "ok")
    return (
      <p className="text-destructive">讀取 Google 群組失敗：{result.detail}</p>
    )
  if (result.data.length === 0)
    return (
      <p className="text-muted-foreground">
        你目前沒有可以管理的郵件群組。需要的話請 portal 管理員指派。
      </p>
    )

  const supabase = await createClient()
  const { data: isAdmin, error: adminError } =
    await supabase.rpc("is_portal_admin")
  if (adminError) console.error("[groups] is_portal_admin failed", adminError)
  let managerCounts: Record<string, number> | undefined
  let managersFailed = false
  if (isAdmin === true) {
    const { data: rows, error } = await supabase
      .from("group_managers")
      .select("group_id")
    if (error) {
      // Not "nobody is assigned": leave the counts out rather than show 未指派.
      console.error("[groups] group_managers read failed", error)
      managersFailed = true
    } else {
      managerCounts = {}
      for (const r of rows ?? [])
        managerCounts[r.group_id] = (managerCounts[r.group_id] ?? 0) + 1
    }
  }

  return (
    <>
      {(adminError || managersFailed) && (
        <p className="mb-4 text-xs text-destructive">
          {adminError
            ? "無法確認管理員身分，請稍後重新整理。"
            : "無法讀取各群組的管理者名單，請稍後重新整理。"}
        </p>
      )}
      <GroupList groups={result.data} managerCounts={managerCounts} />
    </>
  )
}
