"use client"

import { useEffect, useRef, useState, type DragEvent } from "react"

import { Button } from "@workspace/ui/components/button"
import { Skeleton } from "@workspace/ui/components/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { toast } from "sonner"

import { useAuth } from "@/hooks/use-auth"
import {
  useMeetings,
  useDeleteMeeting,
  useClaimMeeting,
  useAddMeeting,
  useSwapMeetings,
  useInsertMeetingWeek,
  useRemoveMeetingWeek,
} from "@/hooks/meetings/use-meetings"
import { useQuestionersByYear } from "@/hooks/meetings/use-questioners"
import { useMeetingsAdmin } from "@/hooks/meetings/use-meetings-admin"
import { useLabUsers } from "@/hooks/meetings/use-lab-users"
import { getCurrentMeetingId } from "@/lib/meetings/schedule"
import type { Meeting } from "@/lib/meetings/types"

import { FileCell } from "./file-cell"
import { MeetingEditDialog } from "./meeting-edit-dialog"
import { ScheduleEditRow } from "./schedule-edit-row"

function addOneWeek(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`)
  d.setDate(d.getDate() + 7)
  return d.toISOString().slice(0, 10)
}

function nextWeekLabel(meetings: Meeting[]): string {
  let max = 0
  for (const m of meetings) {
    const match = /第(\d+)週/.exec(m.weekLabel ?? "")
    if (match) max = Math.max(max, Number(match[1]))
  }
  return `第${max + 1}週`
}

export function ScheduleTab({ year }: { year: number }) {
  const { user } = useAuth()
  const { isAdmin } = useMeetingsAdmin()
  const { data: meetings = [], isLoading } = useMeetings(year)
  const { data: questioners } = useQuestionersByYear(year)
  const { data: users = [] } = useLabUsers()
  const deleteMeeting = useDeleteMeeting()
  const claimMeeting = useClaimMeeting()
  const addMeeting = useAddMeeting()
  const swapMeetings = useSwapMeetings()
  const insertWeek = useInsertMeetingWeek()
  const removeWeek = useRemoveMeetingWeek()

  const [editTarget, setEditTarget] = useState<Meeting | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropTargetId, setDropTargetId] = useState<string | null>(null)

  const showEditMode = isAdmin && editMode
  const nonHolidayMeetings = meetings.filter((m) => !m.isHoliday)

  const currentWeekId = getCurrentMeetingId(meetings)
  const currentRowRef = useRef<HTMLTableRowElement>(null)

  // Land on the current week instead of January: bring the nearest upcoming
  // session into view once the roster has loaded.
  useEffect(() => {
    if (isLoading || !currentWeekId) return
    currentRowRef.current?.scrollIntoView({ block: "center" })
  }, [isLoading, currentWeekId])

  function toggleEditMode() {
    setEditMode((v) => !v)
    setDragId(null)
    setDropTargetId(null)
  }

  function handleSwap(a: string, b: string) {
    swapMeetings.mutate(
      { a, b },
      {
        onSuccess: () => {
          toast.success("已互換這兩週的內容", {
            action: {
              label: "復原",
              onClick: () => swapMeetings.mutate({ a, b }),
            },
          })
        },
      }
    )
  }

  async function handleInsert(atMeetingId: string) {
    let blankId: string | null = null
    try {
      blankId = await insertWeek.mutateAsync(atMeetingId)
    } catch {
      return
    }
    if (!blankId) return
    toast.success("已插入一週，後續週次已順延", {
      action: {
        label: "復原",
        onClick: () => removeWeek.mutate(blankId!),
      },
    })
  }

  function handleRemove(id: string) {
    removeWeek.mutate(id, {
      onSuccess: () => toast.success("已刪除，後續週次已遞補"),
    })
  }

  function handleAddWeek() {
    const last = meetings[meetings.length - 1]
    addMeeting.mutate({
      year,
      weekLabel: nextWeekLabel(meetings),
      scheduledDate: last ? addOneWeek(last.scheduledDate) : `${year}-01-01`,
      isHoliday: false,
      presenter: null,
      presenterUserId: null,
    })
  }

  function handleDragStart(id: string) {
    setDragId(id)
  }

  function handleDragEnd() {
    setDragId(null)
    setDropTargetId(null)
  }

  function handleRowDragOver(
    e: DragEvent<HTMLTableRowElement>,
    id: string,
    holiday: boolean
  ) {
    if (dragId && dragId !== id && !holiday) {
      e.preventDefault()
      setDropTargetId(id)
    }
  }

  function handleRowDragLeave(id: string) {
    setDropTargetId((cur) => (cur === id ? null : cur))
  }

  function handleRowDrop(e: DragEvent<HTMLTableRowElement>, id: string) {
    e.preventDefault()
    setDropTargetId(null)
    if (dragId && dragId !== id) {
      handleSwap(dragId, id)
    }
    setDragId(null)
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-lg" />
        ))}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {isAdmin && (
        <div className="flex items-center justify-between gap-2">
          <Button
            size="sm"
            variant={editMode ? "default" : "outline"}
            onClick={toggleEditMode}
          >
            編輯模式
          </Button>
          {editMode && (
            <span className="text-xs text-muted-foreground">
              拖曳把手互換兩週，或用「⋯」選單互換／插入一週
            </span>
          )}
        </div>
      )}

      <div className="overflow-x-auto rounded-md border">
        <Table className="min-w-[860px]">
          <TableHeader>
            {showEditMode ? (
              <TableRow>
                <TableHead className="w-8" />
                <TableHead className="w-20">週次</TableHead>
                <TableHead className="w-32">日期</TableHead>
                <TableHead className="w-20">假期</TableHead>
                <TableHead className="w-24">報告人</TableHead>
                <TableHead className="w-12 text-center">PPT</TableHead>
                <TableHead className="w-12 text-center">錄影</TableHead>
                <TableHead className="min-w-[200px]">Paper</TableHead>
                <TableHead className="min-w-[120px]">提問小組</TableHead>
                <TableHead className="w-32">備註</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            ) : (
              <TableRow>
                <TableHead className="w-20">週次</TableHead>
                <TableHead className="w-24">日期</TableHead>
                <TableHead className="w-24">報告人</TableHead>
                <TableHead className="w-12 text-center">PPT</TableHead>
                <TableHead className="w-12 text-center">錄影</TableHead>
                <TableHead className="min-w-[200px]">Paper</TableHead>
                <TableHead className="min-w-[120px]">提問小組</TableHead>
                <TableHead className="w-32">備註</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            )}
          </TableHeader>
          <TableBody>
            {meetings.map((m) => {
              const isOwn = user?.id === m.presenterUserId
              const isCurrent = m.id === currentWeekId

              if (showEditMode) {
                return (
                  <ScheduleEditRow
                    key={m.id}
                    meeting={m}
                    year={year}
                    isCurrent={isCurrent}
                    isOwn={isOwn}
                    questioners={questioners?.get(m.id) ?? []}
                    otherWeeks={nonHolidayMeetings.filter((o) => o.id !== m.id)}
                    users={users}
                    isDragging={dragId === m.id}
                    isDropTarget={dropTargetId === m.id}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                    onRowDragOver={handleRowDragOver}
                    onRowDragLeave={handleRowDragLeave}
                    onRowDrop={handleRowDrop}
                    onSwap={handleSwap}
                    onInsert={handleInsert}
                    onRemove={handleRemove}
                  />
                )
              }

              return (
                <TableRow
                  key={m.id}
                  ref={isCurrent ? currentRowRef : undefined}
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
                    <FileCell link={m.pptLink} />
                  </TableCell>
                  <TableCell className="text-center">
                    <FileCell link={m.videoLink} />
                  </TableCell>
                  <TableCell className="max-w-xs">
                    {m.paperLink ? (
                      <a
                        href={m.paperLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={m.paperTitle ?? m.paperLink}
                        className="block truncate text-xs hover:underline"
                      >
                        {m.paperTitle ?? m.paperLink}
                      </a>
                    ) : (
                      <span
                        title={m.paperTitle ?? undefined}
                        className="block truncate text-xs text-muted-foreground"
                      >
                        {m.paperTitle ?? "—"}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    {m.isHoliday || !m.presenterUserId ? (
                      <span className="text-xs text-muted-foreground">—</span>
                    ) : (questioners?.get(m.id) ?? []).length === 0 ? (
                      <span className="text-xs text-muted-foreground">
                        尚無提問小組成員
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {(questioners?.get(m.id) ?? [])
                          .map((q) => q.name ?? "")
                          .join("　")}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {m.notes ?? ""}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {user && !m.isHoliday && !m.presenterUserId && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs"
                          disabled={claimMeeting.isPending}
                          onClick={() => claimMeeting.mutate(m.id)}
                        >
                          認領
                        </Button>
                      )}
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
            {showEditMode && (
              <TableRow>
                <TableCell colSpan={11} className="text-center">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-xs"
                    disabled={addMeeting.isPending}
                    onClick={handleAddWeek}
                  >
                    ＋ 新增一週
                  </Button>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

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
