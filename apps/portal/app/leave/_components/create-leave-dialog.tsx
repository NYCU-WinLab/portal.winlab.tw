"use client"

import { useState } from "react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui/components/dialog"
import { Label } from "@workspace/ui/components/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { Textarea } from "@workspace/ui/components/textarea"

import { useCreateLeave } from "@/hooks/leave/use-leaves"
import { useAuth } from "@/hooks/use-auth"
import { formatLeaveDate, getNextMondays, toIsoDate } from "@/lib/leave/date"

const MONDAY_OPTIONS = 8

export function CreateLeaveDialog() {
  const [open, setOpen] = useState(false)
  const mondays = getNextMondays(MONDAY_OPTIONS)
  const [date, setDate] = useState(toIsoDate(mondays[0]!))
  const [reason, setReason] = useState("")
  const { user } = useAuth()
  const createLeave = useCreateLeave()

  if (!user) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!date || !reason.trim()) return

    try {
      await createLeave.mutateAsync({
        user_id: user.id,
        date,
        reason: reason.trim(),
      })
      toast.success("已送出請假")
      setOpen(false)
      setDate(toIsoDate(getNextMondays(1)[0]!))
      setReason("")
    } catch (error) {
      const err = error instanceof Error ? error : new Error("送出失敗")
      toast.error(err.message)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">新增請假</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>新增請假</DialogTitle>
          <DialogDescription>選一個週一，寫下原因</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="date">日期</Label>
              <Select value={date} onValueChange={setDate}>
                <SelectTrigger id="date" className="w-full">
                  <SelectValue placeholder="選擇週一" />
                </SelectTrigger>
                <SelectContent>
                  {mondays.map((m) => {
                    const iso = toIsoDate(m)
                    return (
                      <SelectItem key={iso} value={iso}>
                        {formatLeaveDate(iso)}
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="reason">原因</Label>
              <Textarea
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="例：家中有事、看醫生、其他會議衝堂"
                rows={3}
                required
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              取消
            </Button>
            <Button
              type="submit"
              disabled={createLeave.isPending || !date || !reason.trim()}
            >
              {createLeave.isPending ? "送出中..." : "送出"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
