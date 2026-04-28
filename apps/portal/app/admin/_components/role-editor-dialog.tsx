"use client"

import { useEffect, useState, useTransition } from "react"
import { toast } from "sonner"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Label } from "@workspace/ui/components/label"
import { Separator } from "@workspace/ui/components/separator"

import type { AdminUser } from "@/hooks/admin/use-admin-users"
import { useUpdateUserRoles } from "@/hooks/admin/use-admin-users"
import { useAuth } from "@/hooks/use-auth"

const APP_LABELS: Record<string, string> = {
  bento: "訂餐 (Bento)",
  trip: "出差 (Trip)",
  approve: "簽核 (Approve)",
  leave: "請假 (Leave)",
}

function appLabel(app: string) {
  return APP_LABELS[app] ?? app
}

interface RoleEditorDialogProps {
  user: AdminUser | null
  apps: string[]
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function RoleEditorDialog({
  user,
  apps,
  open,
  onOpenChange,
}: RoleEditorDialogProps) {
  const { user: currentUser } = useAuth()
  const updateUser = useUpdateUserRoles()
  const [pending, startTransition] = useTransition()

  const [localRoles, setLocalRoles] = useState<Record<string, string[]>>({})
  const [localIsAdmin, setLocalIsAdmin] = useState(false)

  useEffect(() => {
    if (user) {
      setLocalRoles(user.roles ?? {})
      setLocalIsAdmin(user.is_admin)
    }
  }, [user])

  if (!user) return null

  const isSelf = currentUser?.id === user.id

  const hasAppAdmin = (app: string) =>
    (localRoles[app] ?? []).includes("admin")

  const toggleAppAdmin = (app: string, checked: boolean) => {
    setLocalRoles((prev) => {
      if (checked) return { ...prev, [app]: ["admin"] }
      const { [app]: _, ...rest } = prev
      return rest
    })
  }

  const handleSave = () => {
    startTransition(async () => {
      try {
        await updateUser.mutateAsync({
          targetId: user.id,
          roles: localRoles,
          isAdmin: localIsAdmin,
        })
        toast.success("已更新用戶權限")
        onOpenChange(false)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "更新失敗")
      }
    })
  }

  const displayName = user.name ?? user.email

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next)
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>編輯權限</DialogTitle>
          <DialogDescription className="flex flex-col gap-0.5">
            <span className="font-medium text-foreground">{displayName}</span>
            <span>{user.email}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5 py-2">
          {/* Super admin toggle */}
          <div className="flex flex-col gap-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Portal 超級管理員
            </p>
            <div className="flex items-start gap-3 rounded-lg border border-border p-3">
              <Checkbox
                id="is-admin"
                checked={localIsAdmin}
                disabled={isSelf}
                onCheckedChange={(checked) =>
                  setLocalIsAdmin(checked === true)
                }
                className="mt-0.5"
              />
              <div className="flex flex-col gap-1">
                <Label htmlFor="is-admin" className="cursor-pointer font-medium">
                  is_admin
                </Label>
                <p className="text-xs text-muted-foreground">
                  {isSelf
                    ? "無法移除自己的最高管理員身份"
                    : "賦予後可管理所有用戶權限，請謹慎授予。"}
                </p>
              </div>
            </div>
          </div>

          <Separator />

          {/* Per-app role toggles */}
          <div className="flex flex-col gap-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              App 管理員
            </p>
            <div className="flex flex-col gap-2">
              {apps.map((app) => (
                <div key={app} className="flex items-center gap-3">
                  <Checkbox
                    id={`app-${app}`}
                    checked={hasAppAdmin(app)}
                    onCheckedChange={(checked) =>
                      toggleAppAdmin(app, checked === true)
                    }
                  />
                  <Label htmlFor={`app-${app}`} className="cursor-pointer">
                    {appLabel(app)}
                  </Label>
                  {hasAppAdmin(app) && (
                    <Badge variant="secondary" className="text-xs">
                      admin
                    </Badge>
                  )}
                </div>
              ))}
              {apps.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  尚無任何 app 已設定角色。
                </p>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            取消
          </Button>
          <Button onClick={handleSave} disabled={pending}>
            {pending ? "儲存中…" : "儲存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
