"use client"

import { Check, Plus, Tag as TagIcon, Trash2 } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { Skeleton } from "@workspace/ui/components/skeleton"

import {
  useCreateTag,
  useDeleteTag,
  useTags,
  useToggleTag,
} from "@/hooks/receipts/use-tags"
import { TAG_VARIANTS, type Tag, type TagVariant } from "@/lib/receipts/types"

import { TAG_VARIANT_LABEL } from "./tag-badge"

export function TagPickerPopover({
  receiptId,
  attachedTagIds,
  trigger,
}: {
  receiptId: string
  attachedTagIds: string[]
  trigger: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const { data: tags, isLoading } = useTags()
  const toggle = useToggleTag()
  const remove = useDeleteTag()

  const attached = new Set(attachedTagIds)

  const handleToggle = (tag: Tag) => {
    const isAttached = attached.has(tag.id)
    toggle.mutate(
      { receiptId, tagId: tag.id, attached: isAttached },
      {
        onError: (err) => toast.error(`更新標籤失敗：${err.message}`),
      }
    )
  }

  const handleDelete = (tag: Tag) => {
    remove.mutate(
      { id: tag.id },
      {
        onSuccess: () => toast.success(`已刪除「${tag.name}」`),
        onError: (err) => toast.error(`刪除失敗：${err.message}`),
      }
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        <div className="flex flex-col">
          <div className="px-3 py-2 text-xs font-medium text-muted-foreground">
            標籤
          </div>
          <div className="max-h-64 overflow-y-auto">
            {isLoading ? (
              <div className="flex flex-col gap-2 px-3 pb-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-7 rounded-md" />
                ))}
              </div>
            ) : !tags || tags.length === 0 ? (
              <p className="px-3 pb-3 text-xs text-muted-foreground">
                還沒有標籤，下面建一個。
              </p>
            ) : (
              tags.map((tag) => (
                <TagRow
                  key={tag.id}
                  tag={tag}
                  isAttached={attached.has(tag.id)}
                  onToggle={() => handleToggle(tag)}
                  onDelete={() => handleDelete(tag)}
                />
              ))
            )}
          </div>
          <div className="border-t border-border" />
          <CreateTagInline receiptId={receiptId} />
        </div>
      </PopoverContent>
    </Popover>
  )
}

function TagRow({
  tag,
  isAttached,
  onToggle,
  onDelete,
}: {
  tag: Tag
  isAttached: boolean
  onToggle: () => void
  onDelete: () => void
}) {
  return (
    <div className="group flex items-center gap-2 px-3 py-1.5 hover:bg-muted">
      <button
        type="button"
        onClick={onToggle}
        className="flex flex-1 items-center gap-2 text-left"
      >
        <span className="flex size-4 shrink-0 items-center justify-center text-muted-foreground">
          {isAttached && <Check className="size-3.5" />}
        </span>
        <Badge variant={tag.variant}>{tag.name}</Badge>
      </button>
      <button
        type="button"
        onClick={onDelete}
        className="text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive"
        aria-label={`刪除標籤 ${tag.name}`}
      >
        <Trash2 className="size-3.5" />
      </button>
    </div>
  )
}

function CreateTagInline({ receiptId }: { receiptId: string }) {
  const [name, setName] = useState("")
  const [variant, setVariant] = useState<TagVariant>("secondary")
  const create = useCreateTag()
  const toggle = useToggleTag()
  const pending = create.isPending || toggle.isPending

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    create.mutate(
      { name, variant },
      {
        onSuccess: (tag) => {
          // Auto-attach: opening the picker on a row already implies intent
          // to label that row. Saves the second click.
          toggle.mutate(
            { receiptId, tagId: tag.id, attached: false },
            {
              onSuccess: () => {
                toast.success(`已新增並附加「${tag.name}」`)
                setName("")
              },
              onError: (err) =>
                toast.error(`已新增「${tag.name}」但附加失敗：${err.message}`),
            }
          )
        },
        onError: (err) => toast.error(`新增失敗：${err.message}`),
      }
    )
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-2 p-3"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <TagIcon className="size-3.5" />
        新增標籤
      </div>
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="標籤名稱"
        className="h-8 text-sm"
        disabled={pending}
      />
      <div className="flex gap-2">
        <Select
          value={variant}
          onValueChange={(v) => setVariant(v as TagVariant)}
          disabled={pending}
        >
          <SelectTrigger className="h-8 flex-1 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TAG_VARIANTS.map((v) => (
              <SelectItem key={v} value={v}>
                {TAG_VARIANT_LABEL[v]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="submit"
          size="sm"
          disabled={pending || !name.trim()}
          className="h-8"
        >
          <Plus className="size-3.5" />
          新增
        </Button>
      </div>
    </form>
  )
}
