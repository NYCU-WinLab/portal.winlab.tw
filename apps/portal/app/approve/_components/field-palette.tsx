"use client"

import { Button } from "@workspace/ui/components/button"

import {
  FIELD_CATEGORIES,
  type CategoryDef,
} from "@/lib/approve/field-categories"

export function FieldPalette({
  activeCategory,
  onPick,
}: {
  activeCategory: CategoryDef["id"] | null
  onPick: (id: CategoryDef["id"] | null) => void
}) {
  return (
    <aside className="flex flex-col gap-1">
      <div className="mb-1 text-xs text-muted-foreground">方塊</div>
      {FIELD_CATEGORIES.map((c) => {
        const Icon = c.icon
        const active = activeCategory === c.id
        return (
          <Button
            key={c.id}
            type="button"
            variant={active ? "default" : "outline"}
            size="sm"
            onClick={() => onPick(active ? null : c.id)}
            className="justify-start"
          >
            <Icon className="size-4" />
            {c.label}
          </Button>
        )
      })}
    </aside>
  )
}
