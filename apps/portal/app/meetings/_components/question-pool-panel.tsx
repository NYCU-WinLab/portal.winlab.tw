"use client"

import { useState } from "react"

import { IconPlus, IconScale, IconTrash } from "@tabler/icons-react"
import { Button } from "@workspace/ui/components/button"

import { useLabUsers } from "@/hooks/meetings/use-lab-users"
import {
  useAddPoolMember,
  useQuestionPoolMembers,
  useRemovePoolMember,
} from "@/hooks/meetings/use-question-pool"
import { useRebalanceQuestioners } from "@/hooks/meetings/use-rebalance-questioners"

import { ConfirmDialog } from "./confirm-dialog"

function lastAskedLabel(lastAskedDate: string | null) {
  if (!lastAskedDate) return "從未提問"
  const formatted = new Date(lastAskedDate).toLocaleDateString("zh-TW", {
    month: "numeric",
    day: "numeric",
  })
  return `上次提問：${formatted}`
}

export function QuestionPoolPanel({ isAdmin }: { isAdmin: boolean }) {
  const {
    data: pool = [],
    isLoading,
    isError: poolIsError,
  } = useQuestionPoolMembers()
  const {
    data: labUsers = [],
    isSuccess: labUsersLoaded,
    isError: labUsersIsError,
  } = useLabUsers()
  const addMember = useAddPoolMember()
  const removeMember = useRemovePoolMember()
  const { preview, apply } = useRebalanceQuestioners()
  const [adding, setAdding] = useState(false)

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">載入中…</p>
  }

  // Checked before any empty-state logic: on a query error `isLoading` is
  // false and `data` defaults to `[]`, so without this the panel would fall
  // through to the empty-state branch below — including the sync-problem
  // hint, which would then confidently misdiagnose a Supabase outage as a
  // cron failure.
  if (poolIsError || labUsersIsError) {
    return (
      <p className="text-sm text-destructive">
        讀取成員池失敗，請重新整理頁面再試一次
      </p>
    )
  }

  const poolIds = new Set(pool.map((m) => m.userId))
  const candidates = labUsers.filter((u) => !poolIds.has(u.id))

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          額外提問成員（報告人以外）
        </p>
        {isAdmin && (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              disabled={preview.isPending || apply.isPending}
              className="h-6 gap-1 px-2 text-xs text-muted-foreground"
              onClick={() => preview.mutate()}
            >
              <IconScale className="h-3 w-3" />
              重新平衡
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 gap-1 px-2 text-xs text-muted-foreground"
              onClick={() => setAdding((v) => !v)}
            >
              <IconPlus className="h-3 w-3" />
              新增成員
            </Button>
          </div>
        )}
      </div>

      {isAdmin && preview.data && (
        <div className="flex flex-col gap-2 rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">
            {preview.data.frozenDate
              ? `預覽：${preview.data.frozenDate} 當週維持不動，其後 ${preview.data.weeks} 週共 ${preview.data.assigned} 個名額會重新分配`
              : "目前沒有可重新平衡的未來週次"}
          </p>
          {preview.data.roster.length > 0 && (
            <div className="flex max-h-64 flex-col gap-1 overflow-y-auto">
              {preview.data.roster.map((w) => (
                <div
                  key={w.meetingId}
                  className="flex items-baseline justify-between gap-3 text-xs"
                >
                  <span className="shrink-0 text-muted-foreground">
                    {w.date}
                  </span>
                  <span className="text-right">
                    {w.questioners.length > 0
                      ? w.questioners.join("、")
                      : "（無人可排）"}
                  </span>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              className="h-7 text-xs"
              disabled={apply.isPending || preview.data.roster.length === 0}
              onClick={() =>
                apply.mutate(undefined, { onSuccess: () => preview.reset() })
              }
            >
              確認套用
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-muted-foreground"
              disabled={apply.isPending}
              onClick={() => preview.reset()}
            >
              取消
            </Button>
          </div>
        </div>
      )}

      {isAdmin && adding && (
        <div className="flex flex-wrap gap-1.5 rounded-lg border p-2">
          {candidates.length === 0 ? (
            labUsersLoaded && labUsers.length === 0 ? (
              <span className="text-xs text-muted-foreground">
                候選名單目前是空的，/api/cron/kc-lab-status 可能尚未成功同步過
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">
                所有成員皆已加入
              </span>
            )
          ) : (
            candidates.map((u) => (
              <button
                key={u.id}
                type="button"
                disabled={addMember.isPending}
                onClick={() => addMember.mutate(u.id)}
                className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted/70"
              >
                {u.name ?? u.id}
              </button>
            ))
          )}
        </div>
      )}

      {pool.length === 0 ? (
        <p className="text-xs text-muted-foreground">尚未加入任何成員</p>
      ) : (
        <div className="flex flex-col gap-1">
          {pool.map((m, i) => (
            <div
              key={m.userId}
              className="flex items-center justify-between gap-2 rounded-lg border p-2"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{m.name ?? "—"}</span>
                {i === 0 && (
                  <span className="rounded-md bg-muted px-2 py-0.5 text-xs">
                    下一位
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground">
                  {lastAskedLabel(m.lastAskedDate)}
                </span>
                <span className="text-xs text-muted-foreground">
                  已提問 {m.timesAsked} 次
                  {m.timesAskedScheduled > 0 &&
                    `・已排定 ${m.timesAskedScheduled} 次`}
                </span>
                {isAdmin && (
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
                    title="移出成員池？"
                    description={`將「${m.name ?? "此成員"}」移出提問小組成員池，過去的提問紀錄仍會保留，但之後不會再被排入輪替。`}
                    variant="destructive"
                    onConfirm={() => removeMember.mutate(m.userId)}
                  />
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {isAdmin && (
        <p className="text-xs text-muted-foreground">
          ＊每週自動依公平輪替排定 3
          位提問人；候選人＝報告順位名單＋此處額外成員，當週報告人不會被排入自己那週。
          排序依「已排次數 ÷
          加入後的機會數」，所以晚加入的人不會因為來得晚而被當成欠很多次。
          增刪成員會自動重新平衡；「重新平衡」按鈕是在沒有增刪時手動觸發一次，
          最近一場尚未發生的會議與所有手動指定都不會被動到。
        </p>
      )}
    </div>
  )
}
