import type { McpServer } from "@modelcontextprotocol/server"
import { z } from "zod"

import {
  failure,
  json,
  PORTAL_URL,
  requireCaller,
  type ToolContext,
} from "@/lib/mcp/context"
import { createUserClient } from "@/lib/mcp/supabase"
import {
  fetchMeetings,
  fetchQuestionersByYear,
  fetchScheduleYearBounds,
} from "@/lib/meetings/fetch"
import { meetingType, MEETING_TYPE_LABELS } from "@/lib/meetings/meeting-type"
import { fetchNextMeeting } from "@/lib/meetings/next"
import { defaultScheduleYear } from "@/lib/meetings/schedule-year"
import type { Meeting, MeetingQuestioner } from "@/lib/meetings/types"

function todayInTaipei(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Taipei" }).format(
    new Date()
  )
}

export function toMeetingRow(
  meeting: Meeting,
  questioners: MeetingQuestioner[]
) {
  const type = meetingType(meeting)
  return {
    id: meeting.id,
    date: meeting.scheduledDate,
    start_time: meeting.startTime.slice(0, 5),
    location: meeting.location,
    week_label: meeting.weekLabel,
    type,
    type_label: MEETING_TYPE_LABELS[type],
    is_holiday: meeting.isHoliday,
    presenter: meeting.presenter,
    presenter_user_id: meeting.presenterUserId,
    paper_title: meeting.paperTitle,
    paper_link: meeting.paperLink,
    ppt_uploaded: meeting.pptUploaded,
    ppt_link: meeting.pptLink,
    video_uploaded: meeting.videoUploaded,
    video_link: meeting.videoLink,
    notes: meeting.notes,
    questioners: questioners.map((q) => ({
      user_id: q.userId,
      name: q.name,
      source: q.source,
    })),
    url: `${PORTAL_URL}/meetings?year=${meeting.scheduledDate.slice(0, 4)}`,
  }
}

export function registerMeetingsTools(server: McpServer) {
  server.registerTool(
    "list_meetings",
    {
      title: "List lab meetings",
      description: `The lab-meeting schedule for one calendar year (/meetings), one row per week: date, presenter, paper, questioners, holiday flag, and the PPT / recording links when they exist. Every signed-in member sees every week, their own and everyone else's; none of it is admin-only. Read-only — claiming a week, swapping presenters and admin edits happen at ${PORTAL_URL}/meetings.`,
      inputSchema: z.object({
        year: z
          .number()
          .int()
          .min(2000)
          .max(2100)
          .optional()
          .describe(
            "Calendar year, as the page's year tabs use. Defaults to the year holding the next meeting, falling back to the last scheduled year."
          ),
        upcoming_only: z
          .boolean()
          .optional()
          .describe("Only weeks on or after today (Asia/Taipei)"),
      }),
    },
    async ({ year, upcoming_only }, ctx) => {
      try {
        const caller = requireCaller(ctx as ToolContext)
        const supabase = createUserClient(caller.token)
        const today = todayInTaipei()
        const wanted =
          year ??
          defaultScheduleYear(
            await fetchScheduleYearBounds(supabase, today),
            Number(today.slice(0, 4))
          )

        const [meetings, questioners] = await Promise.all([
          fetchMeetings(supabase, wanted),
          fetchQuestionersByYear(supabase, wanted),
        ])
        const rows = meetings
          .filter((m) => !upcoming_only || m.scheduledDate >= today)
          .map((m) => toMeetingRow(m, questioners.get(m.id) ?? []))

        return json({
          year: wanted,
          count: rows.length,
          meetings: rows,
          url: `${PORTAL_URL}/meetings?year=${wanted}`,
        })
      } catch (err) {
        return failure(err)
      }
    }
  )

  server.registerTool(
    "get_next_meeting",
    {
      title: "Get the next lab meeting",
      description: `The nearest upcoming lab meeting (today counts, holiday weeks are skipped): its date, presenter, paper, links and questioners. Every member gets the same answer — the schedule is visible to everyone and nothing here is admin-only. Read-only; next_meeting is null when no week is scheduled ahead, and changes are made at ${PORTAL_URL}/meetings.`,
      inputSchema: z.object({}),
    },
    async (_args, ctx) => {
      try {
        const caller = requireCaller(ctx as ToolContext)
        const supabase = createUserClient(caller.token)
        const today = todayInTaipei()
        const next = await fetchNextMeeting(supabase, today)

        if (!next) {
          return json({
            next_meeting: null,
            today,
            message:
              "No upcoming lab meeting is scheduled; the schedule ends before today.",
            url: `${PORTAL_URL}/meetings`,
          })
        }

        return json({
          today,
          next_meeting: toMeetingRow(next.meeting, next.questioners),
        })
      } catch (err) {
        return failure(err)
      }
    }
  )
}
