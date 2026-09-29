import { describe, expect, test } from "bun:test"

import { toReceiptPdf } from "@/lib/mcp/receipt-file"

// 1x1 transparent PNG
const PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="

async function pdfHeader(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  return new TextDecoder().decode(bytes.subarray(0, 4))
}

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
    const png = new Uint8Array(Buffer.from(PNG_B64, "base64"))
    const blob = await toReceiptPdf(png, "image/png")
    expect(await pdfHeader(blob)).toBe("%PDF")
  })
})
