// Database row shapes (snake_case, mirrors public.reimburse_egress / reimburse_ingress).

export type EgressStatus = "pending" | "approved" | "rejected"

export interface DatabaseEgress {
  id: string
  applicant_name: string
  item_name: string
  item_amount: number
  item_comment: string | null
  invoice_date: string
  invoice_files: string[]
  transfer_date: string | null
  transfer_fee: number | null
  transfer_files: string[] | null
  status: EgressStatus
  user_id: string | null
  created_at: string
  updated_at: string
}

export interface DatabaseIngress {
  id: string
  ingress_date: string
  ingress_amount: number
  ingress_comment: string | null
  ingress_files: string[]
  user_id: string | null
  created_at: string
  updated_at: string
}

export interface InsertEgress {
  applicant_name: string
  item_name: string
  item_amount: number
  item_comment?: string | null
  invoice_date: string
  invoice_files?: string[]
  transfer_date?: string | null
  transfer_fee?: number | null
  transfer_files?: string[] | null
  status?: EgressStatus
  user_id?: string | null
}

export interface InsertIngress {
  ingress_date: string
  ingress_amount: number
  ingress_comment?: string | null
  ingress_files?: string[]
  user_id?: string | null
}

export interface UpdateEgress {
  applicant_name?: string
  item_name?: string
  item_amount?: number
  item_comment?: string | null
  invoice_date?: string
  invoice_files?: string[]
  transfer_date?: string | null
  transfer_fee?: number | null
  transfer_files?: string[] | null
  status?: EgressStatus
}

export interface UpdateIngress {
  ingress_date?: string
  ingress_amount?: number
  ingress_comment?: string | null
  ingress_files?: string[]
}

// Application shapes (camelCase, what UI consumes).

export interface Reimbursement {
  id: string
  applicantName: string
  itemName: string
  itemAmount: number
  itemComment: string | null
  invoiceDate: string
  invoiceFiles: string[]
  transferDate: string | null
  transferFee: number | null
  transferFiles: string[] | null
  status: EgressStatus
}

export interface Ingress {
  id: string
  ingressDate: string
  ingressAmount: number
  ingressComment: string | null
  ingressFiles: string[]
}

// Unified transaction for the merged egress + ingress view.

export type Transaction =
  | ({ type: "egress" } & Reimbursement)
  | ({ type: "ingress" } & Ingress)

export const REIMBURSE_BUCKETS = {
  invoices: "reimburse-invoices",
  signatures: "reimburse-signatures",
  advances: "reimburse-advances",
} as const
