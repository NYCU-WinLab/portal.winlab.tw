import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { SupabaseClient } from "@supabase/supabase-js"
import { z } from "zod"

function ok(data: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ success: true, data }),
      },
    ],
  }
}

function err(message: string) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ success: false, error: message }),
      },
    ],
    isError: true,
  }
}

export function registerLeaveTools(
  server: McpServer,
  supabase: SupabaseClient,
  userId: string
) {
  server.tool(
    "leave_list_recent",
    "List recent Monday-meeting leave records across everyone, newest first. Optional from/to YYYY-MM-DD filters on the leave date.",
    {
      from: z.string().optional().describe("YYYY-MM-DD inclusive lower bound."),
      to: z.string().optional().describe("YYYY-MM-DD inclusive upper bound."),
      limit: z.number().int().min(1).max(200).optional(),
    },
    async ({ from, to, limit }) => {
      let query = supabase
        .from("leaves")
        .select("id, user_id, date, reason, created_at")
        .order("date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(limit ?? 50)
      if (from) query = query.gte("date", from)
      if (to) query = query.lte("date", to)

      const { data, error } = await query
      if (error) return err(error.message)

      const rows = data ?? []
      if (rows.length === 0) return ok([])

      const userIds = [...new Set(rows.map((l) => l.user_id as string))]
      const { data: profiles } = await supabase
        .from("user_profiles")
        .select("id, name")
        .in("id", userIds)
      const byId = new Map(
        (profiles ?? []).map((p: { id: string; name: string | null }) => [
          p.id,
          p.name,
        ])
      )

      return ok(
        rows.map((l) => ({
          ...l,
          user_name: byId.get(l.user_id as string) ?? null,
        }))
      )
    }
  )

  server.tool(
    "leave_list_mine",
    "List the caller's own leave records (Monday meetings they've opted out of).",
    {},
    async () => {
      const { data, error } = await supabase
        .from("leaves")
        .select("id, date, reason, created_at")
        .eq("user_id", userId)
        .order("date", { ascending: false })
      if (error) return err(error.message)
      return ok(data ?? [])
    }
  )

  server.tool(
    "leave_request",
    "File a leave for a Monday meeting. date must be a Monday (DB enforces). Duplicate (you, date) is rejected.",
    {
      date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD")
        .describe("Monday being skipped, YYYY-MM-DD."),
      reason: z.string().min(1),
    },
    async ({ date, reason }) => {
      const { data, error } = await supabase
        .from("leaves")
        .insert({ user_id: userId, date, reason })
        .select()
        .single()
      if (error) {
        if (error.code === "23505")
          return err("You already filed leave for that date.")
        if (error.code === "23514") return err("Leave dates must be Mondays.")
        return err(error.message)
      }
      return ok(data)
    }
  )

  server.tool(
    "leave_cancel_mine",
    "Cancel one of your own leave records. Cannot cancel other people's leaves.",
    { leave_id: z.string().uuid() },
    async ({ leave_id }) => {
      const { error } = await supabase
        .from("leaves")
        .delete()
        .eq("id", leave_id)
        .eq("user_id", userId)
      if (error) return err(error.message)
      return ok({ cancelled: leave_id })
    }
  )
}
