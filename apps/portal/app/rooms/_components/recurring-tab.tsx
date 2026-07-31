"use client"

import { useState } from "react"

import { IconTrash } from "@tabler/icons-react"
import { toast } from "sonner"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
import { Label } from "@workspace/ui/components/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { Skeleton } from "@workspace/ui/components/skeleton"

import { useAttendeeGroups, useLabUsers } from "@/hooks/rooms/use-lab-users"
import {
  useCreateRecurring,
  useDeleteRecurring,
  useRecurringMeetings,
  useSetRecurringActive,
} from "@/hooks/rooms/use-recurring"
import type { AttendeeContact } from "@/lib/rooms/attendee-groups"
import { DEFAULT_TOPIC_SUFFIX, topicPrefix } from "@/lib/rooms/meeting-topic"
import { endTimeOf } from "@/lib/rooms/recurrence"

import { AttendeeSelect } from "./attendee-select"
import { TopicField } from "./topic-field"

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

  const [titleSuffix, setTitleSuffix] = useState(DEFAULT_TOPIC_SUFFIX)
  const [groupName, setGroupName] = useState<string | null>(null)
  const [weekday, setWeekday] = useState(1)
  const [startTime, setStartTime] = useState("09:00")
  const [durationMinutes, setDurationMinutes] = useState(60)
  const [intervalWeeks, setIntervalWeeks] = useState(1)
  const [attendees, setAttendees] = useState<AttendeeContact[]>([])
  const [includeAdvisor, setIncludeAdvisor] = useState(true)

  // Mirrors what the server derives; the server recomputes rather than
  // trusting this.
  const prefix = topicPrefix({
    groupName,
    firstAttendeeUsername: attendees.find((a) => a.username)?.username,
  })

  function handleCreate() {
    create.mutate(
      {
        titleSuffix,
        weekday,
        startTime,
        durationMinutes,
        intervalWeeks,
        attendees,
        includeAdvisor,
        groupName,
      },
      {
        onSuccess: () => {
          toast.success("已建立固定會議")
          setTitleSuffix(DEFAULT_TOPIC_SUFFIX)
          setGroupName(null)
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

        <TopicField
          id="recurring-title"
          prefix={prefix}
          suffix={titleSuffix}
          onSuffixChange={setTitleSuffix}
        />

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
            <Select value={startTime} onValueChange={setStartTime}>
              <SelectTrigger id="recurring-start" className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {START_TIMES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="recurring-duration" className="text-xs">
              時長
            </Label>
            <Select
              value={String(durationMinutes)}
              onValueChange={(v) => setDurationMinutes(Number(v))}
            >
              <SelectTrigger id="recurring-duration" className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DURATIONS.map((d) => (
                  <SelectItem key={d} value={String(d)}>
                    {d} 分鐘
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="recurring-interval" className="text-xs">
              頻率
            </Label>
            <Select
              value={String(intervalWeeks)}
              onValueChange={(v) => setIntervalWeeks(Number(v))}
            >
              <SelectTrigger id="recurring-interval" className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">每週</SelectItem>
                <SelectItem value="2">隔週</SelectItem>
              </SelectContent>
            </Select>
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
            onGroupPicked={(group) => setGroupName(group.name)}
          />
        </div>

        <p className="rounded-md border bg-muted/50 p-2 text-xs text-muted-foreground">
          每一場都會開在 WinLab 的 Teams 頻道,並且
          <strong>自動錄影、產生逐字稿與 AI 摘要</strong>
          。標題前綴在建立時固定下來,之後群組成員異動也不會改變,錄影檔才會一直歸在同一個專案底下。
        </p>

        <Button
          size="sm"
          className="h-7 self-end"
          disabled={create.isPending}
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
