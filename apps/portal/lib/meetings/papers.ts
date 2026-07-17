// Pure logic for "can this reading-list paper be picked" — no React, no I/O, so
// it's unit-testable and shared by the edit dialog (per-meeting availability)
// and the papers tab (global cooldown status). Mirrors the DB rules in
// 2026-07-17-meetings-paper-from-reading-list.sql: a 365-day cooldown between
// any two meetings sharing a paper, plus no-self-repeat per student.

export const COOLDOWN_DAYS = 365

/** A meeting that currently holds a reading-list paper. */
export interface PaperAssignment {
  meetingId: string
  scheduledDate: string
  presenter: string | null
  presenterUserId: string | null
  teacherPaperId: string
}

const MS_PER_DAY = 86_400_000

function dayDiff(a: string, b: string): number {
  return Math.round((Date.parse(a) - Date.parse(b)) / MS_PER_DAY)
}

/** `dateStr` shifted by `n` days, back as an ISO yyyy-mm-dd string. */
export function addDays(dateStr: string, n: number): string {
  const d = new Date(Date.parse(dateStr) + n * MS_PER_DAY)
  return d.toISOString().slice(0, 10)
}

export type PaperUnavailableReason = "cooldown" | "self-repeat"

export interface PaperAvailability {
  available: boolean
  reason?: PaperUnavailableReason
  /** The meeting that blocks this pick (the latest blocker, for cooldown). */
  blockedBy?: PaperAssignment
  /** For a cooldown block: the first date the paper is pickable again. */
  cooldownUntil?: string
}

/**
 * Whether `paperId` can be picked for a meeting on `forDate` by `presenterUserId`.
 * `currentMeetingId` is excluded so a meeting editing its own already-chosen
 * paper never blocks itself.
 */
export function paperAvailabilityForMeeting(
  paperId: string,
  assignments: PaperAssignment[],
  opts: {
    forDate: string
    presenterUserId: string | null
    currentMeetingId: string
  }
): PaperAvailability {
  const others = assignments.filter(
    (a) => a.teacherPaperId === paperId && a.meetingId !== opts.currentMeetingId
  )

  // Self-repeat is permanent, so it takes precedence over a cooldown window.
  if (opts.presenterUserId) {
    const mine = others.find((a) => a.presenterUserId === opts.presenterUserId)
    if (mine) return { available: false, reason: "self-repeat", blockedBy: mine }
  }

  // Cooldown: any sharing meeting strictly within 365 days (past or future).
  let blocker: PaperAssignment | undefined
  let until = ""
  for (const a of others) {
    if (Math.abs(dayDiff(opts.forDate, a.scheduledDate)) < COOLDOWN_DAYS) {
      const free = addDays(a.scheduledDate, COOLDOWN_DAYS)
      if (!blocker || free > until) {
        blocker = a
        until = free
      }
    }
  }
  if (blocker) {
    return {
      available: false,
      reason: "cooldown",
      blockedBy: blocker,
      cooldownUntil: until,
    }
  }

  return { available: true }
}

export interface PaperCooldownStatus {
  inCooldown: boolean
  blockedBy?: PaperAssignment
  cooldownUntil?: string
}

/**
 * Global "is this paper on cooldown right now" for the reading-list view — not
 * tied to a candidate meeting or presenter. `today` is passed in (pure fn).
 */
export function paperCooldownStatus(
  paperId: string,
  assignments: PaperAssignment[],
  today: string
): PaperCooldownStatus {
  let blocker: PaperAssignment | undefined
  let until = ""
  for (const a of assignments) {
    if (a.teacherPaperId !== paperId) continue
    const free = addDays(a.scheduledDate, COOLDOWN_DAYS)
    // Still cooling down if it frees up in the future relative to today.
    if (dayDiff(free, today) > 0 && free > until) {
      blocker = a
      until = free
    }
  }
  if (blocker) return { inCooldown: true, blockedBy: blocker, cooldownUntil: until }
  return { inCooldown: false }
}
