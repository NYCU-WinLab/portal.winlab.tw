"use client"

import { Badge } from "@workspace/ui/components/badge"
import { Label } from "@workspace/ui/components/label"
import { Skeleton } from "@workspace/ui/components/skeleton"

import type { EpicDeliverablesResult } from "@/lib/gitlab/client"
import type { EpicIssue } from "@/lib/gitlab/epics"
import { DELIVERABLES } from "@/lib/rooms/deliverables"

const LABELS = new Map(DELIVERABLES.map((d) => [d.value, d]))

/**
 * What this meeting is expected to produce — read-only, on purpose.
 *
 * These used to be checkboxes. They aren't a choice: the epic is the meeting,
 * and what the meeting owes is whatever the issues under that epic are
 * labelled with. A meeting with no epic is ad-hoc and owes nothing — as
 * N0Ball put it, a meeting with a deliverable isn't ad-hoc — so a tick box on
 * an unlinked booking would create a state the model doesn't have.
 *
 * Listed one row per issue rather than as a bare set of badges. "投影片" alone
 * says a slide deck is owed; "投影片 · 月會進度報告 (2026-08)" says which one,
 * which is the difference between a label and a commitment someone can act on.
 *
 * Every empty case says which empty it is. "No deliverables" first shipped as
 * one message covering a read that failed, an epic with no issues, and issues
 * with no labels, which made the first real report of it undiagnosable from
 * the screen alone.
 */
export function DeliverablesField({
  result,
  loading = false,
  hasEpic = false,
}: {
  result: EpicDeliverablesResult | undefined
  loading?: boolean
  /** Whether an epic is picked, which decides what "none" means. */
  hasEpic?: boolean
}) {
  const issues = result?.status === "ok" ? result.issues : []

  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs">交付物</Label>
      {loading ? (
        <Skeleton className="h-5 w-40" />
      ) : issues.length > 0 ? (
        <>
          <ul className="flex flex-col gap-1.5">
            {issues.map((issue, i) => (
              <li key={i} className="flex flex-wrap items-center gap-1.5">
                {issue.deliverables.map((value) => (
                  <Badge
                    key={value}
                    variant="secondary"
                    title={LABELS.get(value)?.hint || undefined}
                  >
                    {LABELS.get(value)?.label ?? value}
                  </Badge>
                ))}
                <span className="text-xs text-muted-foreground">
                  {issueLabel(issue)}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            來自這個 epic 底下 issue 的 Deliverable 標籤,要改請改 GitLab。
          </p>
        </>
      ) : (
        <p className="text-xs text-muted-foreground">
          {emptyReason(result, hasEpic)}
        </p>
      )}
    </div>
  )
}

/** Only for an issue GitLab handed back without a usable title. */
function issueLabel(issue: EpicIssue): string {
  return issue.title ?? "(沒有標題的 issue)"
}

function emptyReason(
  result: EpicDeliverablesResult | undefined,
  hasEpic: boolean
): string {
  if (!hasEpic) {
    return "臨時會議沒有交付物。掛上 epic 後,會顯示它底下 issue 的 Deliverable 標籤。"
  }
  if (!result) return "尚未讀取。"
  if (result.status === "error") {
    return `讀不到這個 epic 底下的 issue:${result.detail}`
  }
  // Zero issues and unlabelled issues need different fixes — one is "attach
  // the issues to the epic", the other is "label them" — so they say so.
  return result.issueCount === 0
    ? "這個 epic 底下沒有任何 issue(child item)。如果 issue 是用「Linked items」關聯的,API 讀不到,要改成 epic 的子項目。"
    : `這個 epic 底下有 ${result.issueCount} 張 issue,但都沒有標 Deliverable 標籤。`
}
