"use client"

import { PDFDocument, type PDFImage } from "pdf-lib"

export type SignaturePosition = "tl" | "tr" | "bl" | "br"

export const SIGNATURE_POSITIONS: ReadonlyArray<{
  id: SignaturePosition
  label: string
}> = [
  { id: "tl", label: "左上" },
  { id: "tr", label: "右上" },
  { id: "bl", label: "左下" },
  { id: "br", label: "右下" },
]

const STAMP_WIDTH_RATIO = 0.25
const MARGIN_RATIO = 0.05

// Stamp the saved signature onto every page of the given PDF blob.
// Returns a new PDF blob. Throws if the PDF is unreadable or the signature
// data URL is malformed.
export async function stampSignatureOnPdf(
  pdfBlob: Blob,
  signatureDataUrl: string,
  position: SignaturePosition
): Promise<Blob> {
  const pdfBytes = new Uint8Array(await pdfBlob.arrayBuffer())
  const pdf = await PDFDocument.load(pdfBytes)
  const image = await embedSignatureImage(pdf, signatureDataUrl)
  if (!image) {
    throw new Error("簽名格式不支援（需 PNG / JPEG / SVG）")
  }

  for (const page of pdf.getPages()) {
    const { width: pw, height: ph } = page.getSize()
    const stampWidth = pw * STAMP_WIDTH_RATIO
    const stampHeight = stampWidth * (image.height / image.width)
    const marginX = pw * MARGIN_RATIO
    const marginY = ph * MARGIN_RATIO

    // pdf-lib origin = bottom-left.
    let x = marginX
    let y = marginY
    if (position === "tl") {
      x = marginX
      y = ph - marginY - stampHeight
    } else if (position === "tr") {
      x = pw - marginX - stampWidth
      y = ph - marginY - stampHeight
    } else if (position === "bl") {
      x = marginX
      y = marginY
    } else if (position === "br") {
      x = pw - marginX - stampWidth
      y = marginY
    }

    page.drawImage(image, { x, y, width: stampWidth, height: stampHeight })
  }

  const out = await pdf.save()
  return new Blob([new Uint8Array(out)], { type: "application/pdf" })
}

const DATA_URL_RE = /^data:image\/(png|jpeg|jpg|svg\+xml);base64,(.*)$/

async function embedSignatureImage(
  pdf: PDFDocument,
  dataUrl: string
): Promise<PDFImage | null> {
  const match = dataUrl.match(DATA_URL_RE)
  if (!match) return null
  const kind = match[1]
  const base64 = match[2]!
  const bytes = base64ToUint8(base64)

  if (kind === "png") return pdf.embedPng(bytes)
  if (kind === "jpeg" || kind === "jpg") return pdf.embedJpg(bytes)

  const png = await rasterizeDataUrl(dataUrl)
  return pdf.embedPng(png)
}

function base64ToUint8(b64: string): Uint8Array {
  const bin = atob(b64)
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

async function rasterizeDataUrl(url: string): Promise<Uint8Array> {
  const img = new Image()
  img.src = url
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = () => reject(new Error("簽名圖載入失敗"))
  })
  const w = img.width || 400
  const h = img.height || 200
  const canvas = document.createElement("canvas")
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("canvas 2d context unavailable")
  ctx.drawImage(img, 0, 0)
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("簽名 PNG 編碼失敗"))),
      "image/png"
    )
  })
  return new Uint8Array(await blob.arrayBuffer())
}
