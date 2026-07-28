"use client"

import { useState } from "react"

import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { cn } from "@workspace/ui/lib/utils"

import { useAttendeeGroups, useLabUsers } from "@/hooks/rooms/use-lab-users"
import {
  useCancelBooking,
  useConfirmBooking,
  usePortalBookingsForDate,
} from "@/hooks/rooms/use-room-booking"

import { AttendeeSelect } from "./_components/attendee-select"
import { useRoomAvailabilityRange } from "@/hooks/rooms/use-room-availability"
import {
  slotTier,
  suggestRoom,
  type AvailabilitySlot,
  type SlotTier,
} from "@/lib/rooms/availability"
import { addDays, formatDayLabel, todayInTaipei } from "@/lib/rooms/date"

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}

const RANGE_DAYS = 14
const LABEL_WIDTH = "w-24"

const TIER_STYLE: Record<SlotTier, string> = {
  free: "bg-emerald-500/70 hover:bg-emerald-500/90 dark:bg-emerald-500/60 dark:hover:bg-emerald-500/80",
  lab: "bg-violet-500/60 hover:bg-violet-500/80 dark:bg-violet-500/50 dark:hover:bg-violet-500/70",
  "paid-only":
    "bg-amber-500/60 hover:bg-amber-500/80 dark:bg-amber-500/50 dark:hover:bg-amber-500/70",
  none: "bg-rose-400/30 hover:bg-rose-400/50 dark:bg-rose-500/25 dark:hover:bg-rose-500/45",
}

const TIER_LEGEND: { tier: SlotTier; label: string }[] = [
  { tier: "free", label: "有免費教室" },
  { tier: "lab", label: "本實驗室已借用" },
  { tier: "paid-only", label: "只剩付費教室" },
  { tier: "none", label: "已滿" },
]

// Duration options offered in the picker, in minutes — must be multiples of
// the 30-minute grid so they map onto a whole number of slots.
const DURATION_OPTIONS = [
  { minutes: 30, label: "30 分" },
  { minutes: 60, label: "1 hr" },
  { minutes: 90, label: "1.5 hr" },
  { minutes: 120, label: "2 hr" },
  { minutes: 150, label: "2.5 hr" },
  { minutes: 180, label: "3 hr" },
]
const SLOT_MINUTES = 30

// Time-axis labels shown between the start/end ends of the strip. Positioned
// by finding the matching slot's index rather than a hardcoded percentage,
// so this stays correct if DAY_WINDOW's hours ever change.
const AXIS_MID_TICKS = ["12:00", "18:00"]

function axisTickPercent(
  slots: AvailabilitySlot[] | undefined,
  time: string
): number | null {
  if (!slots || slots.length === 0) return null
  const index = slots.findIndex((s) => s.start === time)
  return index === -1 ? null : (index / slots.length) * 100
}

