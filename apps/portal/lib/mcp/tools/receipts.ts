import type { McpServer } from "@modelcontextprotocol/server"
import { z } from "zod"

import {
  failure,
  json,
  requireCaller,
  type Caller,
  type ToolContext,
} from "@/lib/mcp/context"
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
import { updateReceipt } from "@/lib/receipts/update"
import { uploadReceiptPdf } from "@/lib/receipts/upload"

const STATUSES = Object.keys(STATUS_LABELS) as ReceiptStatus[]

export type ReceiptHooks = { afterReceiptUpload?: (caller: Caller) => void }

export function registerReceiptsTools(
  server: McpServer,
  hooks: ReceiptHooks = {}
) {
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
    "rename_receipt",
    {
      title: "Rename receipt",
      description:
        "Change the display name of one receipt, the same edit as the web edit dialog; the stored file, status, deposit account and tags stay as they are. Take id from list_receipts. Receipts admins can rename any receipt; for anyone else the portal refuses and the tool returns an error. Confirm the old and new name with the member first.",
      inputSchema: z.object({
        id: z.uuid().describe("Receipt id from list_receipts"),
        name: z
          .string()
          .trim()
          .min(1)
          .max(200)
          .describe(
            "New display name, e.g. 'Amazon 鍵盤 1618' (item + amount)"
          ),
      }),
    },
    async ({ id, name }, ctx) => {
      try {
        const caller = requireCaller(ctx as ToolContext)
        const supabase = createUserClient(caller.token)
        const receipt = await updateReceipt(supabase, id, { name })
        return json({
          id: receipt.id,
          name: receipt.name,
          status: receipt.status,
          status_label: STATUS_LABELS[receipt.status],
          url: "https://portal.winlab.tw/receipts",
        })
      } catch (err) {
        return failure(err)
      }
    }
  )
}
