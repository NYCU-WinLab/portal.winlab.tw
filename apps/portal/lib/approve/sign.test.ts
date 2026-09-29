import { describe, expect, test } from "bun:test"

import { planSignature } from "@/lib/approve/sign"
import type {
  ApproveField,
  ApproveUserFieldValue,
  FieldCategory,
  PredefinedCategory,
} from "@/lib/approve/types"

function field(id: string, category: FieldCategory): ApproveField {
  return {
    id,
    document_id: "doc",
    signer_id: "me",
    page: 1,
    x: 0,
    y: 0,
    width: 0.2,
    height: 0.05,
    category,
    label: null,
    value: null,
    signed_at: null,
    created_at: "2026-09-29T00:00:00Z",
  }
}

function saved(
  category: PredefinedCategory,
  value: string
): ApproveUserFieldValue {
  return {
    id: category,
    user_id: "me",
    category,
    value,
    updated_at: "2026-09-01T00:00:00Z",
  }
}

const SIGNATURE = "data:image/png;base64,iVBORw0KGgo="

describe("planSignature", () => {
  test("fills predefined fields from saved values and text from values", () => {
    const plan = planSignature(
      [field("s", "signature"), field("p", "phone"), field("o", "other")],
      [saved("signature", SIGNATURE), saved("phone", "0912345678")],
      { o: "同意" }
    )
    expect(plan.values).toEqual([
      { fieldId: "s", value: SIGNATURE },
      { fieldId: "p", value: "0912345678" },
      { fieldId: "o", value: "同意" },
    ])
    expect(plan.missing).toEqual([])
    expect(plan.fromSaved).toBe(2)
    expect(plan.provided).toBe(1)
  })

  test("a value replaces a saved address, id number or phone", () => {
    const plan = planSignature(
      [field("p", "phone")],
      [saved("phone", "0912345678")],
      { p: "0987654321" }
    )
    expect(plan.values).toEqual([{ fieldId: "p", value: "0987654321" }])
  })

  test("lists what is still empty instead of submitting it", () => {
    const plan = planSignature(
      [field("s", "signature"), field("o", "other")],
      [],
      {}
    )
    expect(plan.missing.map((f) => f.id)).toEqual(["s", "o"])
  })

  test("never takes a signature from the caller", () => {
    expect(() =>
      planSignature([field("s", "signature")], [], { s: SIGNATURE })
    ).toThrow(/saved signature/)
  })

  test("refuses a field that is not the member's", () => {
    expect(() => planSignature([field("o", "other")], [], { x: "hi" })).toThrow(
      /not one of this member's fields/
    )
  })
})
