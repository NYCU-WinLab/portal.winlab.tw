// Server-side twin of lib/receipts/file.ts. The browser rasterises images
// through <canvas>; here we have no DOM, so JPEG and PNG are embedded into a
// one-page PDF with pdf-lib directly. WebP has no pdf-lib embedder and is
// therefore not accepted over MCP.

export const MCP_RECEIPT_MIMES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
] as const

export type McpReceiptMime = (typeof MCP_RECEIPT_MIMES)[number]

// Vercel rejects request bodies above ~4.5 MB and base64 inflates by a third,
// so the decoded payload has to stay well under that.
export const MAX_RECEIPT_BYTES = 3 * 1024 * 1024

const PDF_MAGIC = "%PDF"

export function decodeBase64(input: string): Uint8Array {
  const stripped = input.replace(/^data:[^;]+;base64,/, "").replace(/\s/g, "")
  if (!stripped) throw new Error("file_base64 is empty")
  if (!/^[A-Za-z0-9+/]+=*$/.test(stripped)) {
    throw new Error("file_base64 is not valid base64")
  }
  const bytes = new Uint8Array(Buffer.from(stripped, "base64"))
  if (bytes.byteLength === 0) throw new Error("file_base64 decoded to 0 bytes")
  if (bytes.byteLength > MAX_RECEIPT_BYTES) {
    throw new Error(
      `file is ${bytes.byteLength} bytes; the limit is ${MAX_RECEIPT_BYTES}`
    )
  }
  return bytes
}

export async function toReceiptPdf(
  bytes: Uint8Array,
  mime: McpReceiptMime
): Promise<Blob> {
  if (mime === "application/pdf") {
    const head = new TextDecoder().decode(bytes.subarray(0, PDF_MAGIC.length))
    if (head !== PDF_MAGIC) throw new Error("file is not a PDF")
    return new Blob([new Uint8Array(bytes)], { type: "application/pdf" })
  }

  const { PDFDocument } = await import("pdf-lib")
  const pdf = await PDFDocument.create()
  const image =
    mime === "image/png" ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes)
  const page = pdf.addPage([image.width, image.height])
  page.drawImage(image, {
    x: 0,
    y: 0,
    width: image.width,
    height: image.height,
  })
  const out = await pdf.save()
  return new Blob([new Uint8Array(out)], { type: "application/pdf" })
}
