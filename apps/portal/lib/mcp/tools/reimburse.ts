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
import { fetchEgress, fetchIngress } from "@/lib/reimburse/fetch"
import {
  computeReimburseBalance,
  filterLedgerRows,
  toLedgerRows,
} from "@/lib/reimburse/ledger"
import { transformEgress, transformIngress } from "@/lib/reimburse/transformers"

const ISO_DATE = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "expected a YYYY-MM-DD date")

export function registerReimburseTools(server: McpServer) {
  server.registerTool(
    "list_reimburse_entries",
    {
      title: "List reimburse entries",
      description:
        "The lab's cash-flow ledger (/reimburse), newest first, merging money out (egress, a negative amount plus its applicant and transfer fee) and money in (ingress). Every signed-in member sees the whole ledger, so this is never filtered by who is asking; adding or editing an entry is reimburse-admin work and stays on the web page. Dates are the invoice date for egress and the deposit date for ingress, amounts are TWD, and an egress row is 未轉帳 (pending) until it has a transfer_date.",
      inputSchema: z.object({
        kind: z
          .enum(["egress", "ingress", "all"])
          .default("all")
          .describe("Money out, money in, or both"),
        from: ISO_DATE.optional().describe("Earliest date, inclusive"),
        to: ISO_DATE.optional().describe("Latest date, inclusive"),
        status: z
          .enum(["pending", "transferred"])
          .optional()
          .describe("Egress only: whether the transfer has happened"),
        limit: z.number().int().min(1).max(200).default(50),
      }),
    },
    async ({ kind, from, to, status, limit }, ctx) => {
      try {
        const caller = requireCaller(ctx as ToolContext)
        const supabase = createUserClient(caller.token)
        const [egress, ingress] = await Promise.all([
          fetchEgress(supabase),
          fetchIngress(supabase),
        ])
        const rows = filterLedgerRows(
          toLedgerRows(
            egress.map(transformEgress),
            ingress.map(transformIngress)
          ),
          { kind, from, to, status }
        )
        const entries = rows.slice(0, limit)
        return json({
          count: entries.length,
          total_matching: rows.length,
          currency: "TWD",
          url: `${PORTAL_URL}/reimburse`,
          entries,
        })
      } catch (err) {
        return failure(err)
      }
    }
  )

  server.registerTool(
    "get_reimburse_balance",
    {
      title: "Get reimburse balance",
      description:
        "Totals for the lab's cash-flow ledger (/reimburse) in TWD: money in, money out, and the balance shown on the page. egress_total includes transfer fees on top of the item amounts, exactly as the badge on /reimburse computes it, and pending_amount is what is approved but not transferred yet, on the same fee-inclusive basis. The whole ledger is visible to every signed-in member, and only reimburse admins can change it, on the web.",
      inputSchema: z.object({}),
    },
    async (_args, ctx) => {
      try {
        const caller = requireCaller(ctx as ToolContext)
        const supabase = createUserClient(caller.token)
        const [egress, ingress] = await Promise.all([
          fetchEgress(supabase),
          fetchIngress(supabase),
        ])
        return json({
          currency: "TWD",
          transfer_fees_included_in_egress_total: true,
          url: `${PORTAL_URL}/reimburse`,
          ...computeReimburseBalance(
            egress.map(transformEgress),
            ingress.map(transformIngress)
          ),
        })
      } catch (err) {
        return failure(err)
      }
    }
  )
}
