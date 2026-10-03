"use client"

import { Label } from "@workspace/ui/components/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"

import type { GitLabEpic } from "@/lib/gitlab/epics"
import type { EpicsResult } from "@/lib/gitlab/client"

/** The value the picker uses for "this meeting has no epic". */
export const NO_EPIC = "__none__"

/**
 * Which GitLab record routes this meeting.
 *
 * Sync containers create/reuse one child per booking. Report records review
 * one explicit iteration. Ordinary tracked epics are one planned meeting.
 * Picking nothing keeps the existing ad-hoc flow.
 *
 * Only offered for a group that has been linked to a GitLab group. A personal
 * booking has nowhere for a marker to go, so it gets no picker rather than an
 * empty one.
 */
export function EpicField({
  id,
  epics,
  value,
  onChange,
  mode = "one-off",
}: {
  id: string
  epics: EpicsResult | undefined
  /** The chosen epic's iid, or null for ad-hoc. */
  value: number | null
  onChange: (epic: GitLabEpic | null) => void
  mode?: "one-off" | "recurring"
}) {
  if (!epics || epics.status === "unlinked") return null

  const note = statusNote(epics)
  const available = epics.status === "ok" ? epics.epics : []
  const selected = available.find((epic) => epic.iid === value) ?? null

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="text-xs">
        {mode === "recurring"
          ? "Sync container（可不選）"
          : "Meeting record / Sync container（可不選）"}
      </Label>
      <Select
        value={value === null ? NO_EPIC : String(value)}
        onValueChange={(next) =>
          onChange(
            next === NO_EPIC
              ? null
              : (available.find((e) => String(e.iid) === next) ?? null)
          )
        }
        disabled={available.length === 0}
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue placeholder="臨時會議（不掛 epic）" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_EPIC}>臨時會議（不掛 epic）</SelectItem>
          {available.map((epic) => (
            <SelectItem
              key={epic.iid}
              value={String(epic.iid)}
              disabled={mode === "recurring" && epic.classification !== "sync"}
            >
              {epicLabel(epic)} · &amp;{epic.iid} {epic.title}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">
        {note ?? selectionNote(selected, mode)}
      </p>
    </div>
  )
}

function epicLabel(epic: GitLabEpic): string {
  switch (epic.classification) {
    case "sync":
      return "Sync"
    case "report":
      return epic.reviewIterationId
        ? `Report · Iteration #${epic.reviewIterationId}`
        : "Report · iteration 設定錯誤"
    case "meeting":
      return "Meeting"
  }
}

function selectionNote(
  epic: GitLabEpic | null,
  mode: "one-off" | "recurring"
): string {
  if (!epic) {
    return mode === "recurring"
      ? "不選會讓每一場各自建立 ad-hoc record；群組固定會議建議選 Sync container。"
      : "不選會建立這一場的 ad-hoc meeting record。"
  }
  if (epic.classification === "sync") {
    return "Sync 是 workstream container；這次預約會建立或重用自己的 child，不會改寫 container，也不會把整個 workstream 當成本場交付物。"
  }
  if (epic.classification === "report") {
    return epic.reviewIterationId
      ? `Report 會檢視明確指定的 Iteration #${epic.reviewIterationId}，不會猜測其他 iteration。`
      : `此 Report 無法預約：${epic.reviewMarkerError ?? "iteration marker 無效"}`
  }
  return mode === "recurring"
    ? "單場 Meeting record 不能用於固定會議；請改選 Sync container。"
    : "這是單場 planned meeting record；討論事項可從它的 description 帶入後再修改。"
}

/**
 * Why the list is short, when it is.
 *
 * An empty dropdown could mean "no open epics", "no token", or "GitLab said
 * no" — three different situations with three different fixes, and collapsing
 * them into silence is what made the attendee picker expensive to diagnose.
 */
function statusNote(epics: EpicsResult): string | null {
  switch (epics.status) {
    case "unconfigured":
      return "GitLab 尚未設定(GITLAB_API_TOKEN),暫時只能開臨時會議。"
    case "error":
      return `讀取 GitLab epic 失敗:${epics.detail}`
    case "ok":
      return epics.epics.length === 0 ? "這個群組目前沒有開著的 epic。" : null
    default:
      return null
  }
}
