import type { McpServer } from "@modelcontextprotocol/server"
import { z } from "zod"

import {
  failure,
  json,
  PORTAL_URL,
  requireAdmin,
  requireCaller,
  type ToolContext,
} from "@/lib/mcp/context"
import { createUserClient } from "@/lib/mcp/supabase"
import {
  fetchApplicantNames,
  fetchEgress,
  fetchEgressById,
  fetchIngress,
} from "@/lib/reimburse/fetch"
import {
  computeReimburseBalance,
  filterLedgerRows,
  toLedgerRows,
  type LedgerRow,
} from "@/lib/reimburse/ledger"
import {
  insertEgress,
  insertIngress,
  patchEgress,
  patchIngress,
  removeEgress,
} from "@/lib/reimburse/mutations"
import { transformEgress, transformIngress } from "@/lib/reimburse/transformers"
import type {
  DatabaseEgress,
  DatabaseIngress,
  UpdateEgress,
  UpdateIngress,
} from "@/lib/reimburse/types"

const ISO_DATE = z.iso.date()

// The /reimburse dialogs take amounts in steps of 0.01, so a tool must not
// store a figure the table would round and an edit dialog would refuse.
export const AMOUNT = z.number().finite().nonnegative().multipleOf(0.01)

// multipleOf tolerates float noise such as 0.1 + 0.2, so a computed amount is
// rounded to the cent before it is stored.
export function cents(amount: number): number {
  return Math.round(amount * 100) / 100
}

const REIMBURSE_URL = `${PORTAL_URL}/reimburse`

// The applicant picker on /reimburse only offers members by their portal
// name, so a new applicant has to be one of those. Case and surrounding
// space are forgiven; the stored spelling is what gets written.
export function matchApplicant(members: string[], input: string): string {
  const names = [...new Set(members)]
  const wanted = input.trim()
  if (names.includes(wanted)) return wanted
  const folded = wanted.toLowerCase()
  const loose = names.filter((name) => name.trim().toLowerCase() === folded)
  const [only] = loose
  if (loose.length === 1 && only) return only
  const close = names
    .filter((name) => {
      const n = name.toLowerCase()
      return n.includes(folded) || folded.includes(n)
    })
    .slice(0, 5)
  throw new Error(
    close.length > 0
      ? `"${wanted}" is not a member's portal name; did you mean ${close.join(", ")}?`
      : `"${wanted}" is not a member's portal name, and the /reimburse applicant picker only lists members`
  )
}

export type EgressChanges = {
  applicant_name?: string
  item_name?: string
  item_amount?: number
  invoice_date?: string
  transfer_date?: string | null
  transfer_fee?: number | null
}

// Only the fields the caller passed. null is kept, since it is how a
// transfer date or fee is cleared.
export function egressUpdates(changes: EgressChanges): UpdateEgress {
  const updates: UpdateEgress = {}
  if (changes.applicant_name !== undefined)
    updates.applicant_name = changes.applicant_name
  if (changes.item_name !== undefined) updates.item_name = changes.item_name
  if (changes.item_amount !== undefined)
    updates.item_amount = cents(changes.item_amount)
  if (changes.invoice_date !== undefined)
    updates.invoice_date = changes.invoice_date
  if (changes.transfer_date !== undefined)
    updates.transfer_date = changes.transfer_date
  if (changes.transfer_fee !== undefined)
    updates.transfer_fee =
      changes.transfer_fee === null ? null : cents(changes.transfer_fee)
  if (Object.keys(updates).length === 0) {
    throw new Error("nothing to change: pass at least one field")
  }
  return updates
}

export type IngressChanges = {
  ingress_date?: string
  ingress_amount?: number
  ingress_comment?: string | null
}

export function ingressUpdates(changes: IngressChanges): UpdateIngress {
  const updates: UpdateIngress = {}
  if (changes.ingress_date !== undefined)
    updates.ingress_date = changes.ingress_date
  if (changes.ingress_amount !== undefined)
    updates.ingress_amount = cents(changes.ingress_amount)
  if (changes.ingress_comment !== undefined)
    updates.ingress_comment = changes.ingress_comment || null
  if (Object.keys(updates).length === 0) {
    throw new Error("nothing to change: pass at least one field")
  }
  return updates
}

// The same row shape list_reimburse_entries returns.
function egressEntry(row: DatabaseEgress): LedgerRow | undefined {
  return toLedgerRows([transformEgress(row)], [])[0]
}

function ingressEntry(row: DatabaseIngress): LedgerRow | undefined {
  return toLedgerRows([], [transformIngress(row)])[0]
}

