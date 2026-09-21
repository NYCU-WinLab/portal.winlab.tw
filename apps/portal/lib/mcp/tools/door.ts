import type { McpServer } from "@modelcontextprotocol/server"
import { z } from "zod"

import { listDoorEvents, type DoorEvent } from "@/lib/door/audit"
import {
  failure,
  json,
  PORTAL_URL,
  requireCaller,
  type ToolContext,
} from "@/lib/mcp/context"
import { createUserClient } from "@/lib/mcp/supabase"

export type DoorEventRow = {
  created_at: string
  user_name: string
  user_email: string | null
  ok: boolean
  error: string | null
  latency_ms: number | null
  geo_city: string | null
}

// client_address stays out: the log is read by an agent that may quote it
// back into a chat, and the city is enough to spot "that press was not from
// the lab".
export function doorEventRows(events: DoorEvent[]): DoorEventRow[] {
  return events.map((e) => ({
    created_at: e.created_at,
    user_name: e.user_name,
    user_email: e.user_email,
    ok: e.ok,
    error: e.error,
    latency_ms: e.latency_ms,
    geo_city: e.geo_city,
  }))
}

export function registerDoorTools(server: McpServer) {
  server.registerTool(
    "list_door_events",
    {
      title: "List door events",
      description:
        "The lab door unlock log (/door/log), newest first: one row per press with who pressed it, whether the relay answered, how long it took and the city the request came from. Portal super admins only — door_events is invisible to every other member, so this tool says so instead of handing back a misleadingly empty log. Opening the door is deliberately not a tool: it is a physical action, and members do it themselves at /door.",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(200).default(50),
      }),
    },
    async ({ limit }, ctx) => {
      try {
        const caller = requireCaller(ctx as ToolContext)
        const supabase = createUserClient(caller.token)
        const { data: isAdmin, error } = await supabase.rpc("is_portal_admin")
        if (error) throw new Error(error.message)
        if (!isAdmin) {
          return failure(new Error("only portal admins can read the door log"))
        }
        const rows = doorEventRows(await listDoorEvents(supabase, limit))
        return json({
          count: rows.length,
          url: `${PORTAL_URL}/door/log`,
          events: rows,
        })
      } catch (err) {
        return failure(err)
      }
    }
  )
}
