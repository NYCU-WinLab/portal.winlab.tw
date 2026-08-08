"use client"

import { Badge } from "@workspace/ui/components/badge"
import { Label } from "@workspace/ui/components/label"

import { DELIVERABLES } from "@/lib/rooms/deliverables"

/**
 * What this meeting is expected to produce — read-only, on purpose.
 *
 * These used to be checkboxes. They aren't a choice: a meeting's deliverables
 * are whatever its epic says they are, and a meeting with no epic is ad-hoc
 * and owes nothing. As N0Ball put it, a meeting with a deliverable isn't
 * ad-hoc — so letting someone tick one on an unlinked booking would create a
 * state the model doesn't have.
 *
 * The server reads them straight from the epic and never from this form, so
 * this is a display of a decision made in GitLab, not an input.
 */
export function DeliverablesField({ value }: { value: readonly string[] }) {
  const chosen = DELIVERABLES.filter((d) => value.includes(d.value))

  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs">交付物</Label>
      {chosen.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          臨時會議沒有交付物。掛上 epic 後,會顯示那個 epic 上的 Deliverable
          標籤。
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
            來自這個 epic 的 Deliverable 標籤,要改請改 GitLab。
          </p>
        </>
      )}
    </div>
  )
}
