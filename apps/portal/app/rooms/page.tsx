"use client"

import { useState } from "react"

import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { cn } from "@workspace/ui/lib/utils"

import { useRoomAvailabilityRange } from "@/hooks/rooms/use-room-availability"
import {
  slotTier,
  type AvailabilitySlot,
  type SlotTier,
} from "@/lib/rooms/availability"
import { addDays, formatDayLabel, todayInTaipei } from "@/lib/rooms/date"

const RANGE_DAYS = 14
const LABEL_WIDTH = "w-24"

const TIER_STYLE: Record<SlotTier, string> = {
  free: "bg-emerald-500/70 hover:bg-emerald-500/90 dark:bg-emerald-500/60 dark:hover:bg-emerald-500/80",
  "paid-only":
    "bg-amber-500/60 hover:bg-amber-500/80 dark:bg-amber-500/50 dark:hover:bg-amber-500/70",
  none: "bg-rose-400/30 hover:bg-rose-400/50 dark:bg-rose-500/25 dark:hover:bg-rose-500/45",
}

const TIER_LEGEND: { tier: SlotTier; label: string }[] = [
  { tier: "free", label: "有免費教室" },
  { tier: "paid-only", label: "只剩付費教室" },
  { tier: "none", label: "已滿" },
]

interface Selected {
  date: string
  slot: AvailabilitySlot
}

function DayRow({
  date,
  slots,
  onSelectSlot,
}: {
  date: string
  slots: AvailabilitySlot[]
  onSelectSlot: (selected: Selected) => void
}) {
  return (
    <div className="flex items-center gap-3">
      <span
        className={cn(
          LABEL_WIDTH,
          "shrink-0 text-xs font-medium text-muted-foreground"
        )}
      >
        {formatDayLabel(date)}
      </span>
      <div className="flex flex-1 overflow-hidden rounded-md border">
        {slots.map((slot) => {
          const tier = slotTier(slot)
          const detail =
            tier === "none"
              ? "已滿"
              : (tier === "free" ? slot.freeRooms : slot.paidRooms).join("、")
          return (
            <button
              key={slot.start}
              type="button"
              title={`${slot.start}–${slot.end}：${detail}`}
              onClick={() => onSelectSlot({ date, slot })}
              className={cn(
                "h-6 flex-1 cursor-pointer border-r transition-colors last:border-r-0",
                TIER_STYLE[tier]
              )}
            />
          )
        })}
      </div>
    </div>
  )
}

export default function RoomsPage() {
  const [rangeStart, setRangeStart] = useState(todayInTaipei())
  const [selected, setSelected] = useState<Selected | null>(null)
  const {
    data: days,
    isLoading,
    isError,
  } = useRoomAvailabilityRange(rangeStart, RANGE_DAYS)

  const selectedTier = selected ? slotTier(selected.slot) : null

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="font-medium">教室空檔</h1>
        <p className="text-sm text-muted-foreground">
          資工系研討室預約系統的 {RANGE_DAYS} 天空檔總覽,點時段看詳細教室
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={() => setRangeStart((d) => addDays(d, -RANGE_DAYS))}
          >
            <IconChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium">
            {formatDayLabel(rangeStart)} 起 {RANGE_DAYS} 天
          </span>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={() => setRangeStart((d) => addDays(d, RANGE_DAYS))}
          >
            <IconChevronRight className="h-4 w-4" />
          </Button>
          {rangeStart !== todayInTaipei() && (
            <Button
              size="sm"
              variant="outline"
              className="h-7"
              onClick={() => setRangeStart(todayInTaipei())}
            >
              今天
            </Button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
          {TIER_LEGEND.map(({ tier, label }) => (
            <span key={tier} className="flex items-center gap-1.5">
              <span className={cn("h-3 w-3 rounded-sm", TIER_STYLE[tier])} />
              {label}
            </span>
          ))}
        </div>
      </div>

      {isLoading && (
        <div className="flex flex-col gap-2">
          {Array.from({ length: RANGE_DAYS }, (_, i) => (
            <Skeleton key={i} className="h-6 w-full rounded-md" />
          ))}
        </div>
      )}

      {isError && (
        <p className="text-sm text-muted-foreground">
          讀取教室空檔失敗,系上借用系統可能暫時無法連線。
        </p>
      )}

      {days && days.length > 0 && (
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            {days.map(({ date, slots }) => (
              <DayRow
                key={date}
                date={date}
                slots={slots}
                onSelectSlot={setSelected}
              />
            ))}
            <div className="ml-[6.75rem] flex justify-between text-[10px] text-muted-foreground">
              <span>{days[0]?.slots[0]?.start}</span>
              <span>{days[0]?.slots.at(-1)?.end}</span>
            </div>
          </div>

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

      <Dialog
        open={!!selected}
        onOpenChange={(open) => !open && setSelected(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {selected &&
                `${formatDayLabel(selected.date)} ${selected.slot.start}–${selected.slot.end}`}
            </DialogTitle>
            <DialogDescription>
              {selectedTier === "none"
                ? "此時段所有教室都已被借用"
                : "此時段可選擇的教室"}
            </DialogDescription>
          </DialogHeader>
          {selected && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  免費教室
                </span>
                <p className="text-sm">
                  {selected.slot.freeRooms.length > 0
                    ? selected.slot.freeRooms.join("、")
                    : "無"}
                </p>
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  付費教室
                </span>
                <p className="text-sm">
                  {selected.slot.paidRooms.length > 0
                    ? selected.slot.paidRooms.join("、")
                    : "無"}
                </p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
