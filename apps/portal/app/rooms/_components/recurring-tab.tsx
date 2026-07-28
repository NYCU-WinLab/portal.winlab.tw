"use client"

import { useState } from "react"

import { IconTrash } from "@tabler/icons-react"
import { toast } from "sonner"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Skeleton } from "@workspace/ui/components/skeleton"

import { useAttendeeGroups, useLabUsers } from "@/hooks/rooms/use-lab-users"
import {
  useCreateRecurring,
  useDeleteRecurring,
  useRecurringMeetings,
  useSetRecurringActive,
} from "@/hooks/rooms/use-recurring"
import type { AttendeeContact } from "@/lib/rooms/attendee-groups"
import { groupMeetingTitle } from "@/lib/rooms/attendee-groups"
import { endTimeOf } from "@/lib/rooms/recurrence"

import { AttendeeSelect } from "./attendee-select"

const WEEKDAYS = ["週日", "週一", "週二", "週三", "週四", "週五", "週六"]

// Same 30-minute grid the availability strip uses, so a standing meeting can
// always be matched to a slot boundary.
const START_TIMES = Array.from({ length: 28 }, (_, i) => {
  const total = 8 * 60 + i * 30
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`
})

const DURATIONS = [30, 60, 90, 120, 150, 180]

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}

export function RecurringTab() {
  const { data: meetings, isLoading } = useRecurringMeetings()
  const { data: labUsers } = useLabUsers()
  const groupsQuery = useAttendeeGroups()
  const create = useCreateRecurring()
  const setActive = useSetRecurringActive()
  const remove = useDeleteRecurring()

  const [title, setTitle] = useState("")
  const [autoTitle, setAutoTitle] = useState<string | null>(null)
  const [weekday, setWeekday] = useState(1)
  const [startTime, setStartTime] = useState("09:00")
  const [durationMinutes, setDurationMinutes] = useState(60)
  const [intervalWeeks, setIntervalWeeks] = useState(1)
  const [attendees, setAttendees] = useState<AttendeeContact[]>([])
  const [includeAdvisor, setIncludeAdvisor] = useState(true)

  function handleCreate() {
    create.mutate(
      {
        title,
        weekday,
        startTime,
        durationMinutes,
        intervalWeeks,
        attendees,
        includeAdvisor,
      },
      {
        onSuccess: () => {
          toast.success("已建立固定會議")
          setTitle("")
          setAutoTitle(null)
          setAttendees([])
        },
        onError: (err) => toast.error(errorMessage(err, "建立失敗")),
      }
    )
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4 rounded-xl border bg-card p-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-medium">新增固定會議</h2>
          <p className="text-xs text-muted-foreground">
            系統會在每場會議的 7
            天前自動訂房並寄出邀請。訂不到的話會寄信通知你,不會靜悄悄跳過。
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="recurring-title" className="text-xs">
            會議標題
          </Label>
          <Input
            id="recurring-title"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value)
              setAutoTitle(null)
            }}
            placeholder="例:Weekly sync"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">星期</Label>
          <div className="flex flex-wrap gap-1.5">
            {WEEKDAYS.map((label, day) => (
              <Button
                key={label}
                size="sm"
                variant={weekday === day ? "default" : "outline"}
                className="h-7"
                onClick={() => setWeekday(day)}
              >
                {label}
              </Button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="recurring-start" className="text-xs">
              開始時間
            </Label>
            <select
              id="recurring-start"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="h-9 rounded-md border bg-transparent px-3 text-sm"
            >
              {START_TIMES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="recurring-duration" className="text-xs">
              時長
            </Label>
            <select
              id="recurring-duration"
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(Number(e.target.value))}
              className="h-9 rounded-md border bg-transparent px-3 text-sm"
            >
              {DURATIONS.map((d) => (
                <option key={d} value={d}>
                  {d} 分鐘
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="recurring-interval" className="text-xs">
              頻率
            </Label>
            <select
              id="recurring-interval"
              value={intervalWeeks}
              onChange={(e) => setIntervalWeeks(Number(e.target.value))}
              className="h-9 rounded-md border bg-transparent px-3 text-sm"
            >
              <option value={1}>每週</option>
              <option value={2}>隔週</option>
            </select>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">與會人員</Label>
          <AttendeeSelect
            users={labUsers ?? []}
            groups={
              groupsQuery.data?.status === "ok" ? groupsQuery.data.groups : []
            }
            value={attendees}
            onChange={setAttendees}
            advisorIncluded={includeAdvisor}
            onAdvisorIncludedChange={setIncludeAdvisor}
            onGroupPicked={(group) => {
              if (title !== "" && title !== autoTitle) return
              const next = groupMeetingTitle(group)
              setTitle(next)
              setAutoTitle(next)
            }}
          />
        </div>

        <Button
          size="sm"
          className="h-7 self-end"
          disabled={create.isPending || !title.trim()}
          onClick={handleCreate}
        >
          {create.isPending ? "建立中…" : "建立"}
        </Button>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">目前的固定會議</h2>

        {isLoading && <Skeleton className="h-20 w-full rounded-xl" />}

        {meetings && meetings.length === 0 && (
          <p className="text-sm text-muted-foreground">還沒有固定會議。</p>
        )}

        {meetings?.map((m) => (
          <div
            key={m.id}
            className="flex items-start justify-between gap-4 rounded-xl border bg-card p-4"
          >
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{m.title}</span>
                {!m.active && <Badge variant="secondary">已停用</Badge>}
              </div>
              <p className="text-xs text-muted-foreground">
                {m.intervalWeeks === 2 ? "隔週" : "每週"}
                {WEEKDAYS[m.weekday]} {m.startTime}–
                {endTimeOf(m.startTime, m.durationMinutes)}
              </p>
              {m.attendees.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  與會:{m.attendees.map((a) => a.name).join("、")}
                  {m.includeAdvisor && "、曾建超"}
                </p>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <div className="flex items-center gap-1.5">
                <Checkbox
                  id={`active-${m.id}`}
                  checked={m.active}
                  disabled={setActive.isPending}
                  onCheckedChange={(next) =>
                    setActive.mutate(
                      { id: m.id, active: next === true },
                      {
                        onError: (err) =>
                          toast.error(errorMessage(err, "更新失敗")),
                      }
                    )
                  }
                />
                <Label
                  htmlFor={`active-${m.id}`}
                  className="text-xs font-normal text-muted-foreground"
                >
                  啟用
                </Label>
              </div>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                disabled={remove.isPending}
                aria-label={`刪除 ${m.title}`}
                onClick={() =>
                  remove.mutate(m.id, {
                    onSuccess: () => toast.success("已刪除"),
                    onError: (err) =>
                      toast.error(errorMessage(err, "刪除失敗")),
                  })
                }
              >
                <IconTrash className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
