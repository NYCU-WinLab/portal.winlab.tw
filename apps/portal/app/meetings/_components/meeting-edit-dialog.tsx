"use client"

import { useEffect, useState } from "react"

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
import { PresenterSelect } from "./presenter-select"

import {
  useAdminUpdateMeeting,
  useUpdateOwnMeeting,
} from "@/hooks/meetings/use-meetings"
import { useLabUsers } from "@/hooks/meetings/use-lab-users"
import type { Meeting } from "@/lib/meetings/types"

interface Props {
  meeting: Meeting
  isAdmin: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function MeetingEditDialog({
  meeting,
  isAdmin,
  open,
  onOpenChange,
}: Props) {
  const { data: users = [] } = useLabUsers()
  const updateOwn = useUpdateOwnMeeting()
  const updateAdmin = useAdminUpdateMeeting()

  const [weekLabel, setWeekLabel] = useState(meeting.weekLabel ?? "")
  const [date, setDate] = useState(meeting.scheduledDate)
  const [isHoliday, setIsHoliday] = useState(meeting.isHoliday)
  const [presenterUserId, setPresenterUserId] = useState(
    meeting.presenterUserId ?? "__none__"
  )
  const [paperTitle, setPaperTitle] = useState(meeting.paperTitle ?? "")
  const [paperLink, setPaperLink] = useState(meeting.paperLink ?? "")
  const [ppt, setPpt] = useState(meeting.pptUploaded)
  const [video, setVideo] = useState(meeting.videoUploaded)
  const [notes, setNotes] = useState(meeting.notes ?? "")

  useEffect(() => {
    if (open) {
      setWeekLabel(meeting.weekLabel ?? "")
      setDate(meeting.scheduledDate)
      setIsHoliday(meeting.isHoliday)
      setPresenterUserId(meeting.presenterUserId ?? "__none__")
      setPaperTitle(meeting.paperTitle ?? "")
      setPaperLink(meeting.paperLink ?? "")
      setPpt(meeting.pptUploaded)
      setVideo(meeting.videoUploaded)
      setNotes(meeting.notes ?? "")
    }
  }, [open, meeting])

  function handleSave() {
    if (isAdmin) {
      const selectedUser =
        presenterUserId === "__none__"
          ? null
          : users.find((u) => u.id === presenterUserId)
      updateAdmin.mutate(
        {
          id: meeting.id,
          weekLabel: weekLabel || null,
          scheduledDate: date,
          isHoliday,
          presenter: selectedUser?.name ?? null,
          presenterUserId:
            presenterUserId === "__none__" ? null : presenterUserId,
          paperTitle: paperTitle || null,
          paperLink: paperLink || null,
          pptUploaded: ppt,
          videoUploaded: video,
          notes: notes || null,
        },
        { onSuccess: () => onOpenChange(false) }
      )
    } else {
      const selectedUser =
        presenterUserId === "__none__"
          ? null
          : users.find((u) => u.id === presenterUserId)
      updateOwn.mutate(
        {
          id: meeting.id,
          presenter: selectedUser?.name ?? null,
          presenterUserId:
            presenterUserId === "__none__" ? null : presenterUserId,
          paperTitle: paperTitle || null,
          paperLink: paperLink || null,
          pptUploaded: ppt,
          videoUploaded: video,
          notes: notes || null,
        },
        { onSuccess: () => onOpenChange(false) }
      )
    }
  }

  const isPending = updateOwn.isPending || updateAdmin.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isAdmin ? "編輯週次" : "更新報告資訊"}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {isAdmin && (
            <>
              <div className="flex flex-col gap-1.5">
                <Label>週次標籤</Label>
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
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={isHoliday}
                  onCheckedChange={(v) => setIsHoliday(!!v)}
                />
                假日 / 暫停（不需要報告人）
              </label>
            </>
          )}
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

          <div className="flex flex-col gap-1.5">
            <Label>Paper 標題</Label>
            <Input
              value={paperTitle}
              onChange={(e) => setPaperTitle(e.target.value)}
              placeholder="論文名稱"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>論文連結</Label>
            <Input
              value={paperLink}
              onChange={(e) => setPaperLink(e.target.value)}
              placeholder="https://..."
            />
          </div>
          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={ppt} onCheckedChange={(v) => setPpt(!!v)} />
              PPT 已上傳
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={video}
                onCheckedChange={(v) => setVideo(!!v)}
              />
              錄影已上傳
            </label>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>備註</Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="備註"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            取消
          </Button>
          <Button onClick={handleSave} disabled={isPending}>
            {isPending ? "儲存中…" : "儲存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
