import type { AuthInfo, McpServer } from "@modelcontextprotocol/server"
import { z } from "zod"

import {
  decodeBase64,
  MCP_RECEIPT_MIMES,
  toReceiptPdf,
} from "@/lib/mcp/receipt-file"
import { createUserClient } from "@/lib/mcp/supabase"
import { fetchReceipts } from "@/lib/receipts/fetch"
import {
  DEPOSIT_ACCOUNT_LABELS,
  DEPOSIT_ACCOUNTS,
  STATUS_LABELS,
  type ReceiptStatus,
} from "@/lib/receipts/types"
import { uploadReceiptPdf } from "@/lib/receipts/upload"
import { fetchTripFiles, fetchTrips } from "@/lib/trip/fetch"
import type { Trip } from "@/lib/trip/types"

export const MCP_SERVER_INFO = { name: "portal.winlab.tw", version: "0.1.0" }

type ToolContext = { http?: { authInfo?: AuthInfo } }

type Caller = {
  token: string
  userId: string
  email: string | null
  name: string | null
}

function requireCaller(ctx: ToolContext): Caller {
  const auth = ctx.http?.authInfo
  if (!auth?.token) throw new Error("Unauthorized")
  const extra = auth.extra ?? {}
  return {
    token: auth.token,
    userId: typeof extra.userId === "string" ? extra.userId : auth.clientId,
    email: typeof extra.email === "string" ? extra.email : null,
    name: typeof extra.name === "string" ? extra.name : null,
  }
}

function json(value: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
  }
}

function failure(err: unknown) {
  const message = err instanceof Error ? err.message : String(err)
  return { isError: true, content: [{ type: "text" as const, text: message }] }
}

const STATUSES = Object.keys(STATUS_LABELS) as ReceiptStatus[]

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

export function registerTools(
  server: McpServer,
  hooks: { afterReceiptUpload?: (caller: Caller) => void } = {}
) {
  server.registerTool(
    "whoami",
    {
      title: "Who am I",
      description:
        'The signed-in portal member: id, email, display name, is_admin (portal super admin) and roles, a map of app name to role list such as {"trip": ["admin"]}. Call this first to learn whether the member administers an app before reading other tools\' results: receipts and trip admins see everyone\'s rows, other members only their own.',
      inputSchema: z.object({}),
    },
    async (_args, ctx) => {
      try {
        const caller = requireCaller(ctx as ToolContext)
        const supabase = createUserClient(caller.token)
        const { data, error } = await supabase
          .from("user_profiles")
          .select("name, is_admin, roles")
          .eq("id", caller.userId)
          .maybeSingle()
        if (error) throw new Error(error.message)
        return json({
          id: caller.userId,
          email: caller.email,
          name: data?.name ?? caller.name,
          is_admin: data?.is_admin ?? false,
          roles: data?.roles ?? {},
        })
      } catch (err) {
        return failure(err)
      }
    }
  )

  server.registerTool(
    "list_receipts",
    {
      title: "List receipts",
      description:
        "Reimbursement receipts (/receipts) visible to the member: their own uploads, or everyone's for receipts admins. Ordered pending (審核中) first, then approved and rejected, newest first within each status. status filters on one of those three.",
      inputSchema: z.object({
        status: z.enum(STATUSES).optional().describe("Only this status"),
        limit: z.number().int().min(1).max(200).default(50),
      }),
    },
    async ({ status, limit }, ctx) => {
      try {
        const caller = requireCaller(ctx as ToolContext)
        const supabase = createUserClient(caller.token)
        const receipts = await fetchReceipts(supabase)
        const rows = receipts
          .filter((r) => !status || r.status === status)
          .slice(0, limit)
          .map((r) => ({
            id: r.id,
            name: r.name,
            status: r.status,
            status_label: STATUS_LABELS[r.status],
            deposit_account: r.depositAccount,
            deposit_account_label: r.depositAccount
              ? DEPOSIT_ACCOUNT_LABELS[r.depositAccount]
              : null,
            uploader: r.uploaderName,
            tags: r.tags.map((t) => t.name),
            created_at: r.createdAt,
          }))
        return json({ count: rows.length, receipts: rows })
      } catch (err) {
        return failure(err)
      }
    }
  )

  server.registerTool(
    "upload_receipt",
    {
      title: "Upload receipt",
      description:
        "Upload one receipt for reimbursement on behalf of the member. Accepts a PDF, JPEG or PNG as base64 (max 3 MB decoded, WebP not accepted); images are wrapped into a one-page PDF. The receipt starts in 審核中 (pending) and admins are notified. deposit_account: post = 郵局, esun = 玉山. Ask the member for name and deposit_account when they are not given; never invent them.",
      inputSchema: z.object({
        name: z
          .string()
          .trim()
          .min(1)
          .max(200)
          .describe("Display name, e.g. 'Amazon 鍵盤 1618' (item + amount)"),
        deposit_account: z.enum(DEPOSIT_ACCOUNTS),
        mime: z.enum(MCP_RECEIPT_MIMES),
        file_base64: z.string().min(1).describe("File contents, base64"),
      }),
    },
    async ({ name, deposit_account, mime, file_base64 }, ctx) => {
      try {
        const caller = requireCaller(ctx as ToolContext)
        const pdf = await toReceiptPdf(decodeBase64(file_base64), mime)
        const supabase = createUserClient(caller.token)
        const receipt = await uploadReceiptPdf(supabase, {
          name,
          depositAccount: deposit_account,
          pdf,
        })
        hooks.afterReceiptUpload?.(caller)
        return json({
          id: receipt.id,
          name: receipt.name,
          status: receipt.status,
          status_label: STATUS_LABELS[receipt.status],
          deposit_account: receipt.depositAccount,
          url: "https://portal.winlab.tw/receipts",
        })
      } catch (err) {
        return failure(err)
      }
    }
  )

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
