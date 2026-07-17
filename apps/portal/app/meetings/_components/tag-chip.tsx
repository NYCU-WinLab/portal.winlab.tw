"use client"

import { IconX } from "@tabler/icons-react"

import { tagChipStyle } from "@/lib/meetings/tag-colors"

interface TagChipProps {
  name: string
  color: string | null
  /** Filled style — used for an active filter or a picked tag. */
  selected?: boolean
  /** Makes the chip a toggle button (filter / picker). */
  onClick?: () => void
  /** Shows a trailing × that removes the tag (picker). */
  onRemove?: () => void
}

export function TagChip({
  name,
  color,
  selected = false,
  onClick,
  onRemove,
}: TagChipProps) {
  const style = tagChipStyle(color, selected)
  const base =
    "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium leading-5"

  const content = (
    <>
      {name}
      {onRemove && (
        <IconX
          className="h-3 w-3 cursor-pointer opacity-70 hover:opacity-100"
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
        />
      )}
    </>
  )

  if (onClick) {
    return (
      <button
        type="button"
        style={style}
        onClick={onClick}
        aria-pressed={selected}
        className={`${base} cursor-pointer transition-opacity hover:opacity-90`}
      >
        {content}
      </button>
    )
  }

  return (
    <span style={style} className={base}>
      {content}
    </span>
  )
}
