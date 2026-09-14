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
  useAppendMeetingWeek,
  useSwapMeetings,
  useInsertMeetingWeek,
  useRemoveMeetingWeek,
} from "@/hooks/meetings/use-meetings"
import { useFillPresenters } from "@/hooks/meetings/use-presenter-pool"
import { useQuestionersByYear } from "@/hooks/meetings/use-questioners"
import { useMeetingsAdmin } from "@/hooks/meetings/use-meetings-admin"
import { useLabUsers } from "@/hooks/meetings/use-lab-users"
import { getCurrentMeetingId } from "@/lib/meetings/schedule"
import { semesterKeyForDate, semesterWindow } from "@/lib/meetings/semester"
import { semesterLabel, type Meeting } from "@/lib/meetings/types"

import { ConfirmDialog } from "./confirm-dialog"
import { FileCell } from "./file-cell"
import { GenerateSemesterDialog } from "./generate-semester-dialog"
import { MeetingEditDialog } from "./meeting-edit-dialog"
import { ScheduleEditRow } from "./schedule-edit-row"

interface SemesterGroup {
  /** `"115-1"`，只用來當 React key 與 Map 的鍵。 */
  key: string
  academicYear: number
  term: 1 | 2
  rows: Meeting[]
  firstDate: string
}

/**
 * 把這個年份頁籤的列按學期分組。學期從每一列自己的日期推導——不再有
 * semester_id 欄位，也不再需要一支查詢：分組永遠成立，不會失敗。
 *
 * 依各組最早的實際日期排序。同一個年份頁籤裡下學期確實可能排在上學期前面
 * （1 月是上學期的尾巴、2 月是下學期的開頭），而兩者屬於不同學年度。
 */
function groupBySemester(meetings: Meeting[]): SemesterGroup[] {
  const byKey = new Map<string, SemesterGroup>()
  for (const m of meetings) {
    const { academicYear, term } = semesterKeyForDate(m.scheduledDate)
    const key = `${academicYear}-${term}`
    const group = byKey.get(key)
    if (group) {
      group.rows.push(m)
      // ISO 日期字串的字典序就是時序。
      if (m.scheduledDate < group.firstDate) group.firstDate = m.scheduledDate
    } else {
      byKey.set(key, {
        key,
        academicYear,
        term,
        rows: [m],
        firstDate: m.scheduledDate,
      })
    }
  }
  return Array.from(byKey.values()).sort((a, b) =>
    a.firstDate.localeCompare(b.firstDate)
  )
}

function spanDate(dateStr: string): string {
  // `T00:00:00` makes this parse as LOCAL midnight. A bare YYYY-MM-DD is parsed
  // as UTC midnight, which renders as the previous day anywhere west of UTC —
  // harmless in Asia/Taipei, wrong everywhere else.
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
}

/**
 * 標題印的是學期**完整**的日期窗（8/1–1/31 或 2/1–7/31），不是這個頁籤剛好
 * 看得到的那幾列的頭尾。一個學期會橫跨兩個年份頁籤，印可見範圍會讓同一個
 * 學期在兩頁顯示成兩段不同的區間，而它其實是同一段。
 */
function groupHeading(group: SemesterGroup): string {
  const window = semesterWindow(group.rows[0]!.scheduledDate)
  const span = `${spanDate(window.start)} – ${spanDate(window.end)}`
  const label = semesterLabel({
    academicYear: group.academicYear,
    term: group.term,
  })
  return `${label}（${span}）`
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
  const appendWeek = useAppendMeetingWeek()
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
  const groups = groupBySemester(meetings)
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

  // 只送學期。日期與標籤都由伺服器從整個學期算，不是從這個頁籤剛好看得到的
  // 那一段——一個學期會橫跨兩個年份頁籤。
  function handleAddWeek(group: SemesterGroup) {
    appendWeek.mutate({ academicYear: group.academicYear, term: group.term })
  }

  // The year bucket is empty, so there is no group to extend and no semester to
  // name. append_week has nothing to append to here, which is why this one path
  // stays on useAddMeeting — and useAddMeeting is exactly right for it: the
  // meetings_set_semester trigger derives the semester from the chosen date,
  // the same way the page-level add-meeting dialog relies on it.
  function handleAddFirstWeek() {
    addMeeting.mutate({
      weekLabel: "第1週",
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
              <Fragment key={group.key}>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  {/* A heading for the rows below it, so it is a th with
                      scope="rowgroup" — the value that means "applies to the
                      remaining cells of this row group". `colgroup` would be
                      inert here: there are no <colgroup>s to scope to.
                      `h-auto p-3` and the muted colour undo TableHead's own
                      h-12/px-3/text-foreground via cn's tailwind-merge, keeping
                      the band identical to the TableCell it replaces. */}
                  <TableHead
                    scope="rowgroup"
                    colSpan={colCount}
                    className="h-auto p-3 text-xs font-medium text-muted-foreground"
                  >
                    {groupHeading(group)}
                  </TableHead>
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
                        // Same semester only: meetings_swap refuses a
                        // cross-semester swap ("只能在同一學期內互換"), and it
                        // decides that by comparing each row's derived
                        // semester window — there's no stored semester id to
                        // compare any more. `m` is one of `group.rows`, so its
                        // derived key already equals `group`'s; only `o` needs
                        // deriving.
                        otherWeeks={presentationMeetings.filter((o) => {
                          if (o.id === m.id) return false
                          const key = semesterKeyForDate(o.scheduledDate)
                          return (
                            key.academicYear === group.academicYear &&
                            key.term === group.term
                          )
                        })}
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
                        {/* `T00:00:00` parses as local midnight — see spanDate
                            above. */}
                        {new Date(
                          `${m.scheduledDate}T00:00:00`
                        ).toLocaleDateString("zh-TW", {
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
                        disabled={appendWeek.isPending}
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
