"use client"

import type { ApproveField } from "@/lib/approve/types"
import { getCategoryDef } from "@/lib/approve/field-categories"

import type { PageSize } from "./pdf-canvas"

export function SigningField({
  field,
  pageSize,
  value,
  onChange,
}: {
  field: ApproveField
  pageSize: PageSize
  value: string
  onChange: (next: string) => void
}) {
  const def = getCategoryDef(field.category)
  return (
    <div
      className="absolute rounded border bg-background"
      style={{
        left: field.x * pageSize.width,
        top: field.y * pageSize.height,
        width: field.width * pageSize.width,
        height: field.height * pageSize.height,
      }}
    >
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.label ?? def.label}
        className="h-full w-full bg-transparent px-1 text-xs outline-none"
      />
    </div>
  )
}
