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

export function registerTools(
  server: McpServer,
  hooks: { afterReceiptUpload?: (caller: Caller) => void } = {}
) {
  server.registerTool(
    "whoami",
    {
      title: "Who am I",
      description:
        "The signed-in portal member: id, email, display name and app roles.",
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
        "Receipts visible to the caller (own uploads, or everyone's for receipts admins). Newest first within each status; pending comes before approved and rejected.",
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
        "Upload a receipt for reimbursement. Accepts a PDF, JPEG or PNG as base64 (max 3 MB decoded); images are wrapped into a one-page PDF. The receipt starts in 審核中 (pending). deposit_account: post = 郵局, esun = 玉山.",
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
}
