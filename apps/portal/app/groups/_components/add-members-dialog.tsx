"use client"

import { useEffect, useMemo, useState } from "react"

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
import type { KeycloakGroupMember } from "@/lib/rooms/keycloak-groups"

import { useGroupsBatch } from "./batch-provider"

type Person = {
  id: string
  name: string | null
  email: string
  labStatus: string | null
}
type Cohort = { name: string; members: KeycloakGroupMember[] }

export function AddMembersDialog({
  groupId,
  groupEmail,
  domain,
  currentEmails,
  people,
  cohorts,
  profilesLoaded,
}: {
  groupId: string
  groupEmail: string
  domain: string
  /**
   * Google's list plus what this page just added, minus what it just
   * removed, plus what is still waiting to be sent.
   */
  currentEmails: string[]
  people: Person[]
  /** null when Keycloak could not be read: the cohort picker is hidden. */
  cohorts: Cohort[] | null
  /**
   * false when user_profiles could not be read. Without lab statuses
   * "exclude alumni" would exclude no one, so adding by cohort is off.
   */
  profilesLoaded: boolean
}) {
  const { enqueue, prefillOf, clearPrefill } = useGroupsBatch()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [picked, setPicked] = useState<string[]>([])
  const [cohort, setCohort] = useState("")
  const [excludeAlumni, setExcludeAlumni] = useState(true)
  const [freeText, setFreeText] = useState("")

  // A failed batch's 重新加入 brings its addresses back here, in place of
  // whatever was being edited, for the member to look over and send again.
  // Adjusting state while rendering, React's pattern for derived state; the
  // provider's copy is cleared after commit so it opens only once.
  const prefill = prefillOf(groupId)
  const [seenPrefill, setSeenPrefill] = useState<string[] | null>(null)
  if (prefill && prefill !== seenPrefill) {
    setSeenPrefill(prefill)
    setPicked([])
    setCohort("")
    setSearch("")
    setFreeText(prefill.join("\n"))
    setOpen(true)
  }
  useEffect(() => {
    if (prefill) clearPrefill(groupId)
  }, [prefill, groupId, clearPrefill])

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

  // The batch goes to the background runner, which sends it in chunks and
  // reports in a toast; the dialog is free for the next one right away.
  // Addresses still waiting count as present (currentEmails), so sending the
  // same ones again before they land adds nothing twice.
  function submit() {
    enqueue({ groupId, groupEmail, emails: plan.toAdd })
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

        <div className="flex min-w-0 flex-col gap-4 text-sm">
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
        </div>

        <DialogFooter>
          {overLimit && (
            <p className="mr-auto text-xs text-destructive">
              一次最多加入 {MAX_BATCH} 人，請分批加入。
            </p>
          )}
          <Button
            disabled={plan.toAdd.length === 0 || overLimit}
            onClick={submit}
          >
            確認加入 {plan.toAdd.length} 人
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
