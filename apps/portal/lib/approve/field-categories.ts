import {
  IconHome,
  IconId,
  IconMapPin,
  IconPhone,
  IconSignature,
  IconTextSize,
  type Icon,
} from "@tabler/icons-react"

import { FIELD_CATEGORY_LABEL } from "./labels"
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
    label: FIELD_CATEGORY_LABEL.signature,
    icon: IconSignature,
    predefined: true,
    defaultSize: { width: 0.2, height: 0.08 },
  },
  {
    id: "contact_address",
    label: FIELD_CATEGORY_LABEL.contact_address,
    icon: IconMapPin,
    predefined: true,
    defaultSize: { width: 0.3, height: 0.05 },
  },
  {
    id: "household_address",
    label: FIELD_CATEGORY_LABEL.household_address,
    icon: IconHome,
    predefined: true,
    defaultSize: { width: 0.3, height: 0.05 },
  },
  {
    id: "id_number",
    label: FIELD_CATEGORY_LABEL.id_number,
    icon: IconId,
    predefined: true,
    defaultSize: { width: 0.2, height: 0.05 },
  },
  {
    id: "phone",
    label: FIELD_CATEGORY_LABEL.phone,
    icon: IconPhone,
    predefined: true,
    defaultSize: { width: 0.2, height: 0.05 },
  },
  {
    id: "other",
    label: FIELD_CATEGORY_LABEL.other,
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
