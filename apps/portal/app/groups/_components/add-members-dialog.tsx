"use client"

import { useEffect, useMemo, useState } from "react"
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
  cohortContribution,
  externalAddresses,
  planAdditions,
} from "@/lib/groups/plan"
import { MAX_BATCH } from "@/lib/groups/messages"
import { mayHaveLanded, outcomeUncertain } from "@/lib/groups/uncertain"
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
  profilesLoaded,
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
   * false when user_profiles could not be read. Without lab statuses
   * "exclude alumni" would exclude no one, so adding by cohort is off.
   */
  profilesLoaded: boolean
  /**
   * Addresses Google confirmed (ok or already), spelled the way Google will
   * list them, for the "同步中" overlay.
   */
  onAdded: (emails: string[]) => void
  /** Something may have landed without being confirmed: re-read Google soon. */
  onFailed: () => void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [picked, setPicked] = useState<string[]>([])
  const [cohort, setCohort] = useState("")
  const [excludeAlumni, setExcludeAlumni] = useState(true)
  const [freeText, setFreeText] = useState("")
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!profilesLoaded) setCohort("")
  }, [profilesLoaded])

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
  // A cohort chosen before the profile read failed must not keep feeding
  // the batch: without statuses it would include alumni.
  const cohortPick = cohortContribution(fromCohort?.members, statusByEmail, {
    excludeAlumni,
    profilesLoaded,
  })
  const typed = parseEmailList(freeText)
  const plan = planAdditions(
    [...picked, ...cohortPick.emails, ...typed.valid],
    currentEmails
  )
  const overLimit = plan.toAdd.length > MAX_BATCH
  const outside = externalAddresses(plan.toAdd, domain)

  function reset() {
    setPicked([])
    setCohort("")
    setFreeText("")
    setSearch("")
  }

  async function submit() {
    setBusy(true)
    let res: Awaited<ReturnType<typeof addGroupMembers>>
    try {
      res = await addGroupMembers(groupId, plan.toAdd)
    } catch (err) {
      console.error("[groups] addGroupMembers failed", err)
      // The batch may have reached Google before the connection dropped.
      // Re-read shortly so whatever landed shows up.
      onFailed()
      return toast.error("連線中斷，請稍後確認結果；地址已保留，可重試")
    } finally {
      setBusy(false)
    }
    if (res.status !== "ok") {
      // A batch that stopped part-way still says what came back for the
      // addresses it tried: show the ones that landed, as the success path
      // does. The input stays so the rest can be retried.
      if ("results" in res && res.results)
        onAdded(
          res.results
            .filter((r) => r.outcome === "ok" || r.outcome === "already")
            .map((r) => r.listedAs ?? r.email)
        )
      // Refused before anything was sent (unconfigured, the portal's own
      // refusals, malformed input): nothing landed, so no re-read and no
      // "partly added" hint. Anything else may have stopped part-way, so
      // re-read Google shortly for the list and 最近變更. The input stays
      // either way, so the batch can be retried.
      if (res.status === "unconfigured")
        return toast.error("Google 群組整合尚未設定")
      if (!mayHaveLanded(res)) return toast.error(res.detail)
      onFailed()
      return toast.error(
        `${res.detail}（可能已有部分地址加入，請稍後對照名單與最近變更）`
      )
    }
    const landed = res.data
      .filter((r) => r.outcome === "ok" || r.outcome === "already")
      .map((r) => r.listedAs ?? r.email)
    onAdded(landed)
    const ok = res.data.filter((r) => r.outcome === "ok").length
    const already = res.data.filter((r) => r.outcome === "already").length
    const failed = res.data.filter((r) => r.outcome === "error")
    // A failed address may still have landed (a timeout says "result
    // unknown"): schedule the bounded re-read, and keep the input so those
    // addresses can be retried. Those that did land show up as 已在群組.
    if (res.data.some((r) => outcomeUncertain(r.outcome))) onFailed()
    if (failed.length === 0)
      toast.success(
        `已加入 ${ok} 人${already ? `，${already} 人原本就在` : ""}`
      )
    else {
      toast.error(
        `加入 ${ok} 人${already ? `，${already} 人原本就在` : ""}，失敗 ${failed.length} 人：${failed
          .map((f) => `${f.email}（${f.detail ?? "error"}）`)
          .join("、")}`
      )
      return
    }
    setOpen(false)
    reset()
  }

  return (
    <Dialog
      open={open}
      // Closing mid-flight would let a reopen start a second edit session
      // while the first batch is still being sent.
      onOpenChange={(next) => {
        if (!busy) setOpen(next)
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">加入成員</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>加入成員</DialogTitle>
        </DialogHeader>

        {/* Nothing may change while a batch is in flight: input typed after the
            submit was never sent, and a full success would wipe it. */}
        <fieldset
          disabled={busy}
          className="m-0 flex min-w-0 flex-col gap-4 border-0 p-0 text-sm"
        >
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

          {cohorts && !profilesLoaded && (
            <p className="text-xs text-destructive">
              無法讀取成員在學狀態，暫時不能依屆別加入（否則「排除已知畢業生」不會生效）。
            </p>
          )}
          {cohorts && profilesLoaded && (
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
                排除已知畢業生
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
            {excludeAlumni &&
              cohortPick.unknownStatus > 0 &&
              ` · 在學狀態未知 ${cohortPick.unknownStatus} 人（不會被排除）`}
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
        </fieldset>

        <DialogFooter>
          {overLimit && (
            <p className="mr-auto text-xs text-destructive">
              一次最多加入 {MAX_BATCH} 人，請分批加入。
            </p>
          )}
          <Button
            disabled={busy || plan.toAdd.length === 0 || overLimit}
            onClick={submit}
          >
            確認加入 {plan.toAdd.length} 人
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
