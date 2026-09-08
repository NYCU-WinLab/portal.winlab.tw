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
 * Which GitLab epic this meeting belongs to.
 *
 * This is the difference between the two kinds of meeting. Picked an epic:
 * the pipeline leaves a booking marker on it, and the meeting inherits its
 * agenda and its deliverables. Picked nothing: it's ad-hoc, and the pipeline
 * opens a standalone epic from whatever agenda was typed.
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
}: {
  id: string
  epics: EpicsResult | undefined
  /** The chosen epic's iid, or null for ad-hoc. */
  value: number | null
  onChange: (epic: GitLabEpic | null) => void
}) {
  if (!epics || epics.status === "unlinked") return null

  const note = statusNote(epics)
  const available = epics.status === "ok" ? epics.epics : []

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="text-xs">
        相關 Epic（可不選）
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
            <SelectItem key={epic.iid} value={String(epic.iid)}>
              &amp;{epic.iid} {epic.title}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">
        {note ??
          "選了就在那個 epic 上留下這次的預約紀錄;不選會開一個獨立的 epic。"}
      </p>
    </div>
  )
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
