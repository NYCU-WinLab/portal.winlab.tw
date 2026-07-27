"use client"

import { useState } from "react"

import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react"
import { Button } from "@workspace/ui/components/button"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { cn } from "@workspace/ui/lib/utils"

import { useRoomAvailability } from "@/hooks/meetings/use-room-availability"
import { addDays, todayInTaipei } from "@/lib/meetingroom/date"

// Which room is free doesn't matter (see #337-adjacent request) — only
// whether the 免費 tier has an opening, with the paid tier as a
// de-emphasized fallback. So each tier renders as one merged strip, not a
// per-room grid.
function AvailabilityStrip({
  label,
  slots,
  rooms,
  emphasize,
}: {
  label: string
  slots: { start: string; end: string; rooms: string[] }[]
  rooms: string[]
  emphasize: boolean
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between">
        <span
          className={cn(
            "font-medium",
            emphasize ? "text-sm" : "text-xs text-muted-foreground"
          )}
        >
          {label}
        </span>
        <span className="text-xs text-muted-foreground">
          {rooms.length > 0 ? rooms.join("、") : "無"}
        </span>
      </div>
      <div className="flex overflow-hidden rounded-md border">
        {slots.map((slot) => {
          const free = slot.rooms.length > 0
          return (
            <div
              key={slot.start}
              title={`${slot.start}–${slot.end}：${free ? slot.rooms.join("、") : "全滿"}`}
              className={cn(
                emphasize ? "h-8" : "h-4",
                "flex-1 border-r last:border-r-0",
                free
                  ? emphasize
                    ? "bg-emerald-500/70 dark:bg-emerald-500/60"
                    : "bg-emerald-500/30"
                  : emphasize
                    ? "bg-muted-foreground/20"
                    : "bg-muted-foreground/10"
              )}
            />
          )
        })}
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>{slots[0]?.start}</span>
        <span>{slots.at(-1)?.end}</span>
      </div>
    </div>
  )
}

export function RoomAvailabilityTab() {
  const [date, setDate] = useState(todayInTaipei())
  const { data: slots, isLoading, isError } = useRoomAvailability(date)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2">
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          onClick={() => setDate((d) => addDays(d, -1))}
        >
          <IconChevronLeft className="h-4 w-4" />
        </Button>
        <span className="w-28 text-center text-sm font-medium tabular-nums">
          {date}
        </span>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          onClick={() => setDate((d) => addDays(d, 1))}
        >
          <IconChevronRight className="h-4 w-4" />
        </Button>
        {date !== todayInTaipei() && (
          <Button
            size="sm"
            variant="outline"
            className="h-7"
            onClick={() => setDate(todayInTaipei())}
          >
            今天
          </Button>
        )}
      </div>

      {isLoading && (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-16 w-full rounded-lg" />
          <Skeleton className="h-10 w-full rounded-lg" />
        </div>
      )}

      {isError && (
        <p className="text-sm text-muted-foreground">
          讀取教室空檔失敗,系上借用系統可能暫時無法連線。
        </p>
      )}

      {slots && slots.length > 0 && (
        <div className="flex flex-col gap-5">
          <AvailabilityStrip
            label="免費教室"
            slots={slots.map((s) => ({
              start: s.start,
              end: s.end,
              rooms: s.freeRooms,
            }))}
            rooms={[...new Set(slots.flatMap((s) => s.freeRooms))].sort()}
            emphasize
          />
          <AvailabilityStrip
            label="其他教室(需付費)"
            slots={slots.map((s) => ({
              start: s.start,
              end: s.end,
              rooms: s.paidRooms,
            }))}
            rooms={[...new Set(slots.flatMap((s) => s.paidRooms))].sort()}
            emphasize={false}
          />
          <p className="text-xs text-muted-foreground">
            資料來源:
            <a
              href="https://www.cs.nycu.edu.tw/csauto/meetingroom/"
              target="_blank"
              rel="noopener noreferrer"
              className="ml-1 underline"
            >
              資工系研討室預約系統
            </a>
            (非官方 API,僅供參考,實際借用請至該系統操作)
          </p>
        </div>
      )}
    </div>
  )
}
