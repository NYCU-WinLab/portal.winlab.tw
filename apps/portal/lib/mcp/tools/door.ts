import type { McpServer } from "@modelcontextprotocol/server"
import { z } from "zod"

import { listDoorEvents, type DoorEvent } from "@/lib/door/audit"
import { listDoorCardRows } from "@/lib/door/card-store"
import { SYNC_STATE_LABELS, type DoorCardRow } from "@/lib/door/cards"
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
  ok: boolean | null
  error: string | null
  latency_ms: number | null
  geo_city: string | null
  source: string
  card_last_four: string | null
  device_event_code: string | null
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
    source: e.source,
    card_last_four: e.card_id?.slice(-4) ?? null,
    device_event_code: e.device_event_code,
  }))
}

export type DoorCardToolRow = {
  card_id: string
  holder_name: string
  holder_user_id: string | null
  note: string | null
  sync_state: string
  sync_state_label: string
  last_seen_at: string | null
}

// sync_state is the machine value the agent can reason about;
// sync_state_label is the Traditional Chinese the admin sees on the page, so a
// quoted answer matches the screen.
export function doorCardRows(cards: DoorCardRow[]): DoorCardToolRow[] {
  return cards.map((card) => ({
    card_id: card.card_id,
    holder_name: card.holder_name,
    holder_user_id: card.holder_user_id,
    note: card.note,
    sync_state: card.sync_state,
    sync_state_label: SYNC_STATE_LABELS[card.sync_state] ?? card.sync_state,
    last_seen_at: card.last_seen_at,
  }))
}

export function registerDoorTools(server: McpServer) {
  server.registerTool(
    "list_door_events",
    {
      title: "List door events",
      description:
        "The lab door log (/door/log), newest first: web unlock attempts and physical card presentations, distinguished by source. Card times use the uncorrected controller clock; ok means known access granted/denied, and null means an unclassified device code, not failure. A card identifies a credential, not proof that its holder entered. Web entries report relay acknowledgment, latency and city. Door admins and portal super admins only. Card numbers are limited to the last four digits. Opening the door is deliberately not a tool: members do that themselves at /door.",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(200).default(50),
      }),
    },
    async ({ limit }, ctx) => {
      try {
        const caller = requireCaller(ctx as ToolContext)
        const supabase = createUserClient(caller.token)
        const { data: isAdmin, error } = await supabase.rpc("is_door_admin")
        if (error) throw new Error(error.message)
        if (!isAdmin) {
          return failure(new Error("only door admins can read the door log"))
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

  server.registerTool(
    "list_door_cards",
    {
      title: "List door cards",
      description:
        "The access-control cards the lab has enrolled on the door controller (/door/admin): card number, holder name, the portal account it belongs to if any, a note, and whether the last comparison found the card on the controller. Door admins and portal super admins only — door_cards is invisible to every other member. Read only: adding, renaming and deleting a card writes to the physical controller, so those stay on the web page.",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(500).default(200),
      }),
    },
    async ({ limit }, ctx) => {
      try {
        const caller = requireCaller(ctx as ToolContext)
        const supabase = createUserClient(caller.token)
        const { data: isAdmin, error } = await supabase.rpc("is_door_admin")
        if (error) throw new Error(error.message)
        if (!isAdmin) {
          return failure(new Error("only door admins can read the card list"))
        }
        const rows = doorCardRows(await listDoorCardRows(supabase, limit))
        return json({
          count: rows.length,
          url: `${PORTAL_URL}/door/admin`,
          cards: rows,
        })
      } catch (err) {
        return failure(err)
      }
    }
  )
}
