"use client"

import { useState } from "react"

import { IconPlus, IconScale, IconX } from "@tabler/icons-react"
import { Button } from "@workspace/ui/components/button"
import { Switch } from "@workspace/ui/components/switch"

import { useLabUsers } from "@/hooks/meetings/use-lab-users"
import {
  useAddPoolMember,
  useQuestionPool,
  useRemovePoolMember,
  useSetQuestionerEnabled,
} from "@/hooks/meetings/use-question-pool"
import { useRebalanceQuestioners } from "@/hooks/meetings/use-rebalance-questioners"
import {
  extraCandidates,
  formatMonthDay,
  lastAskedLabel,
  summarizeRoster,
} from "@/lib/meetings/questioner-roster"
import type { QuestionPoolMember } from "@/lib/meetings/types"

import { ConfirmDialog } from "./confirm-dialog"
import { NotScheduledBadge } from "./not-scheduled-badge"

function QuestionerRow({
  member,
  isAdmin,
  pending,
  onToggle,
}: {
  member: QuestionPoolMember
  isAdmin: boolean
  pending: boolean
  onToggle: (enabled: boolean) => void
}) {
  return (
    <div
      className={`flex items-center justify-between gap-2 rounded-lg border p-2 ${
        member.isEnabled ? "" : "opacity-60"
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">{member.name ?? "—"}</span>
        <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
          {member.isPresenter ? "報告人" : "額外"}
        </span>
        <NotScheduledBadge labStatus={member.labStatus} />
        {!member.isEnabled && (
          <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
            已停用
          </span>
        )}
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs text-muted-foreground">
          {lastAskedLabel(member.lastAskedDate)}
        </span>
        <span className="text-xs text-muted-foreground">
          已提問 {member.timesAsked} 次
          {member.timesAskedScheduled > 0 &&
            `・已排定 ${member.timesAskedScheduled} 次`}
        </span>
        {/* Default questioners are paused, not removed: they stay on the
            presenter roster. Extra members are managed in the field below. */}
        {isAdmin && member.isPresenter && (
          <Switch
            size="sm"
            checked={member.isEnabled}
            disabled={pending}
            aria-label={`${member.name ?? "此成員"}的提問`}
            onCheckedChange={onToggle}
          />
        )}
      </div>
    </div>
  )
}

export function QuestionPoolPanel({ isAdmin }: { isAdmin: boolean }) {
  const { data: members = [], isLoading, isError } = useQuestionPool()
  const {
    data: labUsers = [],
    isSuccess: labUsersLoaded,
    isError: labUsersIsError,
  } = useLabUsers()
  const addMember = useAddPoolMember()
  const removeMember = useRemovePoolMember()
  const setEnabled = useSetQuestionerEnabled()
  const { preview, apply } = useRebalanceQuestioners()
  const [adding, setAdding] = useState(false)

  // apply re-runs the RPC rather than committing the previewed plan, so the two
  // can differ if the roster or the schedule moved in between. Showing what was
  // actually written — rather than tearing the list down on success — is what
  // makes that visible instead of silent.
  const applied = Boolean(apply.data)
  const shown = apply.data ?? preview.data
  const dismiss = () => {
    preview.reset()
    apply.reset()
  }

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">載入中…</p>
  }

  // Checked before any empty-state logic: on a query error `isLoading` is
  // false and `data` defaults to `[]`, so without this the panel would fall
  // through to the empty-state branch below — including the sync-problem
  // hint, which would then confidently misdiagnose a Supabase outage as a
  // cron failure.
  if (isError || labUsersIsError) {
    return (
      <p className="text-sm text-destructive">
        讀取提問名冊失敗，請重新整理頁面再試一次
      </p>
    )
  }

  const { extras, enabledCount } = summarizeRoster(members)
  const candidates = extraCandidates(labUsers, members)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            提問人（{members.length} 位・啟用 {enabledCount} 位）
          </p>
          {isAdmin && (
            <Button
              variant="ghost"
              size="sm"
              disabled={preview.isPending || apply.isPending}
              className="h-6 gap-1 px-2 text-xs text-muted-foreground"
              onClick={() => preview.mutate()}
            >
              <IconScale className="h-3 w-3" />
              完整重排
            </Button>
          )}
        </div>

        {isAdmin && shown && (
          <div className="flex flex-col gap-2 rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">
              {!shown.frozenDate
                ? "目前沒有可重排的未來週次"
                : applied
                  ? `已套用：${shown.frozenDate} 當週（含）以前維持不動，其後 ${shown.weeks} 週更動了 ${shown.added} 個名額`
                  : `預覽：${shown.frozenDate} 當週（含）以前維持不動，其後 ${shown.weeks} 週會更動 ${shown.added} 個名額`}
            </p>
            {shown.roster.length > 0 && (
              <div className="flex max-h-64 flex-col gap-1 overflow-y-auto">
                {shown.roster.map((w) => (
                  <div
                    key={w.meetingId}
                    className="flex items-baseline justify-between gap-3 text-xs"
                  >
                    <span className="shrink-0 text-muted-foreground">
                      {formatMonthDay(w.date)}
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
              {!applied && (
                <Button
                  size="sm"
                  className="h-7 text-xs"
                  disabled={apply.isPending || shown.roster.length === 0}
                  onClick={() => apply.mutate()}
                >
                  {apply.isPending ? "套用中…" : "確認套用"}
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-muted-foreground"
                disabled={apply.isPending}
                onClick={dismiss}
              >
                {applied ? "關閉" : "取消"}
              </Button>
            </div>
          </div>
        )}

        {members.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            尚無提問人：報告順位名單的成員會自動成為預設提問人
          </p>
        ) : (
          <div className="flex flex-col gap-1">
            {members.map((m) => (
              <QuestionerRow
                key={m.userId}
                member={m}
                isAdmin={isAdmin}
                pending={setEnabled.isPending}
                onToggle={(enabled) =>
                  setEnabled.mutate({ userId: m.userId, enabled })
                }
              />
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            額外提問成員（不可為報告人）
          </p>
          {isAdmin && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 gap-1 px-2 text-xs text-muted-foreground"
              onClick={() => setAdding((v) => !v)}
            >
              <IconPlus className="h-3 w-3" />
              新增成員
            </Button>
          )}
        </div>

        {isAdmin && adding && (
          <div className="flex flex-wrap gap-1.5 rounded-lg border p-2">
            {candidates.length === 0 ? (
              labUsersLoaded && labUsers.length === 0 ? (
                <span className="text-xs text-muted-foreground">
                  候選名單目前是空的，/api/cron/kc-lab-status 可能尚未成功同步過
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">
                  所有成員都已經是提問人
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

        {extras.length === 0 ? (
          <p className="text-xs text-muted-foreground">尚未加入任何額外成員</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {extras.map((m) => (
              <div
                key={m.userId}
                className="flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs"
              >
                <span>{m.name ?? "—"}</span>
                {isAdmin && (
                  <ConfirmDialog
                    trigger={
                      <button
                        type="button"
                        aria-label={`移除${m.name ?? "此成員"}`}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <IconX className="h-3 w-3" />
                      </button>
                    }
                    title="移除額外提問成員？"
                    description={`將「${m.name ?? "此成員"}」移出提問名冊。過去的提問紀錄會保留，已排定的未來場次會自動改由其他人遞補。`}
                    variant="destructive"
                    onConfirm={() => removeMember.mutate(m.userId)}
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {isAdmin && (
        <p className="text-xs text-muted-foreground">
          ＊報告順位名單的成員就是預設提問人，可以用開關暫停提問（明天起生效，停用期間不算入公平統計）；額外提問成員不可為報告人。
          每週 3 位提問人依「已排次數 ÷
          加入後的機會數」公平分配。排班或名冊有任何變動時，系統會自動做最小調整：只移動需要增減次數的人，而且盡量動最遠的週次；最近一場與手動指定不會被動到。
          「完整重排」會忽略現有安排、從頭重排一次，平常不需要用到。
        </p>
      )}
    </div>
  )
}
