"use client"

import { useState, type DragEvent } from "react"

import { useQueryClient } from "@tanstack/react-query"
import { IconDots, IconGripVertical } from "@tabler/icons-react"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { Input } from "@workspace/ui/components/input"
import { Switch } from "@workspace/ui/components/switch"
import { TableCell, TableRow } from "@workspace/ui/components/table"

import { queryKeys } from "@/hooks/meetings/query-keys"
import { useAdminUpdateMeeting } from "@/hooks/meetings/use-meetings"
import type { Meeting, MeetingQuestioner } from "@/lib/meetings/types"

import { ConfirmDialog } from "./confirm-dialog"
import { FileCell } from "./file-cell"
import { PresenterSelect } from "./presenter-select"

function formatShortDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("zh-TW", {
    month: "numeric",
    day: "numeric",
  })
}

interface ScheduleEditRowProps {
  meeting: Meeting
  year: number
  isCurrent: boolean
  isOwn: boolean
  questioners: MeetingQuestioner[]
  otherWeeks: Meeting[]
  users: { id: string; name: string | null }[]
  isDragging: boolean
  isDropTarget: boolean
  onDragStart: (id: string) => void
  onDragEnd: () => void
  onRowDragOver: (
    e: DragEvent<HTMLTableRowElement>,
    id: string,
    holiday: boolean
  ) => void
  onRowDragLeave: (id: string) => void
  onRowDrop: (e: DragEvent<HTMLTableRowElement>, id: string) => void
  onSwap: (a: string, b: string) => void
  onInsert: (id: string) => void
  onRemove: (id: string) => void
}

