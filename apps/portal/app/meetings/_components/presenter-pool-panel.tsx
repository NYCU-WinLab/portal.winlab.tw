"use client"

import { useRef, useState } from "react"

import {
  IconChevronDown,
  IconChevronUp,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"

import { useLabUsers } from "@/hooks/meetings/use-lab-users"
import {
  useMovePresenter,
  usePresenterPool,
  useRemovePresenter,
  useUpsertPresenter,
} from "@/hooks/meetings/use-presenter-pool"
import { useSemesters } from "@/hooks/meetings/use-semesters"
import {
  admissionYearLabel,
  parseAdmissionYear,
  tierGradeLabel,
} from "@/lib/meetings/admission-year"
import type { PresenterPoolMember } from "@/lib/meetings/types"

import { suggestAdmissionYear } from "../actions"
import { ConfirmDialog } from "./confirm-dialog"

/**
 * 先依學制分層，層內再依入學年分組。兩層都用 tier_rank / admission_year 升冪，
 * 與 meetings_fill_presenters 走訪順位名單的順序一致。
 */
function groupByTierAndCohort(pool: PresenterPoolMember[]) {
  const tiers = new Map<number, Map<number, PresenterPoolMember[]>>()
  for (const member of pool) {
    const cohorts = tiers.get(member.tierRank) ?? new Map()
    const list = cohorts.get(member.admissionYear) ?? []
    list.push(member)
    cohorts.set(member.admissionYear, list)
    tiers.set(member.tierRank, cohorts)
  }
  return [...tiers.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(
      ([tierRank, cohorts]) =>
        [tierRank, [...cohorts.entries()].sort((a, b) => a[0] - b[0])] as const
    )
}

export function PresenterPoolPanel({ isAdmin }: { isAdmin: boolean }) {
  const { data: pool = [], isLoading } = usePresenterPool()
  const { data: labUsers = [] } = useLabUsers()
  const { data: semesters = [] } = useSemesters()
  // 最新一個學期的學年度就是「現在」。semesters 依 start_date 升冪，取最後一筆。
  const academicYear = semesters.at(-1)?.academicYear ?? null
  const upsert = useUpsertPresenter()
  const remove = useRemovePresenter()
  const move = useMovePresenter()

  const [adding, setAdding] = useState(false)
  const [picked, setPicked] = useState<{ id: string; name: string } | null>(
    null
  )
  const [year, setYear] = useState("")
  const [hint, setHint] = useState<string | null>(null)
  // Which candidate the in-flight lookup belongs to, so a slow answer for an
  // earlier pick can be discarded rather than landing on the current one.
  const lookupFor = useRef<string | null>(null)

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">載入中…</p>
  }

  const pooled = new Set(pool.map((m) => m.userId))
  const candidates = labUsers.filter((u) => !pooled.has(u.id))
  const tiers = groupByTierAndCohort(pool)
  const parsedYear = parseAdmissionYear(year)

  async function pick(user: { id: string; name: string | null }) {
    const name = user.name ?? user.id
    lookupFor.current = user.id
    setPicked({ id: user.id, name })
    setYear("")
    setHint("查詢入學學年中…")

    let suggestion: Awaited<ReturnType<typeof suggestAdmissionYear>>
    try {
      suggestion = await suggestAdmissionYear(user.id)
    } catch {
      // Without this the hint would sit on "查詢中…" forever and the admin
      // would have no idea the lookup died.
      if (lookupFor.current === user.id) {
        setHint("查詢入學學年失敗，請手動填寫")
      }
      return
    }

    // Two clicks in quick succession resolve out of order. Dropping the stale
    // answer stops the form showing one member's name beside another's year —
    // which would silently file them under the wrong cohort.
    if (lookupFor.current !== user.id) return

    if (suggestion.status === "found") {
      setYear(String(suggestion.year))
      setHint(
        suggestion.source === "keycloak"
          ? "已自動帶入 Keycloak 的入學學年"
          : "Keycloak 沒有入學學年，已從學號推算"
      )
    } else if (suggestion.status === "forbidden") {
      setHint("沒有查詢權限，請手動填寫")
    } else {
      setHint("Keycloak 查不到入學學年，請手動填寫")
    }
  }

  function submit() {
    if (!picked || parsedYear === null) return
    upsert.mutate(
      { userId: picked.id, admissionYear: parsedYear },
      {
        onSuccess: () => {
          lookupFor.current = null
          setPicked(null)
          setYear("")
          setHint(null)
          setAdding(false)
        },
      }
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">報告順位名單</p>
        {isAdmin && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 gap-1 px-2 text-xs text-muted-foreground"
            onClick={() => {
              setAdding((v) => !v)
              lookupFor.current = null
              setPicked(null)
              setHint(null)
            }}
          >
            <IconPlus className="h-3 w-3" />
            新增成員
          </Button>
        )}
      </div>

      {isAdmin && adding && (
        <div className="flex flex-col gap-2 rounded-lg border p-2">
          {!picked ? (
            <div className="flex flex-wrap gap-1.5">
              {candidates.length === 0 ? (
                <span className="text-xs text-muted-foreground">
                  所有成員皆已加入
                </span>
              ) : (
                candidates.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => pick(u)}
                    className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted/70"
                  >
                    {u.name ?? u.id}
                  </button>
                ))
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{picked.name}</span>
                <Input
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  placeholder="入學學年，如 113"
                  inputMode="numeric"
                  className="h-7 w-40 text-sm"
                />
                <Button
                  size="sm"
                  className="h-7"
                  disabled={parsedYear === null || upsert.isPending}
                  onClick={submit}
                >
                  加入
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-muted-foreground"
                  onClick={() => {
                    lookupFor.current = null
                    setPicked(null)
                    setHint(null)
                  }}
                >
                  取消
                </Button>
              </div>
              {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
              {year.length > 0 && parsedYear === null && (
                <p className="text-xs text-destructive">
                  請填民國學年（90–199），例如 113
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {pool.length === 0 ? (
        <p className="text-xs text-muted-foreground">尚未排定任何報告順位</p>
      ) : (
        <div className="flex flex-col gap-2">
          {tiers.map(([tierRank, cohorts]) => (
            <div key={tierRank} className="flex flex-col gap-1">
              {cohorts.map(([cohort, members]) => (
                <div key={cohort} className="flex flex-col gap-1">
                  <p className="text-xs text-muted-foreground">
                    {(academicYear !== null &&
                      tierGradeLabel(
                        members[0]?.labStatus ?? null,
                        academicYear,
                        cohort
                      )) ??
                      admissionYearLabel(cohort)}
                  </p>
                  {members.map((m, i) => (
                    <div
                      key={m.userId}
                      className="flex items-center justify-between gap-2 rounded-lg border p-2"
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-5 text-xs text-muted-foreground">
                          {m.sortOrder}
                        </span>
                        <span className="text-sm font-medium">
                          {m.name ?? "—"}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="mr-2 text-xs text-muted-foreground">
                          已報告 {m.timesPresented} 次
                        </span>
                        {isAdmin && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-muted-foreground"
                              disabled={i === 0 || move.isPending}
                              onClick={() =>
                                move.mutate({ userId: m.userId, delta: -1 })
                              }
                            >
                              <IconChevronUp className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-muted-foreground"
                              disabled={
                                i === members.length - 1 || move.isPending
                              }
                              onClick={() =>
                                move.mutate({ userId: m.userId, delta: 1 })
                              }
                            >
                              <IconChevronDown className="h-3.5 w-3.5" />
                            </Button>
                            <ConfirmDialog
                              trigger={
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 text-muted-foreground hover:text-destructive"
                                >
                                  <IconTrash className="h-3.5 w-3.5" />
                                </Button>
                              }
                              title="移出報告順位？"
                              description={`將「${m.name ?? "此成員"}」移出報告順位名單，同屆其他人的順位會自動遞補。已排定的週次不會變動。`}
                              variant="destructive"
                              onConfirm={() => remove.mutate(m.userId)}
                            />
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {isAdmin && (
        <p className="text-xs text-muted-foreground">
          ＊排班表的編輯模式可依此順位一鍵填入空白週，資深屆先、同屆依順位循環
        </p>
      )}
    </div>
  )
}
