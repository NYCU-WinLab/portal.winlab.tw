"use client"

import { Button } from "@workspace/ui/components/button"

import {
  FIELD_CATEGORIES,
  type CategoryDef,
} from "@/lib/approve/field-categories"

// 前端暫時隱藏這些欄位類型，僅保留「簽名」。恢復時移除此集合與下方的 filter 即可。
const HIDDEN_CATEGORIES = new Set<CategoryDef["id"]>([
  "contact_address",
  "household_address",
  "id_number",
  "phone",
  "other",
])

export function FieldPalette({
  onPlace,
}: {
  onPlace: (id: CategoryDef["id"]) => void
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {FIELD_CATEGORIES.filter((c) => !HIDDEN_CATEGORIES.has(c.id)).map((c) => {
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
