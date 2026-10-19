"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"

import { assignGroupManager, unassignGroupManager } from "../actions"

type Person = { id: string; name: string | null; email: string }

export function ManagerEditor({
  groupId,
  managerIds,
  people,
}: {
  groupId: string
  managerIds: string[]
  people: Person[]
}) {
  const router = useRouter()
  const [search, setSearch] = useState("")
  const byId = new Map(people.map((p) => [p.id, p]))
  const matches = search.trim()
    ? people
        .filter(
          (p) =>
            !managerIds.includes(p.id) &&
            `${p.name ?? ""} ${p.email}`
              .toLowerCase()
              .includes(search.trim().toLowerCase())
        )
        .slice(0, 8)
    : []

  async function run(
    action: typeof assignGroupManager,
    userId: string,
    done: string
  ) {
    let res: Awaited<ReturnType<typeof assignGroupManager>>
    try {
      res = await action(groupId, userId)
    } catch (err) {
      console.error("[groups] manager change failed", err)
      router.refresh()
      return toast.error("連線中斷，請稍後確認結果")
    }
    if (!res.ok) return toast.error(res.error)
    toast.success(done)
    setSearch("")
    // group_managers is Supabase data, read back consistently — unlike the
    // Google member list, an immediate refresh is the truth here.
    router.refresh()
  }

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm text-muted-foreground">
        群組管理者（portal 管理員可編輯）
      </h2>
      <ul className="flex flex-col gap-1 text-sm">
        {managerIds.map((id) => (
          <li key={id} className="flex items-center justify-between">
            <span>{byId.get(id)?.name ?? byId.get(id)?.email ?? id}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => run(unassignGroupManager, id, "已撤銷")}
            >
              撤銷
            </Button>
          </li>
        ))}
      </ul>
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="搜尋成員以指派"
      />
      {matches.map((p) => (
        <button
          key={p.id}
          type="button"
          className="text-left text-sm hover:underline"
          onClick={() =>
            run(assignGroupManager, p.id, `已指派 ${p.name ?? p.email}`)
          }
        >
          {p.name ?? p.email}{" "}
          <span className="text-muted-foreground">{p.email}</span>
        </button>
      ))}
    </section>
  )
}
