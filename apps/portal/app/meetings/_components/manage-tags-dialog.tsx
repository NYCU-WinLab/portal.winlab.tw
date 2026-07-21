"use client"

import { useState } from "react"

import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"

import {
  useAddTag,
  useDeleteTag,
  useTags,
} from "@/hooks/meetings/use-teacher-papers"
import { DEFAULT_TAG_COLOR } from "@/lib/meetings/tag-colors"

import { TagChip } from "./tag-chip"
import { TagColorPicker } from "./tag-color-picker"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ManageTagsDialog({ open, onOpenChange }: Props) {
  const { data: tags = [] } = useTags()
  const addTag = useAddTag()
  const deleteTag = useDeleteTag()

  const [name, setName] = useState("")
  const [color, setColor] = useState<string>(DEFAULT_TAG_COLOR)

  function create() {
    const n = name.trim()
    if (!n) return
    addTag.mutate(
      { name: n, color },
      {
        onSuccess: () => {
          setName("")
          setColor(DEFAULT_TAG_COLOR)
        },
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>管理標籤</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <Label>新增標籤</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="標籤名稱（如 LLM、Networking）"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  create()
                }
              }}
            />
            <TagColorPicker value={color} onChange={setColor} />
            <Button
              type="button"
              size="sm"
              className="w-fit"
              onClick={create}
              disabled={!name.trim() || addTag.isPending}
            >
              {addTag.isPending ? "新增中…" : "新增"}
            </Button>
          </div>

          <div className="flex flex-col gap-2">
            <Label>現有標籤</Label>
            {tags.length === 0 ? (
              <span className="text-sm text-muted-foreground">尚無標籤</span>
            ) : (
              <div className="flex flex-col gap-1.5">
                {tags.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center justify-between gap-2"
                  >
                    <TagChip name={t.name} color={t.color} />
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                      onClick={() => deleteTag.mutate(t.id)}
                      disabled={deleteTag.isPending}
                    >
                      刪除
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              刪除標籤會一併從所有論文移除該標籤。
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            關閉
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
