import type { DocumentStatus, FieldCategory } from "./types"

export const DOCUMENT_STATUS_LABEL: Record<DocumentStatus, string> = {
  draft: "草稿",
  pending: "送簽中",
  completed: "已完成",
  cancelled: "已取消",
}

export const FIELD_CATEGORY_LABEL: Record<FieldCategory, string> = {
  signature: "簽名",
  contact_address: "聯絡地址",
  household_address: "戶籍地址",
  id_number: "身分證",
  phone: "手機",
  other: "其他",
}

export function documentStatusLabel(status: string): string | null {
  return DOCUMENT_STATUS_LABEL[status as DocumentStatus] ?? null
}

export function fieldCategoryLabel(category: string): string | null {
  return FIELD_CATEGORY_LABEL[category as FieldCategory] ?? null
}
