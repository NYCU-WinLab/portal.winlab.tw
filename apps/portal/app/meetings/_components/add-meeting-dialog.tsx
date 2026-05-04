"use client"

import { useState } from "react"

import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { useAddMeeting } from "@/hooks/meetings/use-meetings"
import { useLabUsers } from "@/hooks/meetings/use-lab-users"

import { PresenterSelect } from "./presenter-select"

interface Props {
  year: number
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AddMeetingDialog({ year, open, onOpenChange }: Props) {
  const { data: users = [] } = useLabUsers()
  const addMeeting = useAddMeeting()

  const [weekLabel, setWeekLabel] = useState("")
  const [date, setDate] = useState("")
  const [isHoliday, setIsHoliday] = useState(false)
  const [presenterUserId, setPresenterUserId] = useState("__none__")

  function handleAdd() {
    if (!date) return
    const selectedUser =
      isHoliday || presenterUserId === "__none__"
        ? null
        : users.find((u) => u.id === presenterUserId)

    addMeeting.mutate(
      {
        year,
        weekLabel: weekLabel || null,
        scheduledDate: date,
        isHoliday,
        presenter: selectedUser?.name ?? null,
        presenterUserId: isHoliday
          ? null
          : presenterUserId === "__none__"
            ? null
            : presenterUserId,
      },
      {
        onSuccess: () => {
          setWeekLabel("")
          setDate("")
          setIsHoliday(false)
          setPresenterUserId("__none__")
          onOpenChange(false)
        },
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>新增週次</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>週次標籤（選填）</Label>
            <Input
              value={weekLabel}
              onChange={(e) => setWeekLabel(e.target.value)}
              placeholder="第1週 / 寒假 / 春節"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>日期</Label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={isHoliday}
              onCheckedChange={(v) => setIsHoliday(!!v)}
            />
            假日 / 暫停（不需要報告人）
          </label>
          {!isHoliday && (
            <div className="flex flex-col gap-1.5">
              <Label>報告人</Label>
              <PresenterSelect
                users={users}
                value={presenterUserId}
                onSelect={setPresenterUserId}
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={addMeeting.isPending}
          >
            取消
          </Button>
          <Button onClick={handleAdd} disabled={!date || addMeeting.isPending}>
            {addMeeting.isPending ? "新增中…" : "新增"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
