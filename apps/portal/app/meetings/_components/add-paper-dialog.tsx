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

import { useAddTeacherPaper } from "@/hooks/meetings/use-teacher-papers"

import { TagPicker } from "./tag-picker"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AddPaperDialog({ open, onOpenChange }: Props) {
  const addPaper = useAddTeacherPaper()

  const [date, setDate] = useState("")
  const [name, setName] = useState("")
  const [link, setLink] = useState("")
  const [source, setSource] = useState("")
  const [tagIds, setTagIds] = useState<string[]>([])

  function handleAdd() {
    if (!date || !name) return
    addPaper.mutate(
      {
        providedDate: date,
        paperName: name,
        fileLink: link || null,
        source: source || null,
        tagIds,
      },
      {
        onSuccess: () => {
          setDate("")
          setName("")
          setLink("")
          setSource("")
          setTagIds([])
          onOpenChange(false)
        },
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>新增老師提供 Paper</DialogTitle>
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
            disabled={addPaper.isPending}
          >
            取消
          </Button>
          <Button
            onClick={handleAdd}
            disabled={!date || !name || addPaper.isPending}
          >
            {addPaper.isPending ? "新增中…" : "新增"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
