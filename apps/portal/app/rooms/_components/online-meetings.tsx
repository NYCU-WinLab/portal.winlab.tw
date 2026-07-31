"use client"

import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import { Skeleton } from "@workspace/ui/components/skeleton"

import {
  useCancelBooking,
  useOnlineBookings,
} from "@/hooks/rooms/use-room-booking"
import { formatDayLabel } from "@/lib/rooms/date"

import { MeetingStatus } from "./meeting-status"

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}

/**
 * Meetings that booked no room.
 *
 * Deliberately a list rather than blocks on the availability grid: an
 * online-only meeting occupies no room, and drawing it there would claim a
 * room is taken when none is. But with no home at all they were invisible —
 * you couldn't tell one existed, and there was nowhere to cancel it.
 */
export function OnlineMeetings() {
  const { data: meetings, isLoading } = useOnlineBookings()
  const cancelBooking = useCancelBooking()

  if (isLoading) return <Skeleton className="h-16 w-full rounded-xl" />
  if (!meetings || meetings.length === 0) return null

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-medium">接下來的線上會議</h2>
        <p className="text-xs text-muted-foreground">
          這些會議沒有借教室,所以不會出現在上面的教室空檔表。
        </p>
      </div>

      {meetings.map((m) => (
        <div
          key={m.id}
          className="flex items-start justify-between gap-4 rounded-xl border bg-card p-4"
        >
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">{m.title ?? "線上會議"}</span>
            <p className="text-xs text-muted-foreground">
              {formatDayLabel(m.date)} {m.startTime}–{m.endTime}
            </p>
            {m.attendees.length > 0 && (
              <p className="text-xs text-muted-foreground">
                與會:{m.attendees.map((a) => a.name).join("、")}
              </p>
            )}
            <MeetingStatus meeting={m.meeting} />
          </div>

          <Button
            size="sm"
            variant="outline"
            className="h-7 shrink-0"
            disabled={cancelBooking.isPending}
            onClick={() =>
              cancelBooking.mutate(m.id, {
                onSuccess: (result) =>
                  result.inviteError
                    ? toast.warning(
                        `已取消,但取消通知信寄送失敗:${result.inviteError}`
                      )
                    : toast.success("已取消這場線上會議"),
                onError: (err) => toast.error(errorMessage(err, "取消失敗")),
              })
            }
          >
            取消
          </Button>
        </div>
      ))}
    </div>
  )
}
