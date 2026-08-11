"use client"

import { Badge } from "@workspace/ui/components/badge"
import { Label } from "@workspace/ui/components/label"
import { Skeleton } from "@workspace/ui/components/skeleton"

import { DELIVERABLES } from "@/lib/rooms/deliverables"

/**
 * What this meeting is expected to produce — read-only, on purpose.
 *
 * These used to be checkboxes. They aren't a choice: the epic is the meeting,
 * and what the meeting owes is whatever the issues linked under that epic are
 * labelled with. A meeting with no epic is ad-hoc and owes nothing — as
 * N0Ball put it, a meeting with a deliverable isn't ad-hoc — so a tick box on
 * an unlinked booking would create a state the model doesn't have.
 *
 * The server reads these from GitLab and never from this form, so this is a
 * display of a decision made over there, not an input.
 */
export function DeliverablesField({
  value,
  loading = false,
  hasEpic = false,
}: {
  value: readonly string[]
  loading?: boolean
  /** Whether an epic is picked, which decides what "none" means. */
  hasEpic?: boolean
}) {
  const chosen = DELIVERABLES.filter((d) => value.includes(d.value))

  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs">交付物</Label>
      {loading ? (
        <Skeleton className="h-5 w-32" />
      ) : chosen.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {hasEpic
            ? "這個 epic 底下的 issue 沒有標任何 Deliverable。"
            : "臨時會議沒有交付物。掛上 epic 後,會顯示它底下 issue 的 Deliverable 標籤。"}
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5">
            {chosen.map((d) => (
              <Badge
                key={d.value}
                variant="secondary"
                title={d.hint || undefined}
              >
                {d.label}
              </Badge>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            來自這個 epic 底下 issue 的 Deliverable 標籤,要改請改 GitLab。
          </p>
        </>
      )}
    </div>
  )
}
