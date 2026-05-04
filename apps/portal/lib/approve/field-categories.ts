import {
  IconHome,
  IconId,
  IconMapPin,
  IconPhone,
  IconSignature,
  IconTextSize,
  type Icon,
} from "@tabler/icons-react"

import type { FieldCategory, PredefinedCategory } from "./types"

export type CategoryDef = {
  id: FieldCategory
  label: string
  icon: Icon
  predefined: boolean
  defaultSize: { width: number; height: number }
}

export const FIELD_CATEGORIES: readonly CategoryDef[] = [
  {
    id: "signature",
    label: "簽名",
    icon: IconSignature,
    predefined: true,
    defaultSize: { width: 0.2, height: 0.08 },
  },
  {
    id: "contact_address",
    label: "聯絡地址",
    icon: IconMapPin,
    predefined: true,
    defaultSize: { width: 0.3, height: 0.05 },
  },
  {
    id: "household_address",
    label: "戶籍地址",
    icon: IconHome,
    predefined: true,
    defaultSize: { width: 0.3, height: 0.05 },
  },
  {
    id: "id_number",
    label: "身分證",
    icon: IconId,
    predefined: true,
    defaultSize: { width: 0.2, height: 0.05 },
  },
  {
    id: "phone",
    label: "手機",
    icon: IconPhone,
    predefined: true,
    defaultSize: { width: 0.2, height: 0.05 },
  },
  {
    id: "other",
    label: "其他",
    icon: IconTextSize,
    predefined: false,
    defaultSize: { width: 0.3, height: 0.05 },
  },
] as const

export function getCategoryDef(id: FieldCategory): CategoryDef {
  const def = FIELD_CATEGORIES.find((c) => c.id === id)
  if (!def) throw new Error(`Unknown field category: ${id}`)
  return def
}

export function isPredefined(id: FieldCategory): id is PredefinedCategory {
  return id !== "other"
}
