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
  // weeks the RPC will skip (dates that already exist) so a mis-picked start
  // date can't silently produce a duplicate 第N週 schedule.
  const { data: existing = [] } = useMeetings(year)

  const [startDate, setStartDate] = useState("")
  const [weeks, setWeeks] = useState(16)
  const [holidays, setHolidays] = useState<SemesterHoliday[]>([])

  const weeksValid = Number.isInteger(weeks) && weeks >= 1 && weeks <= 60
  const canSubmit = !!startDate && weeksValid && !generate.isPending

  const existingDates = useMemo(
    () => new Set(existing.map((m) => m.scheduledDate)),
    [existing]
  )

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
      return {
        no: i + 1,
        date,
        reason: byDate.get(date) ?? null,
        skip: existingDates.has(date),
      }
    })
  }, [startDate, weeks, weeksValid, holidays, existingDates])

  // The year already has rows but none of them line up with the chosen cadence:
  // the strongest signal that the start date is wrong and generate would append
  // a parallel, duplicate-numbered schedule instead of filling this one.
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

          {misaligned && (
            <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              此 {year} 年度已有 {existing.length}{" "}
              週排在其他日期，但沒有一週落在你選的日期上——請確認「第一週日期」，以免產生重複週次。
            </p>
          )}

          {preview.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <Label>預覽（已存在的日期會自動略過，不覆寫）</Label>
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
                      {w.skip && (
                        <span className="text-[10px]">已存在・略過</span>
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
