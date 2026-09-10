import { describe, expect, test } from "bun:test"

import { transformEgress, transformIngress } from "@/lib/reimburse/transformers"
import type { DatabaseEgress, DatabaseIngress } from "@/lib/reimburse/types"

function egressRow(overrides: Partial<DatabaseEgress> = {}): DatabaseEgress {
  return {
    id: "e-1",
    applicant_name: "Alice",
    item_name: "Cables",
    item_amount: 120,
    invoice_date: "2026-01-02",
    transfer_date: "2026-01-05",
    transfer_fee: 15,
    user_id: "u-1",
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  }
}

function ingressRow(overrides: Partial<DatabaseIngress> = {}): DatabaseIngress {
  return {
    id: "i-1",
    ingress_date: "2026-02-03",
    ingress_amount: 500,
    ingress_comment: "grant",
    user_id: "u-1",
    created_at: "2026-02-01T00:00:00Z",
    ...overrides,
  }
}

describe("transformEgress", () => {
  test("maps snake_case row to camelCase Reimbursement, dropping db-only fields", () => {
    expect(transformEgress(egressRow())).toEqual({
      id: "e-1",
      applicantName: "Alice",
      itemName: "Cables",
      itemAmount: 120,
      invoiceDate: "2026-01-02",
      transferDate: "2026-01-05",
      transferFee: 15,
    })
  })

  test("does not leak user_id / created_at into the app shape", () => {
    const result = transformEgress(egressRow())
    expect(result).not.toHaveProperty("user_id")
    expect(result).not.toHaveProperty("created_at")
  })

  test("coerces a string item_amount to a Number", () => {
    const result = transformEgress(
      egressRow({ item_amount: "250" as unknown as number })
    )
    expect(result.itemAmount).toBe(250)
    expect(typeof result.itemAmount).toBe("number")
  })

  test("null transfer_fee stays null (not coerced to 0)", () => {
    const result = transformEgress(egressRow({ transfer_fee: null }))
    expect(result.transferFee).toBeNull()
  })

  test("zero transfer_fee is kept as a Number, not flipped to null", () => {
    const result = transformEgress(egressRow({ transfer_fee: 0 }))
    expect(result.transferFee).toBe(0)
  })

  test("string transfer_fee is coerced to a Number", () => {
    const result = transformEgress(
      egressRow({ transfer_fee: "42" as unknown as number })
    )
    expect(result.transferFee).toBe(42)
    expect(typeof result.transferFee).toBe("number")
  })

  test("null transfer_date passes through as null", () => {
    const result = transformEgress(egressRow({ transfer_date: null }))
    expect(result.transferDate).toBeNull()
  })
})

describe("transformIngress", () => {
  test("maps snake_case row to camelCase Ingress, dropping db-only fields", () => {
    expect(transformIngress(ingressRow())).toEqual({
      id: "i-1",
      ingressDate: "2026-02-03",
      ingressAmount: 500,
      ingressComment: "grant",
    })
  })

  test("does not leak user_id / created_at into the app shape", () => {
    const result = transformIngress(ingressRow())
    expect(result).not.toHaveProperty("user_id")
    expect(result).not.toHaveProperty("created_at")
  })

  test("coerces a string ingress_amount to a Number", () => {
    const result = transformIngress(
      ingressRow({ ingress_amount: "999" as unknown as number })
    )
    expect(result.ingressAmount).toBe(999)
    expect(typeof result.ingressAmount).toBe("number")
  })

  test("null ingress_comment passes through as null", () => {
    const result = transformIngress(ingressRow({ ingress_comment: null }))
    expect(result.ingressComment).toBeNull()
  })
})
