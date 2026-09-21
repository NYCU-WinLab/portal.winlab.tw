import { describe, expect, test } from "bun:test"

import {
  decodeBase64,
  MAX_RECEIPT_BYTES,
  toReceiptPdf,
} from "@/lib/mcp/receipt-file"

// 1x1 transparent PNG
const PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="

async function pdfHeader(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  return new TextDecoder().decode(bytes.subarray(0, 4))
}

describe("decodeBase64", () => {
  test("strips a data: URL prefix and whitespace", () => {
    const bytes = decodeBase64(
      `data:image/png;base64,${PNG_B64.slice(0, 20)}\n${PNG_B64.slice(20)}`
    )
    expect(bytes.byteLength).toBeGreaterThan(0)
  })

  test("rejects garbage and empty input", () => {
    expect(() => decodeBase64("")).toThrow()
    expect(() => decodeBase64("not base64!!")).toThrow()
  })

  test("rejects payloads over the size limit", () => {
    const big = Buffer.alloc(MAX_RECEIPT_BYTES + 1).toString("base64")
    expect(() => decodeBase64(big)).toThrow(/limit/)
  })
})

describe("toReceiptPdf", () => {
  test("passes a PDF through untouched", async () => {
    const original = new TextEncoder().encode("%PDF-1.4\n%%EOF")
    const blob = await toReceiptPdf(original, "application/pdf")
    expect(blob.type).toBe("application/pdf")
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(original)
  })

  test("rejects bytes that claim to be a PDF but are not", async () => {
    await expect(
      toReceiptPdf(new TextEncoder().encode("hello"), "application/pdf")
    ).rejects.toThrow(/not a PDF/)
  })

  test("wraps a PNG into a one-page PDF", async () => {
    const blob = await toReceiptPdf(decodeBase64(PNG_B64), "image/png")
    expect(await pdfHeader(blob)).toBe("%PDF")
  })
})
