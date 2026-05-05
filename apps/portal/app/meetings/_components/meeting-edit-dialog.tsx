"use client"

import { useEffect, useRef, useState } from "react"

import {
  IconPaperclip,
  IconRefresh,
  IconUpload,
  IconX,
} from "@tabler/icons-react"
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
import { toast } from "sonner"

import {
  useAdminUpdateMeeting,
  useUpdateOwnMeeting,
} from "@/hooks/meetings/use-meetings"
import { useLabUsers } from "@/hooks/meetings/use-lab-users"
import type { Meeting } from "@/lib/meetings/types"

import { PresenterSelect } from "./presenter-select"

interface Props {
  meeting: Meeting
  isAdmin: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
}

function FileUploadField({
  label,
  link,
  uploading,
  accept,
  onUpload,
  onRemove,
}: {
  label: string
  link: string | null
  uploading: boolean
  accept: string
  onUpload: (file: File) => void
  onRemove: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-sm">{label}</span>
      {link ? (
        <div className="flex items-center gap-1">
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs hover:underline"
          >
            <IconPaperclip className="h-3.5 w-3.5" />
            已上傳
          </a>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-6 w-6 text-muted-foreground"
            onClick={onRemove}
          >
            <IconX className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : (
        <>
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            accept={accept}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) onUpload(f)
              e.target.value = ""
            }}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 gap-1.5 px-2 text-xs"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
          >
            <IconUpload className="h-3.5 w-3.5" />
            {uploading ? "上傳中…" : "上傳"}
          </Button>
        </>
      )}
    </div>
  )
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
  const [pptLink, setPptLink] = useState<string | null>(meeting.pptLink)
  const [videoLink, setVideoLink] = useState<string | null>(meeting.videoLink)
  const [notes, setNotes] = useState(meeting.notes ?? "")
  const [pptUploading, setPptUploading] = useState(false)
  const [videoChecking, setVideoChecking] = useState(false)

  function checkVideo() {
    setVideoChecking(true)
    fetch(
      `/api/meetings/check-video?year=${meeting.year}&date=${encodeURIComponent(meeting.scheduledDate)}`
    )
      .then((r) => r.json())
      .then(({ videoLink: found }: { videoLink: string | null }) => {
        if (found) setVideoLink(found)
      })
      .catch(() => {})
      .finally(() => setVideoChecking(false))
  }

  useEffect(() => {
    if (!open) return
    setWeekLabel(meeting.weekLabel ?? "")
    setDate(meeting.scheduledDate)
    setIsHoliday(meeting.isHoliday)
    setPresenterUserId(meeting.presenterUserId ?? "__none__")
    setPaperTitle(meeting.paperTitle ?? "")
    setPaperLink(meeting.paperLink ?? "")
    setPptLink(meeting.pptLink)
    setVideoLink(meeting.videoLink)
    setNotes(meeting.notes ?? "")
    checkVideo()
  }, [open, meeting])

  async function uploadFile(
    file: File,
    type: "ppt" | "video",
    setUploading: (v: boolean) => void,
    setLink: (url: string) => void
  ) {
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append("file", file)
      fd.append("year", String(meeting.year))
      fd.append("type", type)
      const res = await fetch("/api/meetings/upload", {
        method: "POST",
        body: fd,
      })
      if (!res.ok) throw new Error("上傳失敗")
      const { url } = await res.json()
      setLink(url)
      toast.success("上傳成功")
    } catch {
      toast.error("上傳失敗，請稍後再試")
    } finally {
      setUploading(false)
    }
  }

  function handleSave() {
    const selectedUser =
      presenterUserId === "__none__"
        ? null
        : users.find((u) => u.id === presenterUserId)
    const common = {
      id: meeting.id,
      presenter: selectedUser?.name ?? null,
      presenterUserId: presenterUserId === "__none__" ? null : presenterUserId,
      paperTitle: paperTitle || null,
      paperLink: paperLink || null,
      pptUploaded: !!pptLink,
      pptLink,
      videoUploaded: !!videoLink,
      videoLink,
      notes: notes || null,
    }

    if (isAdmin) {
      updateAdmin.mutate(
        {
          ...common,
          weekLabel: weekLabel || null,
          scheduledDate: date,
          isHoliday,
        },
        { onSuccess: () => onOpenChange(false) }
      )
    } else {
      updateOwn.mutate(common, { onSuccess: () => onOpenChange(false) })
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

          <div className="flex flex-col gap-2 rounded-md border p-3">
            <FileUploadField
              label="PPT"
              link={pptLink}
              uploading={pptUploading}
              accept=".ppt,.pptx,.pdf,.key"
              onUpload={(f) =>
                uploadFile(f, "ppt", setPptUploading, (url) => setPptLink(url))
              }
              onRemove={() => setPptLink(null)}
            />
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm">錄影</span>
              <div className="flex items-center gap-2">
                {videoChecking ? (
                  <span className="text-xs text-muted-foreground">檢查中…</span>
                ) : (
                  <label className="flex cursor-default items-center gap-1.5 text-xs">
                    <Checkbox checked={!!videoLink} disabled />
                    {videoLink ? (
                      <a
                        href={videoLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline"
                      >
                        已上傳
                      </a>
                    ) : (
                      <span className="text-muted-foreground">未上傳</span>
                    )}
                  </label>
                )}
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6 text-muted-foreground"
                  onClick={checkVideo}
                  disabled={videoChecking}
                >
                  <IconRefresh className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
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
          <Button
            onClick={handleSave}
            disabled={isPending || pptUploading || videoChecking}
          >
            {isPending ? "儲存中…" : "儲存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
