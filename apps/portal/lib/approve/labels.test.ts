import { describe, expect, test } from "bun:test"

import {
  documentStatusLabel,
  fieldCategoryLabel,
  DOCUMENT_STATUS_LABEL,
  FIELD_CATEGORY_LABEL,
} from "@/lib/approve/labels"

describe("documentStatusLabel", () => {
  test("translates every known document status", () => {
    for (const [status, label] of Object.entries(DOCUMENT_STATUS_LABEL)) {
      expect(documentStatusLabel(status)).toBe(label)
    }
  })

  test("returns null for a status the app does not know", () => {
    expect(documentStatusLabel("archived")).toBeNull()
  })
})

describe("fieldCategoryLabel", () => {
  test("translates every known field category", () => {
    for (const [category, label] of Object.entries(FIELD_CATEGORY_LABEL)) {
      expect(fieldCategoryLabel(category)).toBe(label)
    }
  })

  test("returns null for an unknown category", () => {
    expect(fieldCategoryLabel("stamp")).toBeNull()
  })
})
