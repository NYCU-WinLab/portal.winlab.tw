"use client"

import { Skeleton } from "@workspace/ui/components/skeleton"

import { useTags } from "@/hooks/receipts/use-tags"
import {
  STATUS_LABELS,
  type ReceiptStatus,
  type Tag,
} from "@/lib/receipts/types"

const STATUSES: ReceiptStatus[] = ["pending", "approved", "rejected"]

export function ReceiptsFilterChips({
  selectedStatuses,
  onToggleStatus,
  selectedTagIds,
  onToggleTag,
}: {
  selectedStatuses: Set<ReceiptStatus>
  onToggleStatus: (status: ReceiptStatus) => void
  selectedTagIds: Set<string>
  onToggleTag: (tagId: string) => void
}) {
  const { data: tags, isLoading } = useTags()

  return (
    <div className="flex flex-col gap-2 pl-3">
      <FilterRow label="狀態">
        {STATUSES.map((s) => (
          <Chip
            key={s}
            label={STATUS_LABELS[s]}
            active={selectedStatuses.has(s)}
            onClick={() => onToggleStatus(s)}
          />
        ))}
      </FilterRow>

      <FilterRow label="標籤">
        {isLoading ? (
          <>
            <Skeleton className="h-6 w-14 rounded-full" />
            <Skeleton className="h-6 w-16 rounded-full" />
            <Skeleton className="h-6 w-12 rounded-full" />
          </>
        ) : !tags || tags.length === 0 ? (
          <span className="text-xs text-muted-foreground">尚無標籤</span>
        ) : (
          tags.map((tag: Tag) => (
            <Chip
              key={tag.id}
              label={tag.name}
              active={selectedTagIds.has(tag.id)}
              onClick={() => onToggleTag(tag.id)}
            />
          ))
        )}
      </FilterRow>
    </div>
  )
}

function FilterRow({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-xs text-muted-foreground">{label}</span>
      {children}
    </div>
  )
}

function Chip({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        active
          ? "inline-flex h-6 items-center rounded-full bg-primary px-2.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          : "inline-flex h-6 items-center rounded-full border border-border px-2.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      }
    >
      {label}
    </button>
  )
}