const ADMIN_ONLY =
  "Reimburse admins only; for anyone else the tool fails. The whole lab sees the ledger, so read the entry back to the member and get their yes before calling; never guess an amount, a date or a name."

export function registerReimburseTools(server: McpServer) {
  server.registerTool(
    "list_reimburse_entries",
    {
      title: "List reimburse entries",
      description:
        "The lab's cash-flow ledger (/reimburse), newest first, merging money out (egress, a negative amount plus its applicant and transfer fee) and money in (ingress). Every signed-in member sees the whole ledger, so this is never filtered by who is asking; adding or editing an entry is reimburse-admin work (add_reimburse_egress, update_reimburse_egress, delete_reimburse_egress, add_reimburse_ingress, update_reimburse_ingress). Dates are the invoice date for egress and the deposit date for ingress, amounts are TWD, and an egress row is 未轉帳 (pending) until it has a transfer_date.",
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
        "Totals for the lab's cash-flow ledger (/reimburse) in TWD: money in, money out, and the balance shown on the page. egress_total includes transfer fees on top of the item amounts, exactly as the badge on /reimburse computes it, and pending_amount is what is approved but not transferred yet, on the same fee-inclusive basis. The whole ledger is visible to every signed-in member, and only reimburse admins can change it.",
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

  server.registerTool(
    "add_reimburse_egress",
    {
      title: "Add reimburse egress",
      description: `Adds a money-out entry (支出) to the lab's cash-flow ledger (/reimburse), the 新增支出 dialog: who is being reimbursed, what was bought, the amount in TWD and the invoice date. The entry is 未轉帳 (pending) until it has a transfer_date; pass transfer_date, with any bank transfer_fee, only once the money has gone out. applicant_name must be a member's name exactly as the portal shows it, as in the web picker. ${ADMIN_ONLY}`,
      inputSchema: z.object({
        applicant_name: z
          .string()
          .trim()
          .min(1)
          .describe("Member being reimbursed, by portal name"),
        item_name: z
          .string()
          .trim()
          .min(1)
          .max(200)
          .describe("What was bought"),
        item_amount: AMOUNT.describe("Amount in TWD"),
        invoice_date: ISO_DATE.describe("Invoice date"),
        transfer_date: ISO_DATE.optional().describe(
          "When the reimbursement was paid out; omit while pending"
        ),
        transfer_fee: AMOUNT.optional().describe("Bank transfer fee in TWD"),
      }),
    },
    async (args, ctx) => {
      try {
        const caller = requireCaller(ctx as ToolContext)
        const supabase = createUserClient(caller.token)
        await requireAdmin(supabase, "is_reimburse_admin", "add ledger entries")
        const applicant = matchApplicant(
          await fetchApplicantNames(supabase),
          args.applicant_name
        )
        const row = await insertEgress(supabase, {
          applicant_name: applicant,
          item_name: args.item_name,
          item_amount: cents(args.item_amount),
          invoice_date: args.invoice_date,
          transfer_date: args.transfer_date ?? null,
          transfer_fee:
            args.transfer_fee === undefined ? null : cents(args.transfer_fee),
          user_id: caller.userId,
        })
        return json({ entry: egressEntry(row), url: REIMBURSE_URL })
      } catch (err) {
        return failure(err)
      }
    }
  )

  server.registerTool(
    "update_reimburse_egress",
    {
      title: "Update reimburse egress",
      description: `Changes a money-out entry (支出) on /reimburse, the edit dialog on its row. Pass only the fields to change. The usual edit is marking it paid: transfer_date (and transfer_fee if the bank charged one); transfer_date null puts it back to 未轉帳. A new applicant_name must be a member's portal name; an old entry keeps whatever name it has unless you change it. Get the id from list_reimburse_entries. ${ADMIN_ONLY}`,
      inputSchema: z.object({
        entry_id: z.uuid().describe("Egress id from list_reimburse_entries"),
        applicant_name: z.string().trim().min(1).optional(),
        item_name: z.string().trim().min(1).max(200).optional(),
        item_amount: AMOUNT.optional().describe("Amount in TWD"),
        invoice_date: ISO_DATE.optional(),
        transfer_date: ISO_DATE.nullable()
          .optional()
          .describe("Paid-out date; null marks it pending again"),
        transfer_fee: AMOUNT.nullable()
          .optional()
          .describe("Bank transfer fee in TWD; null clears it"),
      }),
    },
    async ({ entry_id, ...changes }, ctx) => {
      try {
        const caller = requireCaller(ctx as ToolContext)
        const updates = egressUpdates(changes)
        const supabase = createUserClient(caller.token)
        await requireAdmin(
          supabase,
          "is_reimburse_admin",
          "edit ledger entries"
        )
        const current = await fetchEgressById(supabase, entry_id)
        if (!current) {
          throw new Error(
            `no egress entry with id ${entry_id}; call list_reimburse_entries for the current ids`
          )
        }
        if (updates.applicant_name !== undefined) {
          // Resending the stored name, even one from before the picker, is
          // not a change; anything else must be a member's portal name.
          updates.applicant_name =
            updates.applicant_name === current.applicant_name.trim()
              ? current.applicant_name
              : matchApplicant(
                  await fetchApplicantNames(supabase),
                  updates.applicant_name
                )
        }
        const row = await patchEgress(supabase, entry_id, updates)
        if (!row) throw new Error(`egress entry ${entry_id} was not updated`)
        return json({ entry: egressEntry(row), url: REIMBURSE_URL })
      } catch (err) {
        return failure(err)
      }
    }
  )

  server.registerTool(
    "delete_reimburse_egress",
    {
      title: "Delete reimburse egress",
      description: `Deletes one money-out entry (支出) from /reimburse for good, the delete button on its row; there is no undo, and the balance changes at once. Money-in entries have no delete, as on the web. Read the entry back (list_reimburse_entries) and confirm it with the member first. Reimburse admins only; for anyone else the tool fails.`,
      inputSchema: z.object({
        entry_id: z.uuid().describe("Egress id from list_reimburse_entries"),
      }),
    },
    async ({ entry_id }, ctx) => {
      try {
        const caller = requireCaller(ctx as ToolContext)
        const supabase = createUserClient(caller.token)
        await requireAdmin(
          supabase,
          "is_reimburse_admin",
          "delete ledger entries"
        )
        const row = await removeEgress(supabase, entry_id)
        if (!row) {
          throw new Error(
            `no egress entry with id ${entry_id}; call list_reimburse_entries for the current ids`
          )
        }
        return json({
          removed: true,
          entry: egressEntry(row),
          url: REIMBURSE_URL,
        })
      } catch (err) {
        return failure(err)
      }
    }
  )

  server.registerTool(
    "add_reimburse_ingress",
    {
      title: "Add reimburse ingress",
      description: `Adds a money-in entry (收入) to the lab's cash-flow ledger (/reimburse), the 新增收入 dialog: the deposit date, the amount in TWD and an optional note such as where the money came from. ${ADMIN_ONLY}`,
      inputSchema: z.object({
        ingress_date: ISO_DATE.describe("Date the money came in"),
        ingress_amount: AMOUNT.describe("Amount in TWD"),
        ingress_comment: z
          .string()
          .trim()
          .max(200)
          .optional()
          .describe("Note shown in the ledger"),
      }),
    },
    async (args, ctx) => {
      try {
        const caller = requireCaller(ctx as ToolContext)
        const supabase = createUserClient(caller.token)
        await requireAdmin(supabase, "is_reimburse_admin", "add ledger entries")
        const row = await insertIngress(supabase, {
          ingress_date: args.ingress_date,
          ingress_amount: cents(args.ingress_amount),
          ingress_comment: args.ingress_comment || null,
          user_id: caller.userId,
        })
        return json({ entry: ingressEntry(row), url: REIMBURSE_URL })
      } catch (err) {
        return failure(err)
      }
    }
  )

  server.registerTool(
    "update_reimburse_ingress",
    {
      title: "Update reimburse ingress",
      description: `Changes a money-in entry (收入) on /reimburse, the edit dialog on its row. Pass only the fields to change; ingress_comment null clears the note. Get the id from list_reimburse_entries. ${ADMIN_ONLY}`,
      inputSchema: z.object({
        entry_id: z.uuid().describe("Ingress id from list_reimburse_entries"),
        ingress_date: ISO_DATE.optional(),
        ingress_amount: AMOUNT.optional().describe("Amount in TWD"),
        ingress_comment: z
          .string()
          .trim()
          .max(200)
          .nullable()
          .optional()
          .describe("Note shown in the ledger; null clears it"),
      }),
    },
    async ({ entry_id, ...changes }, ctx) => {
      try {
        const caller = requireCaller(ctx as ToolContext)
        const updates = ingressUpdates(changes)
        const supabase = createUserClient(caller.token)
        await requireAdmin(
          supabase,
          "is_reimburse_admin",
          "edit ledger entries"
        )
        const row = await patchIngress(supabase, entry_id, updates)
        if (!row) {
          throw new Error(
            `no ingress entry with id ${entry_id}; call list_reimburse_entries for the current ids`
          )
        }
        return json({ entry: ingressEntry(row), url: REIMBURSE_URL })
      } catch (err) {
        return failure(err)
      }
    }
  )
}
