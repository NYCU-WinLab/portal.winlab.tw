import { getDirectoryMembers } from "@/lib/directory/server"

import { MemberTable } from "./_components/member-table"

export const dynamic = "force-dynamic"

export default async function DirectoryPage() {
  const result = await getDirectoryMembers()

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-medium">實驗室成員通訊錄</h1>
        <p className="text-sm text-muted-foreground">
          查看與搜尋成員的聯絡資訊。
        </p>
      </div>
      {result.status === "ok" ? (
        <MemberTable members={result.members} />
      ) : (
        <div role="alert" className="rounded-xl border bg-card p-4">
          <p className="text-sm">暫時無法載入通訊錄，請稍後重新整理。</p>
          <p className="mt-1 text-sm text-muted-foreground">
            若持續無法載入，請聯絡管理員。
          </p>
        </div>
      )}
    </div>
  )
}
