"use client"

import { useState } from "react"
import { toast } from "sonner"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog"
import { Button } from "@workspace/ui/components/button"

import { isPlainMember, type ShownMember } from "@/lib/groups/plan"

import { removeGroupMember } from "../actions"

type Person = { name: string | null; email: string; labStatus: string | null }

function tags(m: ShownMember, known: boolean): string {
  const parts: string[] = []
  if (!m.email) parts.push(m.type === "CUSTOMER" ? "整個網域" : "（無地址）")
  else if (!known) parts.push("外部")
  if (m.type === "GROUP") parts.push("群組")
  if (!isPlainMember(m.role)) parts.push(m.role)
  if (m.pending) parts.push("同步中")
  return parts.join(" · ")
}

export function MemberList({
  groupId,
  members,
  people,
  onRemoved,
  onFailed,
}: {
  groupId: string
  members: ShownMember[]
  people: Person[]
  onRemoved: (email: string) => void
  onFailed: () => void
}) {
  const [target, setTarget] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const byEmail = new Map(people.map((p) => [p.email, p]))

  async function remove(email: string) {
    setBusy(true)
    let res: Awaited<ReturnType<typeof removeGroupMember>>
    try {
      res = await removeGroupMember(groupId, email)
    } catch (err) {
      console.error("[groups] removeGroupMember failed", err)
      // The removal may have reached Google; re-read shortly.
      onFailed()
      return toast.error("連線中斷，請稍後確認結果")
    } finally {
      setBusy(false)
      setTarget(null)
    }
    if (res.status !== "ok")
      return toast.error(
        res.status === "unconfigured" ? "Google 群組整合尚未設定" : res.detail
      )
    const outcome = res.data.outcome
    if (outcome === "ok") {
      toast.success(`已移除 ${email}`)
      onRemoved(email)
    } else if (outcome === "not_found") {
      toast.success(`${email} 已不在群組`)
      onRemoved(email)
    } else if (outcome === "protected") {
      toast.error("不能移除群組擁有者或管理者")
    } else {
      toast.error(`移除失敗：${res.data.detail ?? outcome}`)
    }
  }

  return (
    <>
      <ul className="flex flex-col divide-y">
        {members.map((m, i) => {
          const person = m.email ? byEmail.get(m.email) : undefined
          const extra = tags(m, Boolean(person))
          return (
            <li
              key={m.id ?? m.email ?? `row-${i}`}
              className="flex items-center justify-between py-2"
            >
              <div className="flex flex-col">
                <span>{person?.name ?? m.email ?? "—"}</span>
                <span className="text-xs text-muted-foreground">
                  {person ? m.email : ""}
                  {person && extra ? " · " : ""}
                  {extra}
                  {person?.labStatus === "alumni" ? " · 已畢業" : ""}
                </span>
              </div>
              {isPlainMember(m.role) && m.email && !m.pending && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setTarget(m.email)}
                >
                  移除
                </Button>
              )}
            </li>
          )
        })}
      </ul>
      <AlertDialog
        open={target !== null}
        onOpenChange={(o) => !o && setTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>移除成員？</AlertDialogTitle>
            <AlertDialogDescription>
              {target} 將不再收到這個群組的信，變更會立即送到 Google。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={() => target && remove(target)}
            >
              移除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
