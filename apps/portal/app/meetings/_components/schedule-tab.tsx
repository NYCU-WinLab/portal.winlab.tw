"use client"

import { useState } from "react"

import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

import { useAuth } from "@/hooks/use-auth"
import { useMeetings, useDeleteMeeting } from "@/hooks/meetings/use-meetings"
import { useMeetingsAdmin } from "@/hooks/meetings/use-meetings-admin"
import type { Meeting } from "@/lib/meetings/types"

import { AddMeetingDialog } from "./add-meeting-dialog"
import { MeetingEditDialog } from "./meeting-edit-dialog"

function getCurrentWeekId(meetings: Meeting[]): string | null {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const upcoming = meetings.filter((m) => {
    const d = new Date(m.scheduledDate)
    return d >= today && !m.isHoliday
  })
  return upcoming[0]?.id ?? null
}

export function ScheduleTab({ year }: { year: number }) {
  const { user } = useAuth()
  const { isAdmin } = useMeetingsAdmin()
  const { data: meetings = [], isLoading } = useMeetings(year)
  const deleteMeeting = useDeleteMeeting()

  const [addOpen, setAddOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Meeting | null>(null)

  const currentWeekId = getCurrentWeekId(meetings)

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">載入中…</p>
  }

  return (
    <div className="flex flex-col gap-4">
      {isAdmin && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setAddOpen(true)}>
            新增週次
          </Button>
        </div>
      )}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-20">週次</TableHead>
              <TableHead className="w-24">日期</TableHead>
              <TableHead>報告人</TableHead>
              <TableHead className="w-10 text-center">PPT</TableHead>
              <TableHead className="w-10 text-center">錄影</TableHead>
              <TableHead>Paper</TableHead>
              <TableHead className="hidden md:table-cell">備註</TableHead>
              <TableHead className="w-16" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {meetings.map((m) => {
              const isOwn = user?.id === m.presenterUserId
              const isCurrent = m.id === currentWeekId

              return (
                <TableRow
                  key={m.id}
                  className={
                    m.isHoliday
                      ? "opacity-40"
                      : isCurrent
                        ? "bg-muted/60"
                        : isOwn
                          ? "bg-primary/5"
                          : undefined
                  }
                >
                  <TableCell className="text-xs text-muted-foreground">
                    {m.weekLabel ?? "—"}
                  </TableCell>
                  <TableCell className="text-xs">
                    {new Date(m.scheduledDate).toLocaleDateString("zh-TW", {
                      month: "numeric",
                      day: "numeric",
                    })}
                  </TableCell>
                  <TableCell className="font-medium">
                    {m.presenter ?? "—"}
                  </TableCell>
                  <TableCell className="text-center">
                    <Checkbox checked={m.pptUploaded} disabled />
                  </TableCell>
                  <TableCell className="text-center">
                    <Checkbox checked={m.videoUploaded} disabled />
                  </TableCell>
                  <TableCell className="max-w-xs">
                    {m.paperLink ? (
                      <a
                        href={m.paperLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="line-clamp-2 text-xs hover:underline"
                      >
                        {m.paperTitle ?? m.paperLink}
                      </a>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {m.paperTitle ?? "—"}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="hidden text-xs text-muted-foreground md:table-cell">
                    {m.notes ?? ""}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {(isAdmin || isOwn) && !m.isHoliday && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs"
                          onClick={() => setEditTarget(m)}
                        >
                          編輯
                        </Button>
                      )}
                      {isAdmin && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                          onClick={() => deleteMeeting.mutate(m.id)}
                        >
                          刪除
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      {isAdmin && (
        <AddMeetingDialog
          year={year}
          open={addOpen}
          onOpenChange={setAddOpen}
        />
      )}

      {editTarget && (
        <MeetingEditDialog
          meeting={editTarget}
          isAdmin={isAdmin}
          open={!!editTarget}
          onOpenChange={(open) => {
            if (!open) setEditTarget(null)
          }}
        />
      )}
    </div>
  )
}
