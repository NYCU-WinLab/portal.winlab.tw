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
import { mayHaveLanded } from "@/lib/groups/uncertain"

import { removeGroupMember } from "../actions"

type Person = { name: string | null; email: string; labStatus: string | null }

function tags(m: ShownMember, known: boolean, profilesLoaded: boolean): string {
  const parts: string[] = []
  if (!m.email) parts.push(m.type === "CUSTOMER" ? "整個網域" : "（無地址）")
  else if (profilesLoaded && !known) parts.push("外部")
  if (m.type === "GROUP") parts.push("群組")
  if (!isPlainMember(m.role)) parts.push(m.role)
  if (m.pending) parts.push("同步中")
  return parts.join(" · ")
}

export function MemberList({
  groupId,
  members,
  waiting,
  people,
  profilesLoaded,
  onRemoved,
  onFailed,
}: {
  groupId: string
  members: ShownMember[]
  /** Addresses of a batch still being sent: no result yet, so no 移除. */
  waiting: { email: string; sending: boolean }[]
  people: Person[]
  /** false when profiles could not be read: don't tag every member 外部. */
  profilesLoaded: boolean
  onRemoved: (email: string) => void
  /** The removal may have landed, or the list is stale: re-read soon. */
  onFailed: () => void
}) {
  const [target, setTarget] = useState<string | null>(null)
  // Addresses with a removal in flight. A second dialog can open while the
  // first request is still running, so each request only clears its own.
  const [inflight, setInflight] = useState<string[]>([])
  const busy = target !== null && inflight.includes(target)
  const byEmail = new Map(people.map((p) => [p.email, p]))

  async function remove(email: string) {
    setInflight((xs) => [...xs, email])
    let res: Awaited<ReturnType<typeof removeGroupMember>>
    try {
      res = await removeGroupMember(groupId, email)
    } catch (err) {
      console.error("[groups] removeGroupMember failed", err)
      // The removal may have reached Google; re-read shortly.
      onFailed()
      return toast.error("連線中斷，請稍後確認結果")
    } finally {
      setInflight((xs) => xs.filter((x) => x !== email))
      setTarget((t) => (t === email ? null : t))
    }
    if (res.status !== "ok") {
      if (mayHaveLanded(res)) onFailed()
      return toast.error(
        res.status === "unconfigured" ? "Google 群組整合尚未設定" : res.detail
      )
    }
    const outcome = res.data.outcome
    if (outcome === "ok") {
      toast.success(`已移除 ${email}`)
      onRemoved(email)
    } else if (outcome === "not_found") {
      // Our list was stale. Nothing was removed by this click, so say so and
      // re-read instead of reporting a success.
      toast(`${email} 已不在群組中`)
      onFailed()
    } else if (outcome === "protected") {
      toast.error("不能移除群組擁有者或管理者")
    } else {
      // An error outcome may have landed (a timeout says "result unknown").
      onFailed()
      toast.error(`移除失敗：${res.data.detail ?? outcome}`)
    }
  }

  return (
    <>
      <ul className="flex flex-col divide-y">
        {members.map((m, i) => {
          const person = m.email ? byEmail.get(m.email) : undefined
          const extra = tags(m, Boolean(person), profilesLoaded)
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
        {waiting.map((w, i) => {
          const person = byEmail.get(w.email)
          const label = w.sending ? "送出中" : "等待送出"
          return (
            <li
              key={`waiting-${i}-${w.email}`}
              className="flex items-center justify-between py-2 opacity-60"
            >
              <div className="flex flex-col">
                <span>{person?.name ?? w.email}</span>
                <span className="text-xs text-muted-foreground">
                  {person ? `${w.email} · ${label}` : label}
                </span>
              </div>
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
