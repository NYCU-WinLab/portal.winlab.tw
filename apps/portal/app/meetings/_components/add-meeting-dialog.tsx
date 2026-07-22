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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { useAddMeeting } from "@/hooks/meetings/use-meetings"
import { useLabUsers } from "@/hooks/meetings/use-lab-users"
import {
  MEETING_TYPE_LABELS,
  typeFlags,
  type MeetingType,
} from "@/lib/meetings/meeting-type"

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
  const [type, setType] = useState<MeetingType>("presentation")
  const [presenterUserId, setPresenterUserId] = useState("__none__")
  const [speakerName, setSpeakerName] = useState("")
  const [talkTitle, setTalkTitle] = useState("")

  const canSubmit =
    !!date &&
    !addMeeting.isPending &&
    (type !== "speaker" || !!speakerName.trim())

  function reset() {
    setWeekLabel("")
    setDate("")
    setType("presentation")
    setPresenterUserId("__none__")
    setSpeakerName("")
    setTalkTitle("")
  }

  function handleAdd() {
    if (!canSubmit) return
    const flags = typeFlags(type)

    const presenter =
      type === "speaker"
        ? speakerName.trim()
        : type === "presentation" && presenterUserId !== "__none__"
          ? (users.find((u) => u.id === presenterUserId)?.name ?? null)
          : null

    addMeeting.mutate(
      {
        year,
        weekLabel: weekLabel || null,
        scheduledDate: date,
        isHoliday: flags.isHoliday,
        isSpeaker: flags.isSpeaker,
        presenter,
        presenterUserId:
          type === "presentation" && presenterUserId !== "__none__"
            ? presenterUserId
            : null,
        paperTitle: type === "speaker" ? talkTitle.trim() || null : undefined,
      },
      {
        onSuccess: () => {
          reset()
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
            <Label>類型</Label>
            <Select
              value={type}
              onValueChange={(v) => setType(v as MeetingType)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="presentation">
                  {MEETING_TYPE_LABELS.presentation}
                </SelectItem>
                <SelectItem value="speaker">
                  {MEETING_TYPE_LABELS.speaker}(外部講者)
                </SelectItem>
                <SelectItem value="holiday">
                  {MEETING_TYPE_LABELS.holiday} / 暫停
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

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

          {type === "presentation" && (
            <div className="flex flex-col gap-1.5">
              <Label>報告人</Label>
              <PresenterSelect
                users={users}
                value={presenterUserId}
                onSelect={setPresenterUserId}
              />
            </div>
          )}

          {type === "speaker" && (
            <>
              <div className="flex flex-col gap-1.5">
                <Label>講者姓名</Label>
                <Input
                  value={speakerName}
                  onChange={(e) => setSpeakerName(e.target.value)}
                  placeholder="吳凱強老師"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>講題（選填）</Label>
                <Input
                  value={talkTitle}
                  onChange={(e) => setTalkTitle(e.target.value)}
                  placeholder="演講主題"
                />
              </div>
            </>
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
          <Button onClick={handleAdd} disabled={!canSubmit}>
            {addMeeting.isPending ? "新增中…" : "新增"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
