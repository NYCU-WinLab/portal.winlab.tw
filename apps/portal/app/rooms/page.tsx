"use client"

import { useState } from "react"

import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Label } from "@workspace/ui/components/label"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { Textarea } from "@workspace/ui/components/textarea"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"
import { cn } from "@workspace/ui/lib/utils"

import { useAttendeeGroups, useLabUsers } from "@/hooks/rooms/use-lab-users"
import {
  useCancelBooking,
  useConfirmBooking,
  usePortalBookingsForDate,
} from "@/hooks/rooms/use-room-booking"

import { AttendeeSelect } from "./_components/attendee-select"
import { DeliverablesField } from "./_components/deliverables-field"
import { MeetingStatus } from "./_components/meeting-status"
import { OnlineMeetings } from "./_components/online-meetings"
import { RecurringTab } from "./_components/recurring-tab"
import { TopicField } from "./_components/topic-field"
import { DEFAULT_TOPIC_SUFFIX, topicPrefix } from "@/lib/rooms/meeting-topic"
import { useRoomAvailabilityRange } from "@/hooks/rooms/use-room-availability"
import {
  slotTier,
  suggestRoom,
  type AvailabilitySlot,
  type SlotTier,
} from "@/lib/rooms/availability"
import { addDays, formatDayLabel, todayInTaipei } from "@/lib/rooms/date"
import {
  ADVISOR_USERNAME,
  mergeAttendees,
  type AttendeeContact,
  type PickableGroup,
} from "@/lib/rooms/attendee-groups"

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

// Every branch returns something. Bringing this feature up cost two round
// trips precisely because several distinct failures all rendered as an empty
// space, so "no groups and no reason why" is not an outcome worth keeping.
function groupsNote(
  query: ReturnType<typeof useAttendeeGroups>
): string | null {
  if (query.isLoading) return null
  if (query.isError) {
    const detail =
      query.error instanceof Error ? query.error.message : "unknown"
    return `讀取群組失敗:${detail}`
  }

  const data = query.data
  if (!data) return "讀取群組失敗:沒有回應"

  switch (data.status) {
    case "ok": {
      if (data.groups.length > 0) return null
      if (data.rootGroupCount === 0) {
        return "Keycloak 這個 realm 底下沒有任何群組"
      }
      if (data.subGroupCount === 0) {
        return `Keycloak 有 ${data.rootGroupCount} 個頂層群組,但它們都沒有子群組`
      }
      const who = data.unmailableSample.join("、")
      return `找到 ${data.subGroupCount} 個子群組,但裡面沒有任何人有 email 可以邀請${
        who ? `(例如:${who})` : ""
      }`
    }
    case "unconfigured":
      return "群組功能未啟用:伺服器沒有設定 KEYCLOAK_* 環境變數"
    case "forbidden":
      return `無法讀取 Keycloak 群組:權限不足,admin client 需要 view-users(${data.detail})`
    case "error":
      return `無法讀取 Keycloak 群組:${data.detail}`
  }
}

interface Selected {
  date: string
  slotIndex: number
  daySlots: AvailabilitySlot[]
}

/**
 * What's in one 30-minute cell: when it is, and which rooms are behind the
 * colour.
 *
 * Rooms are listed by tier rather than lumped together — "600A、345" reads as
 * two equivalent options when one is free and the other is chargeable, which
 * is the one distinction the whole colour scheme exists to make.
 */
