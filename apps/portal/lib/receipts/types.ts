export type ReceiptStatus = "pending" | "approved" | "rejected"

export interface DatabaseReceipt {
  id: string
  name: string
  image_path: string
  status: ReceiptStatus
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface InsertReceipt {
  name: string
  image_path: string
  status?: ReceiptStatus
}

export interface UpdateReceipt {
  name?: string
  status?: ReceiptStatus
}

export interface Receipt {
  id: string
  name: string
  imagePath: string
  status: ReceiptStatus
  createdAt: string
}

export function toReceipt(row: DatabaseReceipt): Receipt {
  return {
    id: row.id,
    name: row.name,
    imagePath: row.image_path,
    status: row.status,
    createdAt: row.created_at,
  }
}

export const RECEIPTS_BUCKET = "receipts"
