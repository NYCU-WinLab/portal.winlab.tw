"use client"

import type { BookingMeeting } from "../actions"

/**
 * Where the Teams meeting got to.
 *
 * All three states say something. "Still being created" and "it failed" look
 * identical if only the success case is rendered, and that ambiguity is what
 * makes a broken pipeline invisible.
 */
export function MeetingStatus({ meeting }: { meeting: BookingMeeting | null }) {
  if (!meeting) return null

  if (meeting.status === "success" && meeting.joinUrl) {
    return (
      <a
        href={meeting.joinUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs underline underline-offset-2"
      >
        加入 Teams 會議
      </a>
    )
  }

  if (meeting.status === "pending") {
    return (
      <p className="text-xs text-muted-foreground">
        Teams 會議連結建立中…（通常一兩分鐘,重新整理就會出現）
      </p>
    )
  }

  return (
    <p className="text-xs text-destructive">
      Teams 會議建立失敗
      {meeting.errorCode ? `（${meeting.errorCode}）` : ""}
      ,教室預約不受影響。建立者已收到通知。
    </p>
  )
}