function SlotTooltip({ date, slot }: { date: string; slot: AvailabilitySlot }) {
  const tier = slotTier(slot)
  const lines: { label: string; rooms: string[] }[] = [
    { label: "免費", rooms: slot.freeRooms },
    { label: "付費", rooms: slot.paidRooms },
    { label: "本實驗室已借", rooms: slot.labRooms },
  ].filter((l) => l.rooms.length > 0)

  return (
    <div className="flex flex-col gap-0.5">
      <div className="font-medium">
        {formatDayLabel(date)} {slot.start}–{slot.end}
      </div>
      {tier === "none" ? (
        <div className="text-muted-foreground">已滿,沒有可借的教室</div>
      ) : (
        lines.map(({ label, rooms }) => (
          <div key={label} className="text-muted-foreground">
            {label}:{rooms.join("、")}
          </div>
        ))
      )}
    </div>
  )
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
        {slots.map((slot, slotIndex) => (
          <Tooltip key={slot.start}>
            <TooltipTrigger
              type="button"
              onClick={() => onSelectSlot({ date, slotIndex, daySlots: slots })}
              className={cn(
                "h-6 flex-1 cursor-pointer border-r transition-colors last:border-r-0",
                TIER_STYLE[slotTier(slot)]
              )}
            />
            <TooltipContent>
              <SlotTooltip date={date} slot={slot} />
            </TooltipContent>
          </Tooltip>
        ))}
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
  const [titleSuffix, setTitleSuffix] = useState(DEFAULT_TOPIC_SUFFIX)
  // Free text handed straight to GitLab, which opens the meeting's issue with
  // it. Optional — a booking with no agenda is still a booking.
  const [agenda, setAgenda] = useState("")
  const [deliverables, setDeliverables] = useState<string[]>([])
  // Which Keycloak group the attendees came from, if a group button was used.
  // Drives the topic prefix, which the user can see but not edit.
  const [groupName, setGroupName] = useState<string | null>(null)
  // Online-only: still a date and a time, just no room reserved.
  const [onlineOnly, setOnlineOnly] = useState(false)
  // On by default: the advisor attends essentially every meeting, and
  // Keycloak's project groups never list him.
  const [includeAdvisor, setIncludeAdvisor] = useState(true)
  const [attendees, setAttendees] = useState<AttendeeContact[]>([])
  const durationSlots = durationMinutes ? durationMinutes / SLOT_MINUTES : 0
  const suggestion = durationMinutes
    ? suggestRoom(daySlots, slotIndex, durationSlots)
    : null
  const confirmBooking = useConfirmBooking()
  const { data: labUsers } = useLabUsers()
  const attendeeGroupsQuery = useAttendeeGroups()
  const attendeeGroups = attendeeGroupsQuery.data

  const advisor = labUsers?.find(
    (u) => u.username === ADVISOR_USERNAME && u.email
  )
  const finalAttendees =
    includeAdvisor && advisor?.email
      ? mergeAttendees(attendees, [
          { name: advisor.name ?? advisor.email, email: advisor.email },
        ])
      : attendees

  // Mirrors what the server will derive. Shown so nobody is surprised by the
  // prefix on their recording; the server recomputes it rather than trusting
  // anything sent from here.
  const prefix = topicPrefix({
    groupName,
    firstAttendeeUsername: finalAttendees.find((a) => a.username)?.username,
  })

  function handleConfirm() {
    if (!durationMinutes) return
    if (!onlineOnly && !suggestion) return
    const endSlot = daySlots[slotIndex + durationSlots - 1]
    const startSlot = daySlots[slotIndex]
    if (!endSlot || !startSlot) return

    const room = onlineOnly ? null : (suggestion?.room ?? null)
    const what = room ? `已預約 ${room}` : "已建立線上會議"

    confirmBooking.mutate(
      {
        date,
        room,
        startTime: startSlot.start,
        endTime: endSlot.end,
        titleSuffix,
        agenda,
        deliverables,
        attendees: finalAttendees,
        groupName,
      },
      {
        onSuccess: (result) => {
          // The server returns failures rather than throwing them, so this
          // branch has to check — a thrown error would be redacted to
          // something meaningless in production.
          if (result.error) {
            toast.error(result.error)
            return
          }
          if (result.inviteError) {
            toast.warning(`${what},但邀請信寄送失敗:${result.inviteError}`)
          } else {
            toast.success(`${what},Teams 會議連結建立中`)
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
          <div className="flex items-center gap-2">
            <Checkbox
              id="online-only"
              checked={onlineOnly}
              onCheckedChange={(next) => setOnlineOnly(next === true)}
            />
            <Label
              htmlFor="online-only"
              className="text-xs font-normal text-muted-foreground"
            >
              純線上（不借教室）
            </Label>
          </div>

          <p className="text-sm">
            {onlineOnly
              ? "不借教室,只開一場 Teams 會議。"
              : suggestion
                ? `建議教室:${suggestion.room}（${suggestion.tier === "free" ? "免費" : "付費"}）`
                : "這個時長內沒有教室從頭到尾都空著,試試縮短時間、換個起始時段,或改成純線上。"}
          </p>

          {(onlineOnly || suggestion) && (
            <>
              <TopicField
                id="booking-title"
                prefix={prefix}
                suffix={titleSuffix}
                onSuffixChange={setTitleSuffix}
              />

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="booking-agenda" className="text-xs">
                  討論事項（可不填）
                </Label>
                <Textarea
                  id="booking-agenda"
                  value={agenda}
                  onChange={(e) => setAgenda(e.target.value)}
                  placeholder="這場會議要討論什麼"
                  rows={3}
                />
                <p className="text-xs text-muted-foreground">
                  會一併帶到 GitLab,成為這場會議 issue 的內容。
                </p>
              </div>

              <DeliverablesField
                id="booking-deliverables"
                value={deliverables}
                onChange={setDeliverables}
              />

              <div className="flex flex-col gap-1.5">
                <Label className="text-xs">與會人員</Label>
                <AttendeeSelect
                  users={labUsers ?? []}
                  groups={
                    attendeeGroups?.status === "ok" ? attendeeGroups.groups : []
                  }
                  groupsNote={groupsNote(attendeeGroupsQuery)}
                  value={attendees}
                  onChange={setAttendees}
                  advisorIncluded={includeAdvisor}
                  onAdvisorIncludedChange={setIncludeAdvisor}
                  onGroupPicked={(group: PickableGroup) =>
                    setGroupName(group.name)
                  }
                />
              </div>

              <p className="rounded-md border bg-muted/50 p-2 text-xs text-muted-foreground">
                這場會議會開在 WinLab 的 Teams 頻道,並且
                <strong>自動錄影、產生逐字稿與 AI 摘要</strong>
                。頻道成員都看得到這場會議,事後也能回看錄影。
              </p>

              <Button
                size="sm"
                className="h-7 self-end"
                disabled={confirmBooking.isPending}
                onClick={handleConfirm}
              >
                {confirmBooking.isPending
                  ? "預約中…"
                  : onlineOnly
                    ? "建立線上會議"
                    : "確認預約"}
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
  onCancelled,
}: {
  date: string
  room: string
  start: string
  end: string
  /** Closes the dialog — the slot it was opened for no longer exists. */
  onCancelled: () => void
}) {
  const { data: portalBookings, isLoading } = usePortalBookingsForDate(date)
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

  const attendeeNames = match.attendees.map((a) => a.name)

  return (
    <div className="flex flex-col gap-1.5">
      {match.title && <p className="text-sm">{match.title}</p>}
      {attendeeNames.length > 0 && (
        <p className="text-xs text-muted-foreground">
          與會:{attendeeNames.join("、")}
        </p>
      )}
      <MeetingStatus meeting={match.meeting} />
      <Button
        size="sm"
        variant="outline"
        className="h-7 self-start"
        disabled={cancelBooking.isPending}
        onClick={() =>
          cancelBooking.mutate(match.id, {
            onSuccess: (result) => {
              if (result.error) {
                toast.error(result.error)
                return
              }
              if (result.inviteError) {
                toast.warning(
                  `已取消 ${room},但取消通知信寄送失敗:${result.inviteError}`
                )
              } else {
                toast.success(`已取消 ${room} 的預約`)
              }
              onCancelled()
            },
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
  // Kick these off with the calendar rather than on dialog open. Both are
  // shared by query key, so the dialog reads them from cache — the Keycloak
  // walk in particular is several round trips and was the whole wait
  // between picking a duration and the group buttons appearing.
  useAttendeeGroups()
  useLabUsers()

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

      <Tabs defaultValue="availability">
        <TabsList>
          <TabsTrigger value="availability">空檔查詢</TabsTrigger>
          <TabsTrigger value="recurring">固定會議</TabsTrigger>
        </TabsList>

        <TabsContent value="recurring" className="mt-4">
          <RecurringTab />
        </TabsContent>

        <TabsContent value="availability" className="mt-4">
          <div className="flex flex-col gap-8">
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
                    <span
                      className={cn("h-3 w-3 rounded-sm", TIER_STYLE[tier])}
                    />
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

            <OnlineMeetings />
          </div>
        </TabsContent>
      </Tabs>

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
                        onCancelled={() => setSelected(null)}
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
