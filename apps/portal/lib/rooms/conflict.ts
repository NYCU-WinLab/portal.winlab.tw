// Does this room already have something in the window we're about to book?
//
// The grid the user clicked was cached — `staleTime` is 60s and nothing
// refetches while a tab sits open — so "600A is free 10:30–12:30" can be
// minutes or hours old by the time 確認預約 is pressed. Booking on that
// picture and letting the dept system say no produces a bare HTTP status
// with no indication of which half-hour went wrong.
//
// Checking here costs one request and turns that into a sentence naming the
// time and the person who has it.

import type { BusySlot } from "./types"

export interface RoomConflict {
  /** "HH:mm" in Asia/Taipei. */
  start: string
  end: string
  subscriber: string
}

function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  return aStart < bEnd && bStart < aEnd
}

/** "HH:mm" for an ISO instant, read in Asia/Taipei. */
export function taipeiHHmm(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Taipei",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso))
}

/**
 * The first reservation standing between us and this window, if any.
 *
 * Compares ISO instants directly: they're all UTC and lexicographically
 * ordered, so no parsing is needed to know which comes first.
 */
export function findConflict(
  busy: BusySlot[],
  room: string,
  start: string,
  end: string
): RoomConflict | null {
  const clash = busy
    .filter((b) => b.room === room && overlaps(start, end, b.start, b.end))
    .sort((a, b) => a.start.localeCompare(b.start))[0]

  if (!clash) return null
  return {
    start: taipeiHHmm(clash.start),
    end: taipeiHHmm(clash.end),
    subscriber: clash.subscriber,
  }
}

/**
 * Names the room, the clashing half-hour and who holds it.
 *
 * Deliberately says which part clashes rather than just "not available":
 * with a two-hour booking, knowing it's the last half hour that's taken is
 * the difference between shortening the meeting and giving up on the slot.
 */
export function describeConflict(
  room: string,
  window: { startTime: string; endTime: string },
  conflict: RoomConflict
): string {
  return (
    `${room} 在 ${conflict.start}–${conflict.end} 已經被「${conflict.subscriber}」借走,` +
    `跟你要的 ${window.startTime}–${window.endTime} 重疊。` +
    `畫面上的空檔表是稍早抓的,可能已經過時 —— 請重新整理後改選其他時段,或縮短時間。`
  )
}
