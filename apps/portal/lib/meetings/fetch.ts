import type { SupabaseClient } from "@supabase/supabase-js"

import type { ScheduleYearBounds } from "@/lib/meetings/schedule-year"
import {
  toMeeting,
  type DbMeeting,
  type Meeting,
  type MeetingQuestioner,
} from "@/lib/meetings/types"

const MEETINGS = "meetings"
const QUESTIONERS = "meeting_questioners"

/**
 * One calendar year of the schedule, oldest first. Shared by the client hook
 * (browser client) and the MCP tools (per-caller client) — same query, so both
 * see the same rows under the same RLS.
 */
export async function fetchMeetings(
  supabase: SupabaseClient,
  year: number
): Promise<Meeting[]> {
  // 頁籤是西元年，過濾就用西元年的日期區間。以前這裡讀的是 meetings.year
  // 欄位——一份在列被搬動時不會跟著更新的狀態，於是跨年搬過去的人會留在
  // 舊的頁籤上。日期是列上唯一會被編輯的東西，所以用它。
  const { data, error } = await supabase
    .from(MEETINGS)
    .select("*")
    .gte("scheduled_date", `${year}-01-01`)
    .lte("scheduled_date", `${year}-12-31`)
    .order("scheduled_date", { ascending: true })
  if (error) throw new Error(error.message || "讀取排班失敗")
  return (data as DbMeeting[]).map(toMeeting)
}

interface RawQuestionerRow {
  meeting_id: string
  user_id: string
  source: "auto" | "manual"
  assigned_at: string
  user_profiles: { name: string | null } | null
  meetings: { scheduled_date: string } | null
}

/** That year's questioners, keyed by meeting id, in assignment order. */
export async function fetchQuestionersByYear(
  supabase: SupabaseClient,
  year: number
): Promise<Map<string, MeetingQuestioner[]>> {
  const { data, error } = await supabase
    .from(QUESTIONERS)
    .select(
      "meeting_id, user_id, source, assigned_at, user_profiles(name), meetings!inner(scheduled_date)"
    )
    .gte("meetings.scheduled_date", `${year}-01-01`)
    .lte("meetings.scheduled_date", `${year}-12-31`)
    .order("assigned_at", { ascending: true })
  if (error) throw new Error(error.message || "讀取提問人失敗")

  const byMeeting = new Map<string, MeetingQuestioner[]>()
  for (const row of (data ?? []) as unknown as RawQuestionerRow[]) {
    const questioner: MeetingQuestioner = {
      meetingId: row.meeting_id,
      userId: row.user_id,
      name: row.user_profiles?.name ?? null,
      source: row.source,
    }
    const existing = byMeeting.get(row.meeting_id)
    if (existing) {
      existing.push(questioner)
    } else {
      byMeeting.set(row.meeting_id, [questioner])
    }
  }
  return byMeeting
}

/**
 * The two facts a caller needs before it can pick a year to show: the date of
 * the next meeting, and the date of the last row in the whole schedule. Two
 * `limit(1)` reads rather than pulling the table down — see
 * `lib/meetings/schedule-year.ts` for why neither can be derived from the
 * clock.
 *
 * `today` is a `YYYY-MM-DD` Asia/Taipei day, sampled by the caller: the
 * database session is UTC, so a Taipei morning would otherwise count as
 * "yesterday" for eight hours and could skip a meeting happening today.
 */
export async function fetchScheduleYearBounds(
  supabase: SupabaseClient,
  today: string
): Promise<ScheduleYearBounds> {
  const [upcoming, latest] = await Promise.all([
    supabase
      .from(MEETINGS)
      .select("scheduled_date")
      .gte("scheduled_date", today)
      // Holidays are rows but not meetings. Counting one would return the
      // date of the next 元旦 / 月考週 marker instead of the date of the
      // next actual presentation — which is the whole question being
      // asked here.
      .eq("is_holiday", false)
      .order("scheduled_date", { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from(MEETINGS)
      .select("scheduled_date")
      .order("scheduled_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  if (upcoming.error) throw new Error(upcoming.error.message)
  if (latest.error) throw new Error(latest.error.message)

  const upcomingRow = upcoming.data as { scheduled_date: string } | null
  const latestRow = latest.data as { scheduled_date: string } | null
  return {
    upcomingDate: upcomingRow?.scheduled_date ?? null,
    latestDate: latestRow?.scheduled_date ?? null,
  }
}
