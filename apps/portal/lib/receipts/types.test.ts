import { describe, expect, test } from "bun:test"

import {
  DEPOSIT_ACCOUNT_LABELS,
  DEPOSIT_ACCOUNTS,
  toReceipt,
  type DatabaseReceiptWithTags,
} from "@/lib/receipts/types"

function baseRow(
  overrides: Partial<DatabaseReceiptWithTags> = {}
): DatabaseReceiptWithTags {
  return {
    id: "r1",
    name: "Amazon 鍵盤",
    image_path: "r1/r1.pdf",
    status: "pending",
    deposit_account: null,
    created_by: "u1",
    created_at: "2026-07-18T00:00:00Z",
    updated_at: "2026-07-18T00:00:00Z",
    receipt_tag_assignments: null,
    uploader: null,
    ...overrides,
  }
}

describe("DEPOSIT_ACCOUNTS / DEPOSIT_ACCOUNT_LABELS", () => {
  test("every account has a Chinese label", () => {
    for (const account of DEPOSIT_ACCOUNTS) {
      expect(DEPOSIT_ACCOUNT_LABELS[account]).toBeTruthy()
    }
  })

  test("labels are 郵局 / 玉山", () => {
    expect(DEPOSIT_ACCOUNT_LABELS.post).toBe("郵局")
    expect(DEPOSIT_ACCOUNT_LABELS.esun).toBe("玉山")
  })
})

describe("toReceipt", () => {
  test("maps deposit_account through as depositAccount", () => {
    const receipt = toReceipt(baseRow({ deposit_account: "esun" }))
    expect(receipt.depositAccount).toBe("esun")
  })

  test("keeps depositAccount null for legacy rows", () => {
    const receipt = toReceipt(baseRow({ deposit_account: null }))
    expect(receipt.depositAccount).toBeNull()
  })

  test("pulls the uploader's name out of the embedded profile", () => {
    const receipt = toReceipt(baseRow({ uploader: { name: "詹詠翔" } }))
    expect(receipt.uploaderName).toBe("詹詠翔")
  })

  test("falls back to null when the profile is missing or unnamed", () => {
    expect(toReceipt(baseRow({ uploader: null })).uploaderName).toBeNull()
    expect(
      toReceipt(baseRow({ uploader: { name: null } })).uploaderName
    ).toBeNull()
  })
})
