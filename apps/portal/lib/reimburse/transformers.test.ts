import { describe, expect, test } from "bun:test"

import { transformEgress, transformIngress } from "@/lib/reimburse/transformers"
import type { DatabaseEgress, DatabaseIngress } from "@/lib/reimburse/types"

function egressRow(overrides: Partial<DatabaseEgress> = {}): DatabaseEgress {
  return {
    id: "e-1",
    applicant_name: "Alice",
    item_name: "Cables",
    item_amount: 120,
    item_comment: "spare HDMI",
    invoice_date: "2026-01-02",
    invoice_files: ["inv-a.pdf"],
    transfer_date: "2026-01-05",
    transfer_fee: 15,
    transfer_files: ["tr-a.pdf"],
    status: "approved",
    user_id: "u-1",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  }
}

function ingressRow(overrides: Partial<DatabaseIngress> = {}): DatabaseIngress {
  return {
    id: "i-1",
    ingress_date: "2026-02-03",
    ingress_amount: 500,
    ingress_comment: "grant",
    ingress_files: ["in-a.pdf"],
    user_id: "u-1",
    created_at: "2026-02-01T00:00:00Z",
    updated_at: "2026-02-01T00:00:00Z",
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
      itemComment: "spare HDMI",
      invoiceDate: "2026-01-02",
      invoiceFiles: ["inv-a.pdf"],
      transferDate: "2026-01-05",
      transferFee: 15,
      transferFiles: ["tr-a.pdf"],
      status: "approved",
    })
  })

  test("does not leak user_id / created_at / updated_at into the app shape", () => {
    const result = transformEgress(egressRow())
    expect(result).not.toHaveProperty("user_id")
    expect(result).not.toHaveProperty("created_at")
    expect(result).not.toHaveProperty("updated_at")
  })

  test("coerces a string item_amount to a Number", () => {
    const result = transformEgress(
      egressRow({ item_amount: "250" as unknown as number })
    )
    expect(result.itemAmount).toBe(250)
    expect(typeof result.itemAmount).toBe("number")
  })

  test("null invoice_files normalizes to an empty array", () => {
    const result = transformEgress(
      egressRow({ invoice_files: null as unknown as string[] })
    )
    expect(result.invoiceFiles).toEqual([])
  })

  test("undefined invoice_files normalizes to an empty array", () => {
    const result = transformEgress(
      egressRow({ invoice_files: undefined as unknown as string[] })
    )
    expect(result.invoiceFiles).toEqual([])
  })

  test("present invoice_files pass through untouched", () => {
    const result = transformEgress(
      egressRow({ invoice_files: ["a.pdf", "b.pdf"] })
    )
    expect(result.invoiceFiles).toEqual(["a.pdf", "b.pdf"])
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

  test("null transfer_files stays null", () => {
    const result = transformEgress(egressRow({ transfer_files: null }))
    expect(result.transferFiles).toBeNull()
  })

  test("empty transfer_files array normalizes to null", () => {
    const result = transformEgress(egressRow({ transfer_files: [] }))
    expect(result.transferFiles).toBeNull()
  })

  test("non-empty transfer_files pass through as an array", () => {
    const result = transformEgress(
      egressRow({ transfer_files: ["t1.pdf", "t2.pdf"] })
    )
    expect(result.transferFiles).toEqual(["t1.pdf", "t2.pdf"])
  })

  test("null item_comment and transfer_date pass through as null", () => {
    const result = transformEgress(
      egressRow({ item_comment: null, transfer_date: null })
    )
    expect(result.itemComment).toBeNull()
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
      ingressFiles: ["in-a.pdf"],
    })
  })

  test("does not leak user_id / created_at / updated_at into the app shape", () => {
    const result = transformIngress(ingressRow())
    expect(result).not.toHaveProperty("user_id")
    expect(result).not.toHaveProperty("created_at")
    expect(result).not.toHaveProperty("updated_at")
  })

  test("coerces a string ingress_amount to a Number", () => {
    const result = transformIngress(
      ingressRow({ ingress_amount: "999" as unknown as number })
    )
    expect(result.ingressAmount).toBe(999)
    expect(typeof result.ingressAmount).toBe("number")
  })

  test("null ingress_files normalizes to an empty array", () => {
    const result = transformIngress(
      ingressRow({ ingress_files: null as unknown as string[] })
    )
    expect(result.ingressFiles).toEqual([])
  })

  test("present ingress_files pass through untouched", () => {
    const result = transformIngress(
      ingressRow({ ingress_files: ["x.pdf", "y.pdf"] })
    )
    expect(result.ingressFiles).toEqual(["x.pdf", "y.pdf"])
  })

  test("null ingress_comment passes through as null", () => {
    const result = transformIngress(ingressRow({ ingress_comment: null }))
    expect(result.ingressComment).toBeNull()
  })
})
