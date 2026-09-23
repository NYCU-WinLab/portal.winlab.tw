import type { SupabaseClient } from "@supabase/supabase-js"

import {
  fetchMeetings,
  fetchQuestionersByYear,
  fetchScheduleYearBounds,
} from "@/lib/meetings/fetch"
import { getCurrentMeetingId } from "@/lib/meetings/schedule"
import type { Meeting, MeetingQuestioner } from "@/lib/meetings/types"

export interface NextMeeting {
  meeting: Meeting
  questioners: MeetingQuestioner[]
}

/**
 * `getCurrentMeetingId` compares against a Date, and both halves of that
 * comparison have to mean the same instant for a meeting happening today to
 * count as upcoming: `new Date("YYYY-MM-DD")` is UTC midnight, so the Taipei
 * day is anchored at UTC midnight too rather than at the server's own clock,
 * which runs eight hours behind Taipei.
 */
function taipeiDayStart(day: string): Date {
  return new Date(`${day}T00:00:00Z`)
}

/**
 * The nearest lab meeting on or after `today` (a `YYYY-MM-DD` Asia/Taipei
 * day), holiday weeks skipped, with its questioners. Shared by the MCP
 * `get_next_meeting` tool and the door panel's `/api/door/meeting`, so both
 * answer "which meeting is next" the same way.
 */
export async function fetchNextMeeting(
  supabase: SupabaseClient,
  today: string
): Promise<NextMeeting | null> {
  const bounds = await fetchScheduleYearBounds(supabase, today)
  const year = bounds.upcomingDate
    ? Number(bounds.upcomingDate.slice(0, 4))
    : null
  const meetings = year ? await fetchMeetings(supabase, year) : []
  const nextId = getCurrentMeetingId(meetings, taipeiDayStart(today))
  const meeting = meetings.find((m) => m.id === nextId)
  if (!meeting) return null

  const questioners = await fetchQuestionersByYear(
    supabase,
    Number(meeting.scheduledDate.slice(0, 4))
  )
  return { meeting, questioners: questioners.get(meeting.id) ?? [] }
}
