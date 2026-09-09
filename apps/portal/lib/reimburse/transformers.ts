import type {
  DatabaseEgress,
  DatabaseIngress,
  Ingress,
  Reimbursement,
} from "./types"

export function transformEgress(row: DatabaseEgress): Reimbursement {
  return {
    id: row.id,
    applicantName: row.applicant_name,
    itemName: row.item_name,
    itemAmount: Number(row.item_amount),
    invoiceDate: row.invoice_date,
    transferDate: row.transfer_date,
    transferFee: row.transfer_fee !== null ? Number(row.transfer_fee) : null,
  }
}

export function transformIngress(row: DatabaseIngress): Ingress {
  return {
    id: row.id,
    ingressDate: row.ingress_date,
    ingressAmount: Number(row.ingress_amount),
    ingressComment: row.ingress_comment,
  }
}