interface Selected {
  date: string
  slotIndex: number
  daySlots: AvailabilitySlot[]
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
        {slots.map((slot, slotIndex) => {
          const tier = slotTier(slot)
          const detail =
            tier === "none"
              ? "已滿"
              : tier === "free"
                ? slot.freeRooms.join("、")
                : tier === "lab"
                  ? `本實驗室：${slot.labRooms.join("、")}`
                  : slot.paidRooms.join("、")
          return (
            <button
              key={slot.start}
              type="button"
              title={`${slot.start}–${slot.end}：${detail}`}
              onClick={() => onSelectSlot({ date, slotIndex, daySlots: slots })}
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

function BookingSuggestion({
  date,
  daySlots,
  slotIndex,
  onBooked,
}: {
  date: string
  daySlots: AvailabilitySlot[]
  slotIndex: number
  onBooked: () => void
}) {
  const [durationMinutes, setDurationMinutes] = useState<number | null>(null)
  const [title, setTitle] = useState("")
  const [attendees, setAttendees] = useState<string[]>([])
  const durationSlots = durationMinutes ? durationMinutes / SLOT_MINUTES : 0
  const suggestion = durationMinutes
    ? suggestRoom(daySlots, slotIndex, durationSlots)
    : null
  const confirmBooking = useConfirmBooking()
  const { data: labUsers } = useLabUsers()
  const { data: attendeeGroups } = useAttendeeGroups()

  function handleConfirm() {
    if (!suggestion || !durationMinutes) return
    const endSlot = daySlots[slotIndex + durationSlots - 1]
    const startSlot = daySlots[slotIndex]
    if (!endSlot || !startSlot) return

    confirmBooking.mutate(
      {
        date,
        room: suggestion.room,
        startTime: startSlot.start,
        endTime: endSlot.end,
        title,
        attendees,
      },
      {
        onSuccess: (result) => {
          if (result.inviteError) {
            toast.warning(
              `已預約 ${suggestion.room},但邀請信寄送失敗:${result.inviteError}`
            )
          } else {
            toast.success(`已預約 ${suggestion.room}`)
          }
          onBooked()
        },
        onError: (err) => toast.error(errorMessage(err, "預約失敗")),
      }
    )
  }

  return (
    <div className="flex flex-col gap-2 border-t pt-4">
      <span className="text-xs font-medium text-muted-foreground">
        想借多久?
      </span>
      <div className="flex flex-wrap gap-1.5">
        {DURATION_OPTIONS.map((opt) => (
          <Button
            key={opt.minutes}
            size="sm"
            variant={durationMinutes === opt.minutes ? "default" : "outline"}
            className="h-7"
            onClick={() => setDurationMinutes(opt.minutes)}
          >
            {opt.label}
          </Button>
        ))}
      </div>
      {durationMinutes && (
        <div className="flex flex-col gap-3">
          <p className="text-sm">
            {suggestion
              ? `建議教室:${suggestion.room}（${suggestion.tier === "free" ? "免費" : "付費"}）`
              : "這個時長內沒有教室從頭到尾都空著,試試縮短時間或換個起始時段。"}
          </p>

          {suggestion && (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="booking-title" className="text-xs">
                  會議標題
                </Label>
                <Input
                  id="booking-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="例:Weekly sync"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label className="text-xs">與會人員</Label>
                <AttendeeSelect
                  users={labUsers ?? []}
                  groups={
                    attendeeGroups?.status === "ok" ? attendeeGroups.groups : []
                  }
                  groupsProblem={
                    attendeeGroups && attendeeGroups.status !== "ok"
                      ? attendeeGroups
                      : undefined
                  }
                  value={attendees}
                  onChange={setAttendees}
                />
              </div>

              <Button
                size="sm"
                className="h-7 self-end"
                disabled={confirmBooking.isPending || !title.trim()}
                onClick={handleConfirm}
              >
                {confirmBooking.isPending ? "預約中…" : "確認預約"}
              </Button>
            </>
          )}
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        預約會以本實驗室共用帳號送出,對方系統看到的借用人是「cctseng」,不是你個人帳號。也可以自行到
        <a
          href="https://www.cs.nycu.edu.tw/csauto/meetingroom/"
          target="_blank"
          rel="noopener noreferrer"
          className="mx-1 underline"
        >
          資工系研討室預約系統
        </a>
        操作。
      </p>
    </div>
  )
}

function LabBookingCancel({
  date,
  room,
  start,
  end,
}: {
  date: string
  room: string
  start: string
  end: string
}) {
  const { data: portalBookings, isLoading } = usePortalBookingsForDate(date)
  const { data: labUsers } = useLabUsers()
  const cancelBooking = useCancelBooking()

  if (isLoading) return null

  const match = portalBookings?.find(
    (b) => b.room === room && b.startTime <= start && b.endTime >= end
  )

  if (!match) {
    return (
      <p className="text-xs text-muted-foreground">
        {room}:這筆借用不是透過 Portal 建立,無法在此自動取消。
      </p>
    )
  }

  const attendeeNames = match.attendees
    .map((id) => labUsers?.find((u) => u.id === id)?.name)
    .filter((name): name is string => !!name)

  return (
    <div className="flex flex-col gap-1.5">
      {match.title && <p className="text-sm">{match.title}</p>}
      {attendeeNames.length > 0 && (
        <p className="text-xs text-muted-foreground">
          與會:{attendeeNames.join("、")}
        </p>
      )}
      <Button
        size="sm"
        variant="outline"
        className="h-7 self-start"
        disabled={cancelBooking.isPending}
        onClick={() =>
          cancelBooking.mutate(match.id, {
            onSuccess: (result) =>
              result.inviteError
                ? toast.warning(
                    `已取消 ${room},但取消通知信寄送失敗:${result.inviteError}`
                  )
                : toast.success(`已取消 ${room} 的預約`),
            onError: (err) => toast.error(errorMessage(err, "取消失敗")),
          })
        }
      >
        {cancelBooking.isPending ? "取消中…" : `取消 ${room} 的 Portal 預約`}
      </Button>
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

  const selectedSlot = selected?.daySlots[selected.slotIndex]
  const selectedTier = selectedSlot ? slotTier(selectedSlot) : null

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
            <div className="relative ml-[6.75rem] h-3 text-[10px] text-muted-foreground">
              <span className="absolute left-0">
                {days[0]?.slots[0]?.start}
              </span>
              {AXIS_MID_TICKS.map((time) => {
                const percent = axisTickPercent(days[0]?.slots, time)
                return percent === null ? null : (
                  <span
                    key={time}
                    className="absolute -translate-x-1/2"
                    style={{ left: `${percent}%` }}
                  >
                    {time}
                  </span>
                )
              })}
              <span className="absolute right-0">
                {days[0]?.slots.at(-1)?.end}
              </span>
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
        <DialogContent
          key={selected ? `${selected.date}-${selected.slotIndex}` : "empty"}
        >
          <DialogHeader>
            <DialogTitle>
              {selected &&
                selectedSlot &&
                `${formatDayLabel(selected.date)} ${selectedSlot.start}–${selectedSlot.end}`}
            </DialogTitle>
            <DialogDescription>
              {selectedTier === "none"
                ? "此時段所有教室都已被借用"
                : selectedTier === "lab"
                  ? "此時段已被本實驗室借用"
                  : "此時段可選擇的教室"}
            </DialogDescription>
          </DialogHeader>
          {selected && selectedSlot && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  免費教室
                </span>
                <p className="text-sm">
                  {selectedSlot.freeRooms.length > 0
                    ? selectedSlot.freeRooms.join("、")
                    : "無"}
                </p>
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  付費教室
                </span>
                <p className="text-sm">
                  {selectedSlot.paidRooms.length > 0
                    ? selectedSlot.paidRooms.join("、")
                    : "無"}
                </p>
              </div>
              {selectedSlot.labRooms.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-muted-foreground">
                    本實驗室已借用
                  </span>
                  <p className="text-sm">{selectedSlot.labRooms.join("、")}</p>
                  <div className="flex flex-col gap-1.5">
                    {selectedSlot.labRooms.map((room) => (
                      <LabBookingCancel
                        key={room}
                        date={selected.date}
                        room={room}
                        start={selectedSlot.start}
                        end={selectedSlot.end}
                      />
                    ))}
                  </div>
                </div>
              )}
              <BookingSuggestion
                date={selected.date}
                daySlots={selected.daySlots}
                slotIndex={selected.slotIndex}
                onBooked={() => setSelected(null)}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