export function ScheduleEditRow({
  meeting,
  year,
  isCurrent,
  isOwn,
  questioners,
  otherWeeks,
  users,
  isDragging,
  isDropTarget,
  onDragStart,
  onDragEnd,
  onRowDragOver,
  onRowDragLeave,
  onRowDrop,
  onSwap,
  onInsert,
  onRemove,
}: ScheduleEditRowProps) {
  const updateMeeting = useAdminUpdateMeeting()
  const qc = useQueryClient()
  const [armed, setArmed] = useState(false)
  const [weekLabel, setWeekLabel] = useState(meeting.weekLabel ?? "")

  // Resync the local text buffer when the server value changes underneath us
  // (e.g. a swap/insert/remove elsewhere renumbers this row). Adjusting state
  // during render (React's recommended pattern) instead of in a useEffect.
  const [syncedWeekLabel, setSyncedWeekLabel] = useState(meeting.weekLabel)
  if (meeting.weekLabel !== syncedWeekLabel) {
    setSyncedWeekLabel(meeting.weekLabel)
    setWeekLabel(meeting.weekLabel ?? "")
  }

  function commit(
    patch: Partial<{
      weekLabel: string | null
      scheduledDate: string
      isHoliday: boolean
      presenter: string | null
      presenterUserId: string | null
    }>
  ) {
    // Compose the patch onto the FRESHEST row (from the query cache), not the
    // possibly-stale `meeting` prop, and optimistically write it back. Otherwise
    // two quick edits on the same row before the refetch lands would each carry
    // a pre-first-edit snapshot, and the later request would silently revert the
    // earlier field. useAdminUpdateMeeting UPDATEs all columns at once, so every
    // payload must be a complete, current row.
    const key = queryKeys.meetings.byYear(year)
    const rows = qc.getQueryData<Meeting[]>(key)
    const base = rows?.find((r) => r.id === meeting.id) ?? meeting
    const next: Meeting = { ...base, ...patch }
    if (rows) {
      qc.setQueryData<Meeting[]>(
        key,
        rows.map((r) => (r.id === meeting.id ? next : r))
      )
    }
    updateMeeting.mutate(
      {
        id: next.id,
        weekLabel: next.weekLabel,
        scheduledDate: next.scheduledDate,
        isHoliday: next.isHoliday,
        isSpeaker: next.isSpeaker,
        presenter: next.presenter,
        presenterUserId: next.presenterUserId,
        teacherPaperId: next.teacherPaperId,
        pptUploaded: next.pptUploaded,
        pptLink: next.pptLink,
        videoUploaded: next.videoUploaded,
        videoLink: next.videoLink,
        notes: next.notes,
        location: next.location,
        startTime: next.startTime,
      },
      {
        // The optimistic setQueryData above is unconditional; if the write is
        // rejected (cooldown / uniqueness / RLS) reconcile by refetching so the
        // table can't keep showing a value the server never persisted.
        onError: () => {
          qc.invalidateQueries({ queryKey: queryKeys.meetings.byYear(year) })
        },
      }
    )
  }

  // Holidays and speaker weeks are both anchored calendar events: not draggable,
  // not swappable, and excluded from insert/remove shifts.
  const anchored = meeting.isHoliday || meeting.isSpeaker
  const draggable = !anchored && armed

  return (
    <TableRow
      draggable={draggable}
      onDragStart={(e) => {
        onDragStart(meeting.id)
        e.dataTransfer.effectAllowed = "move"
      }}
      onDragEnd={() => {
        setArmed(false)
        onDragEnd()
      }}
      onDragOver={(e) => onRowDragOver(e, meeting.id, anchored)}
      onDragLeave={() => onRowDragLeave(meeting.id)}
      onDrop={(e) => onRowDrop(e, meeting.id)}
      className={
        isDragging
          ? "opacity-40"
          : isDropTarget
            ? "bg-primary/10"
            : meeting.isHoliday
              ? "opacity-40"
              : isCurrent
                ? "bg-muted/60"
                : isOwn
                  ? "bg-primary/5"
                  : undefined
      }
    >
      <TableCell
        className="w-8 p-0 text-center"
        title={anchored ? undefined : "拖曳互換"}
        onMouseDown={() => {
          if (!anchored) setArmed(true)
        }}
        onMouseUp={() => setArmed(false)}
      >
        {!anchored && (
          <IconGripVertical className="mx-auto h-4 w-4 cursor-grab text-muted-foreground active:cursor-grabbing" />
        )}
      </TableCell>

      <TableCell>
        <Input
          value={weekLabel}
          onChange={(e) => setWeekLabel(e.target.value)}
          onBlur={() => {
            if (weekLabel !== (meeting.weekLabel ?? "")) {
              commit({ weekLabel: weekLabel || null })
            }
          }}
          className="h-7 w-20 px-2 text-xs"
        />
      </TableCell>

      <TableCell>
        <input
          type="date"
          value={meeting.scheduledDate}
          onChange={(e) => commit({ scheduledDate: e.target.value })}
          className="h-7 rounded-md border bg-transparent px-1.5 text-xs"
        />
      </TableCell>

      <TableCell>
        {meeting.isSpeaker ? (
          <Badge variant="secondary" className="font-normal">
            演講
          </Badge>
        ) : (
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Switch
              size="sm"
              checked={meeting.isHoliday}
              onCheckedChange={(v) => commit({ isHoliday: v })}
            />
            假期
          </label>
        )}
      </TableCell>

      <TableCell className="font-medium">
        {meeting.isHoliday ? (
          <span className="text-xs text-muted-foreground">—</span>
        ) : meeting.isSpeaker ? (
          <span className="text-xs">{meeting.presenter ?? "—"}</span>
        ) : (
          <PresenterSelect
            users={users}
            value={meeting.presenterUserId ?? "__none__"}
            onSelect={(userId) => {
              const selected = users.find((u) => u.id === userId)
              commit({
                presenterUserId: userId === "__none__" ? null : userId,
                presenter:
                  userId === "__none__" ? null : (selected?.name ?? null),
              })
            }}
          />
        )}
      </TableCell>

      <TableCell className="text-center">
        <FileCell link={meeting.pptLink} />
      </TableCell>
      <TableCell className="text-center">
        <FileCell link={meeting.videoLink} />
      </TableCell>

      <TableCell className="max-w-xs">
        {meeting.paperLink ? (
          <a
            href={meeting.paperLink}
            target="_blank"
            rel="noopener noreferrer"
            title={meeting.paperTitle ?? meeting.paperLink}
            className="block truncate text-xs hover:underline"
          >
            {meeting.paperTitle ?? meeting.paperLink}
          </a>
        ) : (
          <span
            title={meeting.paperTitle ?? undefined}
            className="block truncate text-xs text-muted-foreground"
          >
            {meeting.paperTitle ?? "—"}
          </span>
        )}
      </TableCell>

      <TableCell>
        {meeting.isHoliday || !meeting.presenterUserId ? (
          <span className="text-xs text-muted-foreground">—</span>
        ) : questioners.length === 0 ? (
          <span className="text-xs text-muted-foreground">
            尚無提問小組成員
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">
            {questioners.map((q) => q.name ?? "").join("　")}
          </span>
        )}
      </TableCell>

      <TableCell className="text-xs text-muted-foreground">
        {meeting.notes ?? ""}
      </TableCell>

      <TableCell>
        <div className="flex justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon-sm" variant="ghost" aria-label="調整此週">
                <IconDots className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuSub>
                <DropdownMenuSubTrigger
                  disabled={anchored || otherWeeks.length === 0}
                >
                  與…互換
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {otherWeeks.map((o) => (
                    <DropdownMenuItem
                      key={o.id}
                      onSelect={() => onSwap(meeting.id, o.id)}
                    >
                      {o.weekLabel ?? "—"} · {formatShortDate(o.scheduledDate)}
                      <span className="ml-auto text-xs text-muted-foreground">
                        {o.presenter ?? "空"}
                      </span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={anchored}
                onSelect={() => onInsert(meeting.id)}
              >
                在此插入一週
              </DropdownMenuItem>
              <ConfirmDialog
                trigger={
                  <DropdownMenuItem
                    variant="destructive"
                    disabled={anchored}
                    onSelect={(e) => e.preventDefault()}
                  >
                    刪除此週(遞補)
                  </DropdownMenuItem>
                }
                title="刪除此週"
                description="確定刪除這週?後面各週會往前遞補"
                confirmText="刪除"
                variant="destructive"
                onConfirm={() => onRemove(meeting.id)}
              />
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </TableCell>
    </TableRow>
  )
}
