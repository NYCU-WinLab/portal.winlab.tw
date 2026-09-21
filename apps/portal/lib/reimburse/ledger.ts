import type { Ingress, Reimbursement } from "./types"

export type EgressStatus = "pending" | "transferred"

export const EGRESS_STATUS_LABEL: Record<EgressStatus, string> = {
  pending: "未轉帳",
  transferred: "已轉帳",
}

// The lab dropped the egress `status` column in #1129: a row is settled when
// it has a transfer_date, which is also what the table shows as 未轉帳.
export function egressStatus(row: Reimbursement): EgressStatus {
  return row.transferDate ? "transferred" : "pending"
}

export type LedgerRow = {
  kind: "egress" | "ingress"
  id: string
  date: string
  amount: number
  name: string | null
  status: EgressStatus | null
  status_label: string | null
  applicant: string | null
  transfer_date: string | null
  transfer_fee: number | null
}

// One list out of the two tables, newest first, exactly like the /reimburse
// table: an egress amount is negative and its transfer fee stays a separate
// number instead of being folded into it.
export function toLedgerRows(
  egress: Reimbursement[],
  ingress: Ingress[]
): LedgerRow[] {
  const rows: LedgerRow[] = [
    ...egress.map((row): LedgerRow => {
      const status = egressStatus(row)
      return {
        kind: "egress",
        id: row.id,
        date: row.invoiceDate,
        amount: -row.itemAmount,
        name: row.itemName,
        status,
        status_label: EGRESS_STATUS_LABEL[status],
        applicant: row.applicantName,
        transfer_date: row.transferDate,
        transfer_fee: row.transferFee,
      }
    }),
    ...ingress.map(
      (row): LedgerRow => ({
        kind: "ingress",
        id: row.id,
        date: row.ingressDate,
        amount: row.ingressAmount,
        name: row.ingressComment,
        status: null,
        status_label: null,
        applicant: null,
        transfer_date: null,
        transfer_fee: null,
      })
    ),
  ]
  return rows.sort((a, b) => b.date.localeCompare(a.date))
}

export type LedgerFilter = {
  kind?: "egress" | "ingress" | "all"
  from?: string
  to?: string
  status?: EgressStatus
}

export function filterLedgerRows(
  rows: LedgerRow[],
  filter: LedgerFilter
): LedgerRow[] {
  const { kind = "all", from, to, status } = filter
  return rows.filter((row) => {
    if (kind !== "all" && row.kind !== kind) return false
    if (from && row.date < from) return false
    if (to && row.date > to) return false
    if (status && row.status !== status) return false
    return true
  })
}

export type ReimburseBalance = {
  ingress_total: number
  egress_item_total: number
  egress_transfer_fee_total: number
  egress_total: number
  balance: number
  ingress_count: number
  egress_count: number
  egress_counts_by_status: Record<EgressStatus, number>
  pending_amount: number
  pending_count: number
}

// Matches the badge on /reimburse: egress costs the lab the item amount plus
// its transfer fee, so egress_total carries the fees and balance is
// ingress_total minus that.
export function computeReimburseBalance(
  egress: Reimbursement[],
  ingress: Ingress[]
): ReimburseBalance {
  const ingressTotal = ingress.reduce((sum, row) => sum + row.ingressAmount, 0)
  const itemTotal = egress.reduce((sum, row) => sum + row.itemAmount, 0)
  const feeTotal = egress.reduce((sum, row) => sum + (row.transferFee ?? 0), 0)
  const pending = egress.filter((row) => egressStatus(row) === "pending")
  const egressTotal = itemTotal + feeTotal

  return {
    ingress_total: ingressTotal,
    egress_item_total: itemTotal,
    egress_transfer_fee_total: feeTotal,
    egress_total: egressTotal,
    balance: ingressTotal - egressTotal,
    ingress_count: ingress.length,
    egress_count: egress.length,
    egress_counts_by_status: {
      transferred: egress.length - pending.length,
      pending: pending.length,
    },
    pending_amount: pending.reduce(
      (sum, row) => sum + row.itemAmount + (row.transferFee ?? 0),
      0
    ),
    pending_count: pending.length,
  }
}
