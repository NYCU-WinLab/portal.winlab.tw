"use client"

import { useMemo, useState } from "react"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Skeleton } from "@workspace/ui/components/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

import type { AdminUser } from "@/hooks/admin/use-admin-users"
import { useAdminUsers } from "@/hooks/admin/use-admin-users"

import { RoleEditorDialog } from "./role-editor-dialog"

// Derive the full app list from actual data + known portal apps
const KNOWN_APPS = ["bento", "trip", "approve", "leave"]

function deriveApps(users: AdminUser[]): string[] {
  const set = new Set<string>(KNOWN_APPS)
  users.forEach((u) => Object.keys(u.roles).forEach((k) => set.add(k)))
  return Array.from(set).sort()
}

export function UserManagement() {
  const { data: users, isLoading, error } = useAdminUsers()
  const [search, setSearch] = useState("")
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null)

  const apps = useMemo(() => deriveApps(users ?? []), [users])

  const filtered = useMemo(() => {
    if (!users) return []
    const q = search.toLowerCase()
    return users.filter(
      (u) =>
        (u.name ?? "").toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q)
    )
  }, [users, search])

  if (error) {
    return (
      <p className="text-sm text-destructive">
        載入失敗：{error instanceof Error ? error.message : "未知錯誤"}
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-medium">用戶管理</h1>
        <p className="text-sm text-muted-foreground">
          管理所有用戶的 app 管理員權限與 Portal 超級管理員身份。
        </p>
      </div>

      <Input
        placeholder="搜尋姓名或 Email…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
      />

      {isLoading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>用戶</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>角色</TableHead>
                <TableHead className="w-20 text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="py-10 text-center text-sm text-muted-foreground"
                  >
                    {search ? "找不到符合的用戶。" : "目前沒有任何用戶。"}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((user) => (
                  <UserRow
                    key={user.id}
                    user={user}
                    onEdit={() => setEditingUser(user)}
                  />
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <RoleEditorDialog
        user={editingUser}
        apps={apps}
        open={!!editingUser}
        onOpenChange={(open) => {
          if (!open) setEditingUser(null)
        }}
      />
    </div>
  )
}

function UserRow({
  user,
  onEdit,
}: {
  user: AdminUser
  onEdit: () => void
}) {
  const appAdminEntries = Object.entries(user.roles).filter(([, roles]) =>
    roles.includes("admin")
  )

  return (
    <TableRow>
      <TableCell className="font-medium">
        {user.name ?? (
          <span className="text-muted-foreground">(未設定名稱)</span>
        )}
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {user.email}
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap gap-1.5">
          {user.is_admin && (
            <Badge className="text-xs">Portal Admin</Badge>
          )}
          {appAdminEntries.map(([app]) => (
            <Badge key={app} variant="secondary" className="text-xs">
              {app}
            </Badge>
          ))}
          {!user.is_admin && appAdminEntries.length === 0 && (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </div>
      </TableCell>
      <TableCell className="text-right">
        <Button variant="ghost" size="sm" onClick={onEdit}>
          編輯
        </Button>
      </TableCell>
    </TableRow>
  )
}
