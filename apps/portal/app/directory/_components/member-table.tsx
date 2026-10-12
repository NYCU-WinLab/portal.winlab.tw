"use client"

import React, { useMemo, useState } from "react"
import {
  IconChevronRight as ChevronRight,
  IconMail as Mail,
  IconPhone as Phone,
  IconSearch as Search,
} from "@tabler/icons-react"

import {
  ROLE_LABELS,
  ROLE_ORDER,
  type DirectoryMember,
  type MemberRole,
} from "@/lib/directory/members"
import { Avatar, AvatarFallback } from "@workspace/ui/components/avatar"
import { Badge } from "@workspace/ui/components/badge"
import { Input } from "@workspace/ui/components/input"

const ALL_ROLES = "all"

const YEAR_CHAR_MAP: Record<string, number> = {
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
}

function getYearFromTitle(title: string | undefined): number {
  const match = title?.match(/([一二三四五六七八])年級/)
  return match?.[1] ? (YEAR_CHAR_MAP[match[1]] ?? 99) : 99
}

function yearLabel(prefix: string, year: number): string {
  const chars = ["一", "二", "三", "四", "五", "六", "七", "八"]
  return year === 99 ? "其他" : `${prefix}${chars[year - 1]}`
}

function matches(value: string | undefined, query: string): boolean {
  return !!value && value.toLowerCase().includes(query)
}

function getInitials(name: string): string {
  if (/[\u4e00-\u9fff]/.test(name)) return name.slice(-2)
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()
}

function roleBadgeVariant(
  role: MemberRole
): "default" | "secondary" | "outline" | "ghost" {
  switch (role) {
    case "professor":
      return "default"
    case "phd":
      return "secondary"
    case "master":
      return "outline"
    case "undergraduate":
      return "ghost"
    default:
      return "ghost"
  }
}

