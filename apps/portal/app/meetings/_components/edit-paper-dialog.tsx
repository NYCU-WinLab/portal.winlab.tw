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

import { useUpdateTeacherPaper } from "@/hooks/meetings/use-teacher-papers"
import type { TeacherPaper } from "@/lib/meetings/types"

import { TagPicker } from "./tag-picker"

interface Props {
  paper: TeacherPaper
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function EditPaperDialog({ paper, open, onOpenChange }: Props) {
  const updatePaper = useUpdateTeacherPaper()

  const [date, setDate] = useState(paper.providedDate)
  const [name, setName] = useState(paper.paperName)
  const [link, setLink] = useState(paper.fileLink ?? "")
  const [source, setSource] = useState(paper.source ?? "")
  const [tagIds, setTagIds] = useState(paper.tags.map((t) => t.id))

  function handleSave() {
    if (!date || !name) return
    updatePaper.mutate(
      {
        id: paper.id,
        providedDate: date,
        paperName: name,
        fileLink: link || null,
        source: source || null,
        tagIds,
      },
      { onSuccess: () => onOpenChange(false) }
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>編輯老師提供 Paper</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>日期</Label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Paper 名稱</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="論文全名"
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>連結（選填）</Label>
            <Input
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://..."
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>來源（選填）</Label>
            <Input
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="LINE / email"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>標籤（選填）</Label>
            <TagPicker value={tagIds} onChange={setTagIds} />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={updatePaper.isPending}
          >
            取消
          </Button>
          <Button
            onClick={handleSave}
            disabled={!date || !name || updatePaper.isPending}
          >
            {updatePaper.isPending ? "儲存中…" : "儲存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
