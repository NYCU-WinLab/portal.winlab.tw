"use client"

import { Fragment, useEffect, useRef, useState, type DragEvent } from "react"

import { Badge } from "@workspace/ui/components/badge"
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
import { useFillPresenters } from "@/hooks/meetings/use-presenter-pool"
import { useQuestionersByYear } from "@/hooks/meetings/use-questioners"
import { useMeetingsAdmin } from "@/hooks/meetings/use-meetings-admin"
import { useLabUsers } from "@/hooks/meetings/use-lab-users"
import { useSemesters } from "@/hooks/meetings/use-semesters"
import { getCurrentMeetingId } from "@/lib/meetings/schedule"
import {
  semesterLabel,
  type Meeting,
  type Semester,
} from "@/lib/meetings/types"

import { ConfirmDialog } from "./confirm-dialog"
import { FileCell } from "./file-cell"
import { GenerateSemesterDialog } from "./generate-semester-dialog"
import { MeetingEditDialog } from "./meeting-edit-dialog"
import { ScheduleEditRow } from "./schedule-edit-row"

function addOneWeek(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`)
  d.setDate(d.getDate() + 7)
  // Format in LOCAL time: toISOString() converts to UTC, which rolls the date
  // back a day in UTC+ timezones (e.g. Asia/Taipei), so "+7 days" from a Friday
  // would land on the Thursday and break the weekly cadence.
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

// Numbering restarts every semester, so this must only ever see one
// semester's rows — the DB does the same when it renumbers.
function nextWeekLabel(meetings: Meeting[]): string {
  let max = 0
  for (const m of meetings) {
    const match = /第(\d+)週/.exec(m.weekLabel ?? "")
    if (match) max = Math.max(max, Number(match[1]))
  }
  return `第${max + 1}週`
}

interface SemesterGroup {
  semesterId: string
  /** Absent when the row's semester isn't in `useSemesters()`' result. */
  semester: Semester | undefined
  rows: Meeting[]
  firstDate: string
  lastDate: string
}

/**
 * Groups the year bucket's rows by semester, ordered by each group's earliest
 * real `scheduledDate` — never by the semester's own `startDate`, which is
 * incidental metadata when a semester was minted by the safety-net trigger.
 * The dates are the authority: inside one year bucket the 下學期 genuinely
 * precedes the 上學期, and the two belong to different academic years.
 */
function groupBySemester(
  meetings: Meeting[],
  semesters: Semester[]
): SemesterGroup[] {
  const byId = new Map(semesters.map((s) => [s.id, s]))
  const rowsBySemester = new Map<string, Meeting[]>()
  for (const m of meetings) {
    const rows = rowsBySemester.get(m.semesterId)
    if (rows) rows.push(m)
    else rowsBySemester.set(m.semesterId, [m])
  }
  // ISO dates sort lexicographically, so string compare is chronological.
  return Array.from(rowsBySemester, ([semesterId, rows]) => ({
    semesterId,
    semester: byId.get(semesterId),
    rows,
    firstDate: rows.reduce(
      (min, r) => (r.scheduledDate < min ? r.scheduledDate : min),
      rows[0]!.scheduledDate
    ),
    lastDate: rows.reduce(
      (max, r) => (r.scheduledDate > max ? r.scheduledDate : max),
      rows[0]!.scheduledDate
    ),
  })).sort((a, b) => a.firstDate.localeCompare(b.firstDate))
}

function spanDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
}

function groupHeading(group: SemesterGroup): string {
  const span = `${spanDate(group.firstDate)} – ${spanDate(group.lastDate)}`
  return group.semester
    ? `${semesterLabel(group.semester)}（${span}）`
    : // An unknown semester still gets its rows shown, headed by the span
      // alone — dropping them would hide real meetings.
      span
}

export function ScheduleTab({ year }: { year: number }) {
  const { user } = useAuth()
  const { isAdmin } = useMeetingsAdmin()
  const { data: meetings = [], isLoading } = useMeetings(year)
  const { data: semesters = [] } = useSemesters()
  const { data: questioners } = useQuestionersByYear(year)
  const { data: users = [] } = useLabUsers()
  const deleteMeeting = useDeleteMeeting()
  const claimMeeting = useClaimMeeting()
  const addMeeting = useAddMeeting()
  const swapMeetings = useSwapMeetings()
  const insertWeek = useInsertMeetingWeek()
  const removeWeek = useRemoveMeetingWeek()
  const fillPresenters = useFillPresenters()

  const [editTarget, setEditTarget] = useState<Meeting | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [generateOpen, setGenerateOpen] = useState(false)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropTargetId, setDropTargetId] = useState<string | null>(null)

  const showEditMode = isAdmin && editMode
  const groups = groupBySemester(meetings, semesters)
  const colCount = showEditMode ? 11 : 9
  // Swap candidates: only real student-presentation weeks — holidays, speaker
  // weeks and thesis weeks are anchored and can't be swapped (meetings_swap
  // refuses all three; a thesis title belongs to the person who wrote it).
  const presentationMeetings = meetings.filter(
    (m) => !m.isHoliday && !m.isSpeaker && !m.isThesis
  )

  // Mirrors meetings_fill_presenters' own filter so the button's count is what
  // the RPC will actually do: unassigned presentation weeks from today onward.
  // A week carrying only a hand-typed name counts as taken, and past weeks are
  // never filled — that would invent a presentation.
  // Pinned to Taipei, matching the RPC's own `(now() at time zone
  // 'Asia/Taipei')::date`. Using the browser's local date would disagree with
  // the server for anyone in another timezone, so the button's count and the
  // number of weeks actually filled would differ — the #336 shape of bug.
  const today = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Taipei",
  }).format(new Date())
  const fillable = presentationMeetings.filter(
    (m) => !m.presenter && !m.presenterUserId && m.scheduledDate >= today
  ).length

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

  // Per group: the appended week has to stay in *this* semester even when its
  // date crosses a month boundary, so semesterId is passed explicitly instead
  // of letting the trigger re-derive it from the date.
  function handleAddWeek(group: SemesterGroup) {
    const last = group.rows[group.rows.length - 1]
    addMeeting.mutate({
      year,
      semesterId: group.semesterId,
      weekLabel: nextWeekLabel(group.rows),
      scheduledDate: last
        ? addOneWeek(last.scheduledDate)
        : (group.semester?.startDate ?? `${year}-01-01`),
      isHoliday: false,
      presenter: null,
      presenterUserId: null,
    })
  }

  // The year bucket is empty, so there is no group to extend and no semester
  // to name: omit semesterId and let meetings_set_semester derive it from the
  // date, exactly as the page-level add-meeting dialog does.
  function handleAddFirstWeek() {
    addMeeting.mutate({
      year,
      weekLabel: nextWeekLabel([]),
      scheduledDate: `${year}-01-01`,
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
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant={editMode ? "default" : "outline"}
              onClick={toggleEditMode}
            >
              編輯模式
            </Button>
            {showEditMode && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setGenerateOpen(true)}
              >
                產生整學期
              </Button>
            )}
            {showEditMode && (
              <ConfirmDialog
                trigger={
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={fillable === 0 || fillPresenters.isPending}
                  >
                    依順位填入空白週
                    {fillable > 0 ? `（${fillable}）` : ""}
                  </Button>
                }
                title="依報告順位填入空白週？"
                description={`將依「報告順位名單」的順序，把 ${year} 學年度尚未排定報告人的 ${fillable} 個未來週次填滿（資深屆先，同屆依順位循環）。假日、演講週，以及已有報告人的週次都不會被更動。`}
                onConfirm={() => fillPresenters.mutate(year)}
              />
            )}
          </div>
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
            {groups.map((group) => (
              <Fragment key={group.semesterId}>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableCell
                    colSpan={colCount}
                    className="text-xs font-medium text-muted-foreground"
                  >
                    {groupHeading(group)}
                  </TableCell>
                </TableRow>
                {group.rows.map((m) => {
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
                        otherWeeks={presentationMeetings.filter(
                          (o) => o.id !== m.id
                        )}
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
                          year: "numeric",
                          month: "numeric",
                          day: "numeric",
                        })}
                      </TableCell>
                      <TableCell className="font-medium">
                        <span className="flex items-center gap-1.5">
                          {m.presenter ?? "—"}
                          {m.isSpeaker && (
                            <Badge variant="secondary" className="font-normal">
                              演講
                            </Badge>
                          )}
                          {m.isThesis && (
                            <Badge variant="secondary" className="font-normal">
                              碩論
                            </Badge>
                          )}
                        </span>
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
                          <span className="text-xs text-muted-foreground">
                            —
                          </span>
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
                          {user &&
                            !m.isHoliday &&
                            !m.isSpeaker &&
                            !m.isThesis &&
                            !m.presenterUserId && (
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
                    <TableCell colSpan={colCount} className="text-center">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-xs"
                        disabled={addMeeting.isPending}
                        onClick={() => handleAddWeek(group)}
                      >
                        ＋ 新增一週
                      </Button>
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            ))}
            {showEditMode && groups.length === 0 && (
              <TableRow>
                <TableCell colSpan={colCount} className="text-center">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-xs"
                    disabled={addMeeting.isPending}
                    onClick={handleAddFirstWeek}
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

      {isAdmin && (
        <GenerateSemesterDialog
          year={year}
          open={generateOpen}
          onOpenChange={setGenerateOpen}
        />
      )}
    </div>
  )
}
