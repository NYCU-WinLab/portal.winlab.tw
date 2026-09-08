"use client"

import { useMemo, useState } from "react"

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
  useGenerateSemester,
  useMeetings,
  type SemesterHoliday,
} from "@/hooks/meetings/use-meetings"
import { useSemesters } from "@/hooks/meetings/use-semesters"
import { semesterKeyForDate } from "@/lib/meetings/semester"

interface Props {
  year: number
  open: boolean
  onOpenChange: (open: boolean) => void
}

// Add whole days in LOCAL time. Going through Date#toISOString() would convert
// to UTC and roll the day back in UTC+ timezones (Asia/Taipei), breaking the
// weekly cadence — same reason schedule-tab's addOneWeek formats locally.
function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00`)
  d.setDate(d.getDate() + days)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function formatMd(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString("zh-TW", {
    month: "numeric",
    day: "numeric",
  })
}

export function GenerateSemesterDialog({ year, open, onOpenChange }: Props) {
  const generate = useGenerateSemester()
  // Cache hit — schedule-tab already fetched this year. Used to show which
  // weeks the RPC will skip so a mis-picked start date can't silently produce a
  // duplicate 第N週 schedule. The RPC skips for TWO reasons and this preview has
  // to mirror both, or the case it was built for — a start date shifted by a
  // week, where no date collides but every number is taken — shows as sixteen
  // insertable weeks and then inserts none.
  const { data: existing = [] } = useMeetings(year)
  // Same trap schedule-tab fell into: without the semester list the week-number
  // rule below silently switches itself off and the preview quietly reverts to
  // the date-only rule it had before — looking exactly like a start date that
  // collides with nothing. The banner further down is what stops a viewer
  // believing an incomplete preview.
  const { data: semesters = [], isError: semestersFailed } = useSemesters()

  const [startDate, setStartDate] = useState("")
  const [weeks, setWeeks] = useState(16)
  const [holidays, setHolidays] = useState<SemesterHoliday[]>([])

  const weeksValid = Number.isInteger(weeks) && weeks >= 1 && weeks <= 60
  const canSubmit = !!startDate && weeksValid && !generate.isPending

  const existingDates = useMemo(
    () => new Set(existing.map((m) => m.scheduledDate)),
    [existing]
  )

  // Which 第N週 numbers the semester this generate would open ALREADY holds —
  // the server's second skip rule, mirrored. The semester is the one the start
  // date falls in; if it hasn't been minted yet there is nothing to collide
  // with and the set is empty.
  //
  // Known limitation, shared with `existingDates` above: `existing` is one
  // `meetings.year` bucket, and a semester can span two, so a semester whose
  // earlier half sits in the previous bucket contributes only the numbers
  // visible here. The server is the authority and skips either way; this is a
  // preview, and it now errs on the same side as the dates do.
  const usedWeekNumbers = useMemo(() => {
    const used = new Set<number>()
    if (!startDate) return used
    const key = semesterKeyForDate(startDate)
    const target = semesters.find(
      (s) => s.academicYear === key.academicYear && s.term === key.term
    )
    if (!target) return used
    for (const m of existing) {
      if (m.semesterId !== target.id) continue
      // Prefix match, like the RPC's `^第N週` regex: 第2週(月考週) still counts
      // as number 2 being taken.
      const match = /^第(\d+)週/.exec(m.weekLabel ?? "")
      if (match) used.add(Number(match[1]))
    }
    return used
  }, [startDate, semesters, existing])

  const preview = useMemo(() => {
    if (!startDate || !weeksValid) return []
    // First-occurrence wins per date, matching the server's `limit 1` scan, and
    // the same (date + non-blank label) predicate submit() uses — so the preview
    // never promises a holiday the server won't create.
    const byDate = new Map<string, string>()
    for (const h of holidays) {
      const label = h.label.trim()
      if (h.date && label && !byDate.has(h.date)) byDate.set(h.date, label)
    }
    return Array.from({ length: weeks }, (_, i) => {
      const date = addDays(startDate, i * 7)
      const no = i + 1
      // Date first, then label — the order the RPC checks them in, so the
      // reason shown is the reason the server will act on.
      const skipReason = existingDates.has(date)
        ? "date"
        : usedWeekNumbers.has(no)
          ? "label"
          : null
      return {
        no,
        date,
        reason: byDate.get(date) ?? null,
        skip: skipReason !== null,
        skipReason,
      }
    })
  }, [startDate, weeks, weeksValid, holidays, existingDates, usedWeekNumbers])

  // The year already has rows, and not one of the weeks about to be generated
  // collides with them — neither by date nor by week number. That is the
  // strongest signal left that the start date is wrong: generate would lay a
  // parallel schedule beside the existing one instead of filling it.
  const misaligned =
    existing.length > 0 && preview.length > 0 && preview.every((w) => !w.skip)

  function setHoliday(i: number, patch: Partial<SemesterHoliday>) {
    setHolidays((hs) =>
      hs.map((h, idx) => (idx === i ? { ...h, ...patch } : h))
    )
  }

  function submit() {
    if (!canSubmit) return
    generate.mutate(
      {
        year,
        startDate,
        weeks,
        // Trim the label in the payload too, so the stored week_label matches
        // the (already-trimmed) preview exactly — no "第2週(月考週 )" drift.
        holidays: holidays
          .filter((h) => h.date && h.label.trim())
          .map((h) => ({ date: h.date, label: h.label.trim() })),
      },
      {
        onSuccess: () => {
          onOpenChange(false)
          setHolidays([])
        },
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>產生整學期排班（{year}）</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>第一週日期</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>週數</Label>
              <Input
                type="number"
                min={1}
                max={60}
                value={weeks}
                onChange={(e) => setWeeks(Number(e.target.value))}
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label>假期週（放假 / 停開，對照行事曆填）</Label>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                onClick={() =>
                  setHolidays((hs) => [...hs, { date: "", label: "" }])
                }
              >
                ＋ 新增假期
              </Button>
            </div>
            {holidays.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                無假期週。命中的日期會標成 <code>第N週(原因)</code>
                ，不排報告人。
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {holidays.map((h, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      type="date"
                      className="w-40"
                      value={h.date}
                      onChange={(e) => setHoliday(i, { date: e.target.value })}
                    />
                    <Input
                      className="flex-1"
                      placeholder="教師節 / 月考週 / 清明連假"
                      value={h.label}
                      onChange={(e) => setHoliday(i, { label: e.target.value })}
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-8 px-2 text-xs text-destructive hover:text-destructive"
                      onClick={() =>
                        setHolidays((hs) => hs.filter((_, idx) => idx !== i))
                      }
                    >
                      移除
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {semestersFailed && (
            <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              讀取學期失敗，下方預覽只會標出「日期已存在」的週次，無法標出「週次編號已被此學期使用」的週次——仍可產生，伺服器一樣會略過重複的週次，但預覽此刻並不完整。
            </p>
          )}

          {misaligned && (
            <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              此 {year} 年度已有 {existing.length}{" "}
              週排在其他日期，但沒有一週落在你選的日期上——請確認「第一週日期」，以免產生重複週次。
            </p>
          )}

          {preview.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <Label>
                預覽（日期已排定、或該週次編號此學期已用過的，都會自動略過，不覆寫）
              </Label>
              <div className="max-h-56 overflow-y-auto rounded-md border">
                {preview.map((w) => (
                  <div
                    key={w.no}
                    className={
                      "flex items-center justify-between border-b px-3 py-1 text-xs last:border-b-0 " +
                      (w.skip || w.reason ? "text-muted-foreground" : "")
                    }
                  >
                    <span className="font-medium">
                      第{w.no}週{w.reason ? `(${w.reason})` : ""}
                    </span>
                    <span className="flex items-center gap-2">
                      {w.skipReason === "date" && (
                        <span className="text-[10px]">日期已存在・略過</span>
                      )}
                      {w.skipReason === "label" && (
                        <span className="text-[10px]">
                          此學期已有第{w.no}週・略過
                        </span>
                      )}
                      {formatMd(w.date)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={generate.isPending}
          >
            取消
          </Button>
          <Button onClick={submit} disabled={!canSubmit}>
            {generate.isPending ? "產生中…" : "產生"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
