import type { McpServer } from "@modelcontextprotocol/server"
import { z } from "zod"

import {
  failure,
  json,
  requireCaller,
  type ToolContext,
} from "@/lib/mcp/context"
import { createUserClient } from "@/lib/mcp/supabase"
import { fetchTripFiles, fetchTrips } from "@/lib/trip/fetch"
import type { Trip } from "@/lib/trip/types"

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// A trip can be named by id or by its display name (case-insensitive). Names
// are what members say ("KubeSummit"), ids are what list_trips returns.
function resolveTrip(trips: Trip[], ref: string): Trip {
  const wanted = ref.trim()
  if (UUID_RE.test(wanted)) {
    const byId = trips.find((t) => t.id === wanted)
    if (byId) return byId
    throw new Error(`no trip with id ${wanted}`)
  }
  const byName = trips.filter(
    (t) => t.name.toLowerCase() === wanted.toLowerCase()
  )
  if (byName.length === 1) return byName[0]!
  if (byName.length > 1) {
    throw new Error(
      `${byName.length} trips are named "${wanted}"; pass an id instead: ${byName.map((t) => t.id).join(", ")}`
    )
  }
  const partial = trips.filter((t) =>
    t.name.toLowerCase().includes(wanted.toLowerCase())
  )
  if (partial.length === 1) return partial[0]!
  throw new Error(
    partial.length === 0
      ? `no trip named "${wanted}"; call list_trips to see the names`
      : `"${wanted}" matches ${partial.length} trips: ${partial.map((t) => t.name).join(", ")}`
  )
}

export function registerTripTools(server: McpServer) {
  server.registerTool(
    "list_trips",
    {
      title: "List trips",
      description:
        "Travel-document folders (/trip). Every member sees every trip; an open trip accepts uploads, a closed one is read-only. file_count and uploader_count cover only the files the member may see (all of them for trip admins, their own otherwise). Use the returned id or name with list_trip_files.",
      inputSchema: z.object({
        status: z
          .enum(["open", "closed"])
          .optional()
          .describe("Only this status"),
      }),
    },
    async ({ status }, ctx) => {
      try {
        const caller = requireCaller(ctx as ToolContext)
        const supabase = createUserClient(caller.token)
        const trips = (await fetchTrips(supabase)).filter(
          (t) => !status || t.status === status
        )
        const { data: files, error } = await supabase
          .from("trip_files")
          .select("trip_id, user_id")
        if (error) throw new Error(error.message)
        const counts = new Map<string, { files: number; users: Set<string> }>()
        for (const f of (files ?? []) as {
          trip_id: string
          user_id: string | null
        }[]) {
          const c = counts.get(f.trip_id) ?? { files: 0, users: new Set() }
          c.files += 1
          if (f.user_id) c.users.add(f.user_id)
          counts.set(f.trip_id, c)
        }
        const rows = trips
          .sort((a, b) =>
            a.status === b.status
              ? b.created_at.localeCompare(a.created_at)
              : a.status === "open"
                ? -1
                : 1
          )
          .map((t) => ({
            id: t.id,
            name: t.name,
            description: t.description,
            status: t.status,
            created_at: t.created_at,
            closed_at: t.closed_at,
            file_count: counts.get(t.id)?.files ?? 0,
            uploader_count: counts.get(t.id)?.users.size ?? 0,
            url: `https://portal.winlab.tw/trip/${t.id}`,
          }))
        return json({ count: rows.length, trips: rows })
      } catch (err) {
        return failure(err)
      }
    }
  )

  server.registerTool(
    "list_trip_files",
    {
      title: "List trip files",
      description:
        "Files uploaded to one trip, newest first, each with its uploader, plus a by_uploader roll-up. Trip admins see every member's files; other members see only their own, so an empty list does not mean nobody uploaded. trip accepts the trip id or its name (case-insensitive, e.g. 'KubeSummit'). Files are stored as PDF; this returns metadata only, not contents.",
      inputSchema: z.object({
        trip: z.string().trim().min(1).describe("Trip id or name"),
      }),
    },
    async ({ trip: ref }, ctx) => {
      try {
        const caller = requireCaller(ctx as ToolContext)
        const supabase = createUserClient(caller.token)
        const trip = resolveTrip(await fetchTrips(supabase), ref)
        const files = await fetchTripFiles(supabase, trip.id)
        const byUploader = new Map<
          string,
          { user_id: string | null; name: string | null; files: number }
        >()
        for (const f of files) {
          const key = f.user_id ?? "unknown"
          const entry = byUploader.get(key) ?? {
            user_id: f.user_id,
            name: f.user?.name ?? null,
            files: 0,
          }
          entry.files += 1
          byUploader.set(key, entry)
        }
        return json({
          trip: {
            id: trip.id,
            name: trip.name,
            status: trip.status,
            url: `https://portal.winlab.tw/trip/${trip.id}`,
          },
          count: files.length,
          by_uploader: [...byUploader.values()],
          files: files.map((f) => ({
            id: f.id,
            filename: f.filename,
            description: f.description,
            size_bytes: f.size_bytes,
            uploader: f.user?.name ?? null,
            uploader_id: f.user_id,
            uploaded_at: f.created_at,
          })),
        })
      } catch (err) {
        return failure(err)
      }
    }
  )
}
