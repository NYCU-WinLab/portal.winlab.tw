// Database row shapes (snake_case, mirrors public.reimburse_egress / reimburse_ingress).

export interface DatabaseEgress {
  id: string
  applicant_name: string
  item_name: string
  item_amount: number
  invoice_date: string
  transfer_date: string | null
  transfer_fee: number | null
  user_id: string | null
  created_at: string
}

export interface DatabaseIngress {
  id: string
  ingress_date: string
  ingress_amount: number
  ingress_comment: string | null
  user_id: string | null
  created_at: string
}

export interface InsertEgress {
  applicant_name: string
  item_name: string
  item_amount: number
  invoice_date: string
  transfer_date?: string | null
  transfer_fee?: number | null
  user_id?: string | null
}

export interface InsertIngress {
  ingress_date: string
  ingress_amount: number
  ingress_comment?: string | null
  user_id?: string | null
}

export interface UpdateEgress {
  applicant_name?: string
  item_name?: string
  item_amount?: number
  invoice_date?: string
  transfer_date?: string | null
  transfer_fee?: number | null
}

export interface UpdateIngress {
  ingress_date?: string
  ingress_amount?: number
  ingress_comment?: string | null
}

// Application shapes (camelCase, what UI consumes).

export interface Reimbursement {
  id: string
  applicantName: string
  itemName: string
  itemAmount: number
  invoiceDate: string
  transferDate: string | null
  transferFee: number | null
}

export interface Ingress {
  id: string
  ingressDate: string
  ingressAmount: number
  ingressComment: string | null
}

// Unified transaction for the merged egress + ingress view.

export type Transaction =
  | ({ type: "egress" } & Reimbursement)
  | ({ type: "ingress" } & Ingress)
