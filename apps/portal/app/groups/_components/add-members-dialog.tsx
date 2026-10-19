"use client"

import { useMemo, useState } from "react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import { Textarea } from "@workspace/ui/components/textarea"

import { parseEmailList } from "@/lib/groups/email"
import {
  cohortCandidates,
  externalAddresses,
  planAdditions,
} from "@/lib/groups/plan"
import type { KeycloakGroupMember } from "@/lib/rooms/keycloak-groups"

import { addGroupMembers } from "../actions"

type Person = {
  id: string
  name: string | null
  email: string
  labStatus: string | null
}
type Cohort = { name: string; members: KeycloakGroupMember[] }

export function AddMembersDialog({
  groupId,
  domain,
  currentEmails,
  people,
  cohorts,
  onAdded,
  onFailed,
}: {
  groupId: string
  domain: string
  /** Google's list plus what this page just added, minus what it just removed. */
  currentEmails: string[]
  people: Person[]
  /** null when Keycloak could not be read: the cohort picker is hidden. */
  cohorts: Cohort[] | null
  /**
   * Addresses Google confirmed (ok or already), spelled the way Google will
   * list them, for the "同步中" overlay.
   */
  onAdded: (emails: string[]) => void
  /** The batch failed as a whole; some of it may still have landed. */
  onFailed: () => void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [picked, setPicked] = useState<string[]>([])
  const [cohort, setCohort] = useState("")
  const [excludeAlumni, setExcludeAlumni] = useState(true)
  const [freeText, setFreeText] = useState("")
  const [busy, setBusy] = useState(false)

  const statusByEmail = useMemo(
    () => new Map(people.map((p) => [p.email, p.labStatus])),
    [people]
  )
  const matches = search.trim()
    ? people
        .filter((p) =>
          `${p.name ?? ""} ${p.email}`
            .toLowerCase()
            .includes(search.trim().toLowerCase())
        )
        .slice(0, 8)
    : []
  const fromCohort = cohorts?.find((c) => c.name === cohort)
  const cohortPick = fromCohort
    ? cohortCandidates(fromCohort.members, statusByEmail, { excludeAlumni })
    : { emails: [], skippedNoEmail: 0, skippedAlumni: 0 }
  const typed = parseEmailList(freeText)
  const plan = planAdditions(
    [...picked, ...cohortPick.emails, ...typed.valid],
    currentEmails
  )
  const outside = externalAddresses(plan.toAdd, domain)

  function reset() {
    setPicked([])
    setCohort("")
    setFreeText("")
    setSearch("")
  }

  async function submit() {
    setBusy(true)
    const res = await addGroupMembers(groupId, plan.toAdd)
    setBusy(false)
    if (res.status !== "ok") {
      // A permission or credential failure stops the batch part-way and
      // comes back without per-address results. Re-read Google shortly, so
      // whatever did land shows up in the list and in 最近變更.
      onFailed()
      return toast.error(
        res.status === "unconfigured" ? "Google 群組整合尚未設定" : res.detail
      )
    }
    const landed = res.data
      .filter((r) => r.outcome === "ok" || r.outcome === "already")
      .map((r) => r.listedAs ?? r.email)
    onAdded(landed)
    const ok = res.data.filter((r) => r.outcome === "ok").length
    const already = res.data.filter((r) => r.outcome === "already").length
    const failed = res.data.filter((r) => r.outcome === "error")
    if (failed.length === 0)
      toast.success(
        `已加入 ${ok} 人${already ? `，${already} 人原本就在` : ""}`
      )
    else
      toast.error(
        `加入 ${ok} 人，失敗 ${failed.length} 人：${failed
          .map((f) => `${f.email}（${f.detail ?? "error"}）`)
          .join("、")}`
      )
    setOpen(false)
    reset()
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">加入成員</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>加入成員</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 text-sm">
          <label className="flex flex-col gap-1">
            <span className="text-muted-foreground">從實驗室成員挑選</span>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="姓名或 email"
            />
            {matches.map((p) => (
              <button
                key={p.id}
                type="button"
                className="text-left hover:underline"
                onClick={() => {
                  setPicked((xs) =>
                    xs.includes(p.email) ? xs : [...xs, p.email]
                  )
                  setSearch("")
                }}
              >
                {p.name ?? p.email}{" "}
                <span className="text-muted-foreground">{p.email}</span>
              </button>
            ))}
            {picked.length > 0 && (
              <span className="text-xs text-muted-foreground">
                已挑選：{picked.join(", ")}
              </span>
            )}
          </label>

          {cohorts && (
            <label className="flex flex-col gap-1">
              <span className="text-muted-foreground">依屆別加入</span>
              <select
                className="rounded-md border bg-background px-2 py-1"
                value={cohort}
                onChange={(e) => setCohort(e.target.value)}
              >
                <option value="">（不使用）</option>
                {cohorts.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name} 級（{c.members.length} 人）
                  </option>
                ))}
              </select>
              <span className="flex items-center gap-2">
                <Checkbox
                  checked={excludeAlumni}
                  onCheckedChange={(v) => setExcludeAlumni(v === true)}
                />
                排除已畢業
              </span>
            </label>
          )}

          <label className="flex flex-col gap-1">
            <span className="text-muted-foreground">
              直接輸入 email（外部成員，沒有 Google 帳號也可以）
            </span>
            <Textarea
              value={freeText}
              onChange={(e) => setFreeText(e.target.value)}
              placeholder="一行一個，或以逗號分隔"
            />
          </label>

          <div className="rounded-md border p-3 text-xs">
            將加入 <b>{plan.toAdd.length}</b> 人 · 已在群組{" "}
            {plan.already.length} 人
            {typed.invalid.length > 0 &&
              ` · 格式錯誤 ${typed.invalid.length} 筆（${typed.invalid.join(", ")}）`}
            {cohortPick.skippedAlumni > 0 &&
              ` · 排除已畢業 ${cohortPick.skippedAlumni} 人`}
            {cohortPick.skippedNoEmail > 0 &&
              ` · 無 email ${cohortPick.skippedNoEmail} 人`}
            {plan.toAdd.length > 0 && (
              <p className="mt-2 break-all text-muted-foreground">
                {plan.toAdd.join(", ")}
              </p>
            )}
            {outside.length > 0 && (
              <p className="mt-2 text-muted-foreground">
                其中 {outside.length} 個是 {domain}{" "}
                以外的地址：若這個群組原本不允許外部成員，Google
                會自動改成允許（只有管理員能加外部成員），之後移除成員也不會改回。
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button disabled={busy || plan.toAdd.length === 0} onClick={submit}>
            確認加入 {plan.toAdd.length} 人
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
