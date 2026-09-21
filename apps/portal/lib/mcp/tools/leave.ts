import type { McpServer } from "@modelcontextprotocol/server"
import { z } from "zod"

import {
  formatLeaveDate,
  isMondayIsoDate,
  taipeiToday,
  upcomingLeaveMondays,
} from "@/lib/leave/date"
import { fetchLeaves } from "@/lib/leave/fetch"
import {
  createLeave,
  deleteLeaveOnDate,
  LeaveError,
} from "@/lib/leave/mutations"
import type { LeaveWithUser } from "@/lib/leave/types"
import {
  failure,
  json,
  PORTAL_URL,
  requireCaller,
  type ToolContext,
} from "@/lib/mcp/context"
import { createUserClient } from "@/lib/mcp/supabase"

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export interface LeaveRange {
  from: string
  to: string | null
}

// Asking about leave nearly always means "who is away at the next meetings",
// so an unbounded call starts at today in Taipei and runs forward.
export function leaveRange(
  args: { from?: string; to?: string },
  today: string
): LeaveRange {
  return { from: args.from ?? today, to: args.to ?? null }
}

export interface LeaveDateGroup {
  date: string
  date_label: string
  count: number
  people: Array<{
    user_id: string
    name: string | null
    reason: string
    created_at: string
  }>
}

// Meeting dates in calendar order (fetchLeaves hands them back newest first),
// each with everyone signed up as away that Monday.
export function groupLeavesByDate(
  leaves: LeaveWithUser[],
  range: LeaveRange
): LeaveDateGroup[] {
  const groups = new Map<string, LeaveDateGroup>()
  for (const leave of leaves) {
    if (leave.date < range.from) continue
    if (range.to && leave.date > range.to) continue
    const group = groups.get(leave.date) ?? {
      date: leave.date,
      date_label: formatLeaveDate(leave.date),
      count: 0,
      people: [],
    }
    group.count += 1
    group.people.push({
      user_id: leave.user_id,
      name: leave.user?.name ?? null,
      reason: leave.reason,
      created_at: leave.created_at,
    })
    groups.set(leave.date, group)
  }
  return [...groups.values()].sort((a, b) => a.date.localeCompare(b.date))
}

const dateInput = z.string().trim().regex(ISO_DATE, "date must be YYYY-MM-DD")

export function registerLeaveTools(server: McpServer) {
  server.registerTool(
    "list_leaves",
    {
      title: "List leaves",
      description:
        "Who has signed up as absent from the Monday lab meetings (/leave), grouped by meeting date with each person's name and reason. Every member sees every sign-up, so this is the whole lab's list, not just the caller's. Without from/to it covers today in Taipei onwards, which is the upcoming meetings; both bounds are inclusive YYYY-MM-DD dates.",
      inputSchema: z.object({
        from: dateInput
          .optional()
          .describe("Earliest meeting date, defaults to today in Taipei"),
        to: dateInput
          .optional()
          .describe("Latest meeting date, defaults to no upper bound"),
      }),
    },
    async ({ from, to }, ctx) => {
      try {
        const caller = requireCaller(ctx as ToolContext)
        const supabase = createUserClient(caller.token)
        const range = leaveRange({ from, to }, taipeiToday())
        const dates = groupLeavesByDate(await fetchLeaves(supabase), range)
        return json({
          from: range.from,
          to: range.to,
          date_count: dates.length,
          leave_count: dates.reduce((sum, date) => sum + date.count, 0),
          dates,
          url: `${PORTAL_URL}/leave`,
        })
      } catch (err) {
        return failure(err)
      }
    }
  )

  server.registerTool(
    "create_leave",
    {
      title: "Create leave",
      description:
        "Signs the signed-in member up as absent from one Monday lab meeting (/leave). The date must be one of the next 8 Mondays (today counts), the same choices the web form offers, and a member can have only one sign-up per Monday. The reason is visible to the whole lab, and a member can only sign up themselves, so confirm the exact date and the wording of the reason with them before calling.",
      inputSchema: z.object({
        date: dateInput.describe("Meeting date, a Monday, YYYY-MM-DD"),
        reason: z
          .string()
          .trim()
          .min(1)
          .max(200)
          .describe("Why they are away, shown to everyone"),
      }),
    },
    async ({ date, reason }, ctx) => {
      try {
        const caller = requireCaller(ctx as ToolContext)
        if (!isMondayIsoDate(date)) {
          throw new Error(
            `${date} is not a Monday; lab meetings are on Mondays and /leave only accepts Mondays`
          )
        }
        const allowed = upcomingLeaveMondays()
        if (!allowed.includes(date)) {
          throw new Error(
            `${date} is outside the sign-up window; /leave accepts the next ${allowed.length} Mondays: ${allowed[0]} to ${allowed.at(-1)}`
          )
        }
        const supabase = createUserClient(caller.token)
        const leave = await createLeave(supabase, {
          user_id: caller.userId,
          date,
          reason,
        })
        return json({
          id: leave.id,
          date: leave.date,
          date_label: formatLeaveDate(leave.date),
          reason: leave.reason,
          user_id: leave.user_id,
          created_at: leave.created_at,
          url: `${PORTAL_URL}/leave`,
        })
      } catch (err) {
        if (err instanceof LeaveError) {
          return failure(
            new Error(
              err.code === "duplicate"
                ? `${date} already has a leave from this member; delete it first to change the reason (${err.message})`
                : `${date} is not a Monday, which is the only day /leave accepts (${err.message})`,
              { cause: err }
            )
          )
        }
        return failure(err)
      }
    }
  )

  server.registerTool(
    "delete_leave",
    {
      title: "Delete leave",
      description:
        "Withdraws the signed-in member's own sign-up for one Monday meeting (/leave), which puts them back on the attending list. A member can delete only their own row, so another member's absence cannot be removed here; the call fails when they have no sign-up on that date.",
      inputSchema: z.object({
        date: dateInput.describe("Meeting date to withdraw, YYYY-MM-DD"),
      }),
    },
    async ({ date }, ctx) => {
      try {
        const caller = requireCaller(ctx as ToolContext)
        const supabase = createUserClient(caller.token)
        const deleted = await deleteLeaveOnDate(supabase, caller.userId, date)
        if (deleted === 0) {
          throw new Error(
            `nothing was deleted: this member has no leave on ${date}; call list_leaves to see their sign-ups`
          )
        }
        return json({
          removed: true,
          date,
          date_label: formatLeaveDate(date),
          url: `${PORTAL_URL}/leave`,
        })
      } catch (err) {
        return failure(err)
      }
    }
  )
}
