"use client"

import { Button } from "@workspace/ui/components/button"

import {
  FIELD_CATEGORIES,
  type CategoryDef,
} from "@/lib/approve/field-categories"

export function FieldPalette({
  onPlace,
}: {
  onPlace: (id: CategoryDef["id"]) => void
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {FIELD_CATEGORIES.map((c) => {
        const Icon = c.icon
        return (
          <Button
            key={c.id}
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onPlace(c.id)}
          >
            <Icon className="size-4" />
            {c.label}
          </Button>
        )
      })}
    </div>
  )
}