function MemberRow({ member }: { member: DirectoryMember }) {
  return (
    <tr className="group border-b border-border/50 transition-colors hover:bg-muted/40">
      <td className="py-3 pr-3 pl-4">
        <div className="flex items-center gap-3">
          <Avatar className="h-8 w-8 shrink-0 rounded-md">
            <AvatarFallback className="rounded-md text-xs font-medium">
              {getInitials(member.name)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{member.name}</p>
            {member.nameEn && (
              <p className="truncate text-xs text-muted-foreground">
                {member.nameEn}
              </p>
            )}
          </div>
        </div>
      </td>

      <td className="px-3 py-3">
        <Badge
          variant={roleBadgeVariant(member.role)}
          className="whitespace-nowrap"
        >
          {member.position ?? ROLE_LABELS[member.role] ?? member.role}
        </Badge>
      </td>

      <td className="px-3 py-3">
        <a
          href={`mailto:${member.email}`}
          className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <Mail className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{member.email}</span>
        </a>
      </td>

      <td className="px-3 py-3">
        {member.phone ? (
          <a
            href={`tel:${member.phone}`}
            className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <Phone className="h-3.5 w-3.5 shrink-0" />
            <span className="whitespace-nowrap">{member.phone}</span>
          </a>
        ) : (
          <span className="text-sm text-muted-foreground/30">—</span>
        )}
      </td>

      <td className="hidden px-3 py-3 pr-4 md:table-cell">
        {member.studentId ? (
          <span className="font-mono text-sm text-muted-foreground">
            {member.studentId}
          </span>
        ) : (
          <span className="text-sm text-muted-foreground/30">—</span>
        )}
      </td>
    </tr>
  )
}

interface MemberTableProps {
  members: DirectoryMember[]
}

export function MemberTable({ members }: MemberTableProps) {
  const [query, setQuery] = useState("")
  const [selectedRole, setSelectedRole] = useState<
    MemberRole | typeof ALL_ROLES
  >(ALL_ROLES)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  // Search reveals matches without changing the saved browsing state.
  const isSearching = query.trim().length > 0

  const toggle = (key: string) => {
    if (isSearching) return
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return members
      .filter((m) => {
        if (selectedRole !== ALL_ROLES && m.role !== selectedRole) return false
        if (!q) return true
        return (
          matches(m.name, q) ||
          matches(m.nameEn, q) ||
          matches(m.email, q) ||
          matches(m.phone, q) ||
          matches(m.studentId, q) ||
          matches(m.office, q) ||
          matches(m.position, q) ||
          m.researchAreas.some((a) => a.toLowerCase().includes(q))
        )
      })
      .sort((a, b) => a.name.localeCompare(b.name, "zh-TW"))
  }, [members, query, selectedRole])

  // Unknown roles are appended, not dropped: dropping one removes the member
  // from the table while the footer still counts them via `filtered.length`, so
  // the page contradicts itself instead of erroring.
  //
  // No raw Keycloak value reaches here today — `toMemberRole` normalises every
  // unrecognised role to `pending` upstream — so what this actually guards is
  // ROLE_ORDER lagging ROLE_LABELS when a MemberRole is added. Not dead code;
  // just not the layer that catches malformed attributes.
  const roleGroupOrder = useMemo(() => {
    const present = new Set(members.map((m) => m.role))
    const known = ROLE_ORDER.filter((r) => present.has(r))
    const unknown = [...present].filter((r) => !ROLE_ORDER.includes(r))
    return [...known, ...unknown]
  }, [members])

  const renderYearRows = (
    groupMembers: DirectoryMember[],
    prefix: string,
    labelPrefix: string
  ) => {
    const byYear = new Map<number, DirectoryMember[]>()
    for (const m of groupMembers) {
      const y = getYearFromTitle(m.position)
      if (!byYear.has(y)) byYear.set(y, [])
      byYear.get(y)!.push(m)
    }
    return [...byYear.entries()]
      .sort(([a], [b]) => a - b)
      .map(([year, sgMembers]) => {
        const key = `${prefix}-${year}`
        const isCollapsed = !isSearching && collapsed.has(key)
        return (
          <React.Fragment key={year}>
            <tr
              className="cursor-pointer border-b border-border/40 transition-colors select-none hover:bg-muted/20"
              onClick={() => toggle(key)}
            >
              <td colSpan={99} className="bg-muted/10 px-8 py-1.5">
                <div className="flex items-center gap-1.5">
                  <ChevronRight
                    className={`h-3 w-3 text-muted-foreground/50 transition-transform duration-150 ${
                      isCollapsed ? "" : "rotate-90"
                    }`}
                  />
                  <span className="text-xs font-medium text-muted-foreground/70">
                    {yearLabel(labelPrefix, year)}
                  </span>
                  <span className="ml-1 text-xs text-muted-foreground/40">
                    {sgMembers.length}
                  </span>
                </div>
              </td>
            </tr>
            {!isCollapsed &&
              sgMembers.map((m) => <MemberRow key={m.id} member={m} />)}
          </React.Fragment>
        )
      })
  }

  return (
    <div className="space-y-4">
      {/* Search + Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="搜尋成員"
            placeholder="搜尋姓名、Email、電話、學號、辦公室…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setSelectedRole(ALL_ROLES)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              selectedRole === ALL_ROLES
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            全部
          </button>
          {roleGroupOrder.map((role) => (
            <button
              key={role}
              onClick={() => setSelectedRole(role)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                selectedRole === role
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {ROLE_LABELS[role] ?? role}
            </button>
          ))}
        </div>
      </div>

      {/* Scroll hint — mobile only, above table */}
      <div className="flex items-center justify-end sm:hidden">
        <span className="text-xs text-muted-foreground/40">
          ← 左右滑動查看更多
        </span>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-border">
        <div className="relative">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left">
              <thead>
                <tr className="border-b border-border/60 bg-muted/30">
                  <th className="py-2.5 pr-3 pl-4 text-xs font-medium text-muted-foreground">
                    姓名
                  </th>
                  <th className="px-3 py-2.5 text-xs font-medium text-muted-foreground">
                    身份
                  </th>
                  <th className="px-3 py-2.5 text-xs font-medium text-muted-foreground">
                    Email
                  </th>
                  <th className="px-3 py-2.5 text-xs font-medium text-muted-foreground">
                    電話
                  </th>
                  <th className="hidden px-3 py-2.5 pr-4 text-xs font-medium text-muted-foreground md:table-cell">
                    工號/學號
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td
                      colSpan={99}
                      className="py-16 text-center text-sm text-muted-foreground"
                    >
                      {query ? `找不到「${query}」相關的成員` : "尚無成員資料"}
                    </td>
                  </tr>
                ) : selectedRole !== ALL_ROLES ? (
                  selectedRole === "master" ? (
                    renderYearRows(filtered, "master", "碩")
                  ) : selectedRole === "phd" ? (
                    renderYearRows(filtered, "phd", "博")
                  ) : (
                    filtered.map((m) => <MemberRow key={m.id} member={m} />)
                  )
                ) : (
                  roleGroupOrder.map((role) => {
                    const group = filtered.filter((m) => m.role === role)
                    if (group.length === 0) return null
                    const isCollapsed = !isSearching && collapsed.has(role)
                    return (
                      <React.Fragment key={role}>
                        <tr
                          className="cursor-pointer border-b border-border/50 transition-colors select-none hover:bg-muted/30"
                          onClick={() => toggle(role)}
                        >
                          <td colSpan={99} className="bg-muted/20 px-4 py-1.5">
                            <div className="flex items-center gap-2">
                              <ChevronRight
                                className={`h-3.5 w-3.5 text-muted-foreground/60 transition-transform duration-150 ${
                                  isCollapsed ? "" : "rotate-90"
                                }`}
                              />
                              <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                                {ROLE_LABELS[role] ?? role}
                              </span>
                              <span className="text-xs text-muted-foreground/60">
                                {group.length}
                              </span>
                            </div>
                          </td>
                        </tr>
                        {!isCollapsed &&
                          (role === "master"
                            ? renderYearRows(group, "master", "碩")
                            : role === "phd"
                              ? renderYearRows(group, "phd", "博")
                              : group.map((m) => (
                                  <MemberRow key={m.id} member={m} />
                                )))}
                      </React.Fragment>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
          {/* right-edge fade — mobile scroll hint */}
          <div className="pointer-events-none absolute top-0 right-0 bottom-0 w-10 bg-gradient-to-l from-background to-transparent sm:hidden" />
        </div>

        {filtered.length > 0 && (
          <div className="border-t border-border/60 bg-muted/20 px-4 py-2">
            <p className="text-xs text-muted-foreground">
              共 {filtered.length} 位
              {selectedRole !== ALL_ROLES
                ? (ROLE_LABELS[selectedRole] ?? selectedRole)
                : "成員"}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
