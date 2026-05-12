export type ReceiptStatus = "pending" | "approved" | "rejected"

// Display order: pending first (still needs eyes on it), then approved, then
// rejected. Same status falls back to newer-first by created_at.
export const STATUS_ORDER: Record<ReceiptStatus, number> = {
  pending: 0,
  approved: 1,
  rejected: 2,
}

export const STATUS_LABELS: Record<ReceiptStatus, string> = {
  pending: "審核中",
  approved: "審核完成",
  rejected: "已拒絕",
}

export type TagVariant = "default" | "secondary" | "outline"

export const TAG_VARIANTS: TagVariant[] = ["default", "secondary", "outline"]

export interface DatabaseTag {
  id: string
  name: string
  variant: TagVariant
  created_by: string | null
  created_at: string
}

export interface Tag {
  id: string
  name: string
  variant: TagVariant
}

export function toTag(row: DatabaseTag): Tag {
  return { id: row.id, name: row.name, variant: row.variant }
}

export interface DatabaseReceipt {
  id: string
  name: string
  image_path: string
  status: ReceiptStatus
  created_by: string | null
  created_at: string
  updated_at: string
}

// Shape returned when we embed tags via PostgREST:
//   select(*, receipt_tag_assignments(receipt_tags(*)))
export interface DatabaseReceiptWithTags extends DatabaseReceipt {
  receipt_tag_assignments: { receipt_tags: DatabaseTag | null }[] | null
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
  tags: Tag[]
}

export function toReceipt(row: DatabaseReceiptWithTags): Receipt {
  const tags = (row.receipt_tag_assignments ?? [])
    .map((a) => a.receipt_tags)
    .filter((t): t is DatabaseTag => t !== null)
    .map(toTag)
  return {
    id: row.id,
    name: row.name,
    imagePath: row.image_path,
    status: row.status,
    createdAt: row.created_at,
    tags,
  }
}

export const RECEIPTS_BUCKET = "receipts"
