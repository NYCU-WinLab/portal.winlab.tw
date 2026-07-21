"use client"

import { useState } from "react"

import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"

import { useAddTag, useTags } from "@/hooks/meetings/use-teacher-papers"
import { DEFAULT_TAG_COLOR } from "@/lib/meetings/tag-colors"

import { TagChip } from "./tag-chip"
import { TagColorPicker } from "./tag-color-picker"

interface Props {
  value: string[]
  onChange: (ids: string[]) => void
}

export function TagPicker({ value, onChange }: Props) {
  const { data: tags = [] } = useTags()
  const addTag = useAddTag()

  const [creating, setCreating] = useState(false)
  const [name, setName] = useState("")
  const [color, setColor] = useState<string>(DEFAULT_TAG_COLOR)

  function toggle(id: string) {
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id])
  }

  function create() {
    const n = name.trim()
    if (!n) return
    addTag.mutate(
      { name: n, color },
      {
        onSuccess: (id) => {
          onChange([...value, id])
          setName("")
          setColor(DEFAULT_TAG_COLOR)
          setCreating(false)
        },
      }
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5">
        {tags.length === 0 && !creating && (
          <span className="text-xs text-muted-foreground">
            尚無標籤，可在下方新增
          </span>
        )}
        {tags.map((t) => (
          <TagChip
            key={t.id}
            name={t.name}
            color={t.color}
            selected={value.includes(t.id)}
            onClick={() => toggle(t.id)}
          />
        ))}
      </div>

      {creating ? (
        <div className="flex flex-col gap-2 rounded-md border p-2.5">
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
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              onClick={create}
              disabled={!name.trim() || addTag.isPending}
            >
              {addTag.isPending ? "新增中…" : "新增標籤"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setCreating(false)}
              disabled={addTag.isPending}
            >
              取消
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="w-fit text-xs text-muted-foreground hover:text-foreground"
          onClick={() => setCreating(true)}
        >
          + 新增標籤
        </button>
      )}
    </div>
  )
}
