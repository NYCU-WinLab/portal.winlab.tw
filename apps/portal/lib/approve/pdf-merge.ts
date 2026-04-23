"use client"

import { PDFDocument } from "pdf-lib"

import type { ApproveField } from "./types"

// Build a flattened PDF with every signed field burned onto the original page.
// Text fields are rasterised through a canvas so CJK characters work without
// embedding a CJK font (pdf-lib's built-in fonts are WinAnsi-only).
export async function buildSignedPdf(
  pdfUrl: string,
  fields: ApproveField[]
): Promise<Uint8Array> {
  const pdfBytes = await fetch(pdfUrl).then((r) => r.arrayBuffer())
  const pdf = await PDFDocument.load(pdfBytes)
  const pages = pdf.getPages()

  for (const f of fields) {
    if (!f.value) continue
    const page = pages[f.page - 1]
    if (!page) continue
    const { width: pw, height: ph } = page.getSize()
    const x = f.x * pw
    const width = f.width * pw
    const height = f.height * ph
    // pdf-lib y-origin is bottom-left; our normalized y is top-left.
    const y = ph - f.y * ph - height

    if (f.category === "signature") {
      const image = await embedImage(pdf, f.value)
      if (image) page.drawImage(image, { x, y, width, height })
      continue
    }

    const bytes = await rasterizeText(f.value, width, height)
    const image = await pdf.embedPng(bytes)
    page.drawImage(image, { x, y, width, height })
  }

  return await pdf.save()
}

export function downloadPdf(bytes: Uint8Array, filename: string): void {
  const ab = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(ab).set(bytes)
  const blob = new Blob([ab], { type: "application/pdf" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

async function embedImage(pdf: PDFDocument, dataUrl: string) {
  const match = /^data:image\/(png|jpeg|jpg|svg\+xml);base64,(.*)$/.exec(
    dataUrl
  )
  if (!match) return null
  const kind = match[1]
  const base64 = match[2]!
  const bin = atob(base64)
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
  if (kind === "png") return pdf.embedPng(bytes)
  if (kind === "jpeg" || kind === "jpg") return pdf.embedJpg(bytes)
  const raster = await rasterizeDataUrl(dataUrl)
  return pdf.embedPng(raster)
}

async function rasterizeText(
  text: string,
  boxWidth: number,
  boxHeight: number
): Promise<Uint8Array> {
  const scale = 2
  const w = Math.max(1, Math.round(boxWidth * scale))
  const h = Math.max(1, Math.round(boxHeight * scale))
  const canvas = document.createElement("canvas")
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("canvas 2d context unavailable")
  const fontSize = Math.min(h * 0.6, 18 * scale)
  ctx.fillStyle = "#000"
  ctx.font = `${fontSize}px -apple-system, "PingFang TC", "Noto Sans TC", sans-serif`
  ctx.textBaseline = "middle"
  ctx.fillText(text, 4 * scale, h / 2)
  return canvasToPng(canvas)
}

async function rasterizeDataUrl(url: string): Promise<Uint8Array> {
  const img = new Image()
  img.src = url
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = () => reject(new Error("image load failed"))
  })
  const canvas = document.createElement("canvas")
  canvas.width = img.width || 400
  canvas.height = img.height || 200
  canvas.getContext("2d")?.drawImage(img, 0, 0)
  return canvasToPng(canvas)
}

function canvasToPng(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) return reject(new Error("canvas export failed"))
      blob.arrayBuffer().then((buf) => resolve(new Uint8Array(buf)))
    }, "image/png")
  })
}
