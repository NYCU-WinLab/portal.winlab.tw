import { describe, expect, test } from "bun:test"

import type { ApproveField } from "@/lib/approve/types"
import { validateForSubmit } from "@/lib/approve/validation"

function field(overrides: Partial<ApproveField> = {}): ApproveField {
  return {
    id: "f-1",
    document_id: "doc-1",
    signer_id: "user-1",
    page: 0,
    x: 0,
    y: 0,
    width: 100,
    height: 50,
    category: "signature",
    label: null,
    value: null,
    signed_at: null,
    created_at: "2024-01-01T00:00:00Z",
    ...overrides,
  }
}

describe("validateForSubmit", () => {
  test("rejects an empty title", () => {
    expect(
      validateForSubmit({
        title: "  ",
        filePath: "x.pdf",
        fields: [field()],
      })
    ).toEqual({ ok: false, reason: "標題不可空白" })
  })

  test("rejects a missing file path", () => {
    expect(
      validateForSubmit({
        title: "Quarterly form",
        filePath: null,
        fields: [field()],
      })
    ).toEqual({ ok: false, reason: "還沒上傳 PDF" })
  })

  test("rejects an empty field list", () => {
    expect(
      validateForSubmit({
        title: "Quarterly form",
        filePath: "x.pdf",
        fields: [],
      })
    ).toEqual({ ok: false, reason: "至少要放一個方塊" })
  })

  test("rejects a field whose signer is null", () => {
    expect(
      validateForSubmit({
        title: "Quarterly form",
        filePath: "x.pdf",
        fields: [field({ signer_id: null })],
      })
    ).toEqual({ ok: false, reason: "有方塊還沒選 signer" })
  })

  test("accepts a fully populated input", () => {
    expect(
      validateForSubmit({
        title: "Quarterly form",
        filePath: "x.pdf",
        fields: [field()],
      })
    ).toEqual({ ok: true })
  })
})
