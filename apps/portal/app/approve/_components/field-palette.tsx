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
    <div className="flex flex-wrap gap-1">
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
          >
            <Icon className="size-4" />
            {c.label}
          </Button>
        )
      })}
    </div>
  )
}
