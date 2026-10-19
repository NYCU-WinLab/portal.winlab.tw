import { listMyGroups } from "./actions"
import { GroupList } from "./_components/group-list"

export const dynamic = "force-dynamic"

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

  return <GroupList groups={result.data} />
}
