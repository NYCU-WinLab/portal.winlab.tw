"use client"

import { useState, useTransition, type FormEvent } from "react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { Textarea } from "@workspace/ui/components/textarea"

import {
  IP_USER_CATEGORIES,
  ipUserInput,
  type IpUserCategory,
  type IpUserEntry,
} from "@/lib/admin/ip-users"

import { saveIpUser } from "../actions"

export function IpUserEditor({
  entry,
  reserved,
  onClose,
}: {
  entry: IpUserEntry | null
  reserved: boolean
  onClose: () => void
}) {
  const [ip, setIp] = useState(entry?.ip ?? "")
  const [userName, setUserName] = useState(entry?.user_name ?? "")
  const [category, setCategory] = useState<IpUserCategory>(
    entry?.category ?? "unclassified"
  )
  const [notes, setNotes] = useState(entry?.notes ?? "")
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const parsed = ipUserInput.safeParse({
      id: entry?.id ?? null,
      ip,
      user_name: userName,
      category,
      notes,
      expected_revision: entry?.revision ?? null,
    })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "請確認輸入內容")
      return
    }
    setError(null)
    startTransition(async () => {
      try {
        const result = await saveIpUser(parsed.data)
        if (!result.ok) {
          setError(result.error)
          return
        }
        toast.success(entry ? "已更新 IP 紀錄" : "已新增 IP 紀錄")
        onClose()
      } catch {
        setError("無法連線，請稍後再試")
      }
    })
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose()
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{entry ? "編輯 IP 紀錄" : "新增 IP 紀錄"}</DialogTitle>
          <DialogDescription>
            {reserved
              ? "保留位址可修改使用者與備註，IP 無法變更。"
              : "填寫此 IP 的使用者、設備分類與備註。"}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-5">
          <div className="grid gap-2">
            <Label htmlFor="ip-address">IP</Label>
            <Input
              id="ip-address"
              value={ip}
              onChange={(e) => setIp(e.target.value)}
              required
              disabled={reserved || pending}
              placeholder="完整 IPv4 位址"
              autoComplete="off"
              className="font-mono"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="ip-user">USER</Label>
            <Input
              id="ip-user"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              maxLength={200}
              disabled={pending}
              placeholder="姓名、共用設備或用途"
              autoComplete="off"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="ip-category">分類</Label>
            <Select
              value={category}
              onValueChange={(value) => setCategory(value as IpUserCategory)}
              disabled={pending}
            >
              <SelectTrigger id="ip-category" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(IP_USER_CATEGORIES).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="ip-notes">備註</Label>
            <Textarea
              id="ip-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={2000}
              disabled={pending}
              rows={3}
              placeholder="保留原因、移交紀錄或其他說明"
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={onClose}
            >
              取消
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "儲存中…" : "儲存"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
