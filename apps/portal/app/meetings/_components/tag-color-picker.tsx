"use client"

import { TAG_COLORS } from "@/lib/meetings/tag-colors"

interface Props {
  value: string
  onChange: (color: string) => void
}

export function TagColorPicker({ value, onChange }: Props) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {TAG_COLORS.map((c) => (
        <button
          key={c.value}
          type="button"
          title={c.name}
          aria-label={c.name}
          aria-pressed={value === c.value}
          onClick={() => onChange(c.value)}
          style={{ backgroundColor: c.value }}
          className={`h-5 w-5 rounded-full ring-offset-background transition ${
            value === c.value ? "ring-2 ring-foreground ring-offset-1" : ""
          }`}
        />
      ))}
    </div>
  )
}
