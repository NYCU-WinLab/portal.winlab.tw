"use client"

import Link from "next/link"
import { useState } from "react"

import { Input } from "@workspace/ui/components/input"

import { filterGroups } from "@/lib/groups/scope"
import type { ManagedGroup } from "@/lib/groups/types"

const SEARCH_FROM = 8

export function GroupList({
  groups,
  managerCounts,
}: {
  groups: ManagedGroup[]
  /** Portal admins only: how many managers each group has, by group id. */
  managerCounts?: Record<string, number>
}) {
  const [query, setQuery] = useState("")
  const shown = filterGroups(groups, query)

  return (
    <div className="flex flex-col gap-4">
      {groups.length > SEARCH_FROM && (
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜尋群組名稱或地址"
        />
      )}
      <ul className="flex flex-col divide-y">
        {shown.map((g) => (
          <li key={g.id}>
            <Link
              href={`/groups/${g.id}`}
              className="flex items-baseline justify-between gap-4 py-3 hover:underline"
            >
              <span>{g.name}</span>
              <span className="text-xs text-muted-foreground">
                {g.email}
                {managerCounts &&
                  ` · ${managerCounts[g.id] ? `${managerCounts[g.id]} 位管理者` : "未指派"}`}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {shown.length === 0 && (
        <p className="text-sm text-muted-foreground">沒有符合的群組。</p>
      )}
    </div>
  )
}
