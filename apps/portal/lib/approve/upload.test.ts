import { describe, expect, test } from "bun:test"

import { validatePdfFile } from "@/lib/approve/upload"

describe("validatePdfFile", () => {
  test("rejects a non-PDF MIME type", () => {
    expect(validatePdfFile({ type: "image/png", size: 123 })).toEqual({
      ok: false,
      error: "只收 PDF",
    })
  })

  test("rejects a PDF over the 50MB cap", () => {
    expect(
      validatePdfFile({
        type: "application/pdf",
        size: 50 * 1024 * 1024 + 1,
      })
    ).toEqual({
      ok: false,
      error: "PDF 超過 50MB",
    })
  })

  test("accepts a PDF exactly at the 50MB boundary", () => {
    expect(
      validatePdfFile({
        type: "application/pdf",
        size: 50 * 1024 * 1024,
      })
    ).toEqual({ ok: true })
  })
})
