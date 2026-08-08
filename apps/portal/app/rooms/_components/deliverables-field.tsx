"use client"

import { Checkbox } from "@workspace/ui/components/checkbox"
import { Label } from "@workspace/ui/components/label"

import { DELIVERABLES } from "@/lib/rooms/deliverables"

/**
 * What this meeting is expected to produce.
 *
 * The four options are GitLab's `Deliverable::*` scoped labels. The server
 * re-validates whatever comes back from here before storing or forwarding it
 * — these strings end up as labels on a real issue, so the checkbox list is a
 * convenience, not the boundary.
 */
export function DeliverablesField({
  id,
  value,
  onChange,
}: {
  id: string
  value: string[]
  onChange: (next: string[]) => void
}) {
  const chosen = new Set(value)

  function toggle(deliverable: string, checked: boolean) {
    const next = new Set(chosen)
    if (checked) next.add(deliverable)
    else next.delete(deliverable)
    // Emitted in the canonical order so the stored array doesn't depend on
    // the order the boxes were clicked.
    onChange(DELIVERABLES.map((d) => d.value).filter((v) => next.has(v)))
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs">交付物（可不填、可複選）</Label>
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {DELIVERABLES.map((d) => (
          <div key={d.value} className="flex items-center gap-2">
            <Checkbox
              id={`${id}-${d.value}`}
              checked={chosen.has(d.value)}
              onCheckedChange={(next) => toggle(d.value, next === true)}
            />
            <Label
              htmlFor={`${id}-${d.value}`}
              className="text-xs font-normal text-muted-foreground"
              title={d.hint || undefined}
            >
              {d.label}
            </Label>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        會成為 GitLab issue 上的 Deliverable 標籤。
      </p>
    </div>
  )
}
