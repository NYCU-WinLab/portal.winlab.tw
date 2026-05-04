"use client"

import { PDFDocument } from "pdf-lib"

const MAX_DIM = 2000
const JPEG_QUALITY = 0.85
const ACCEPTED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
])

export const TRIP_FILE_ACCEPT =
  "application/pdf,image/jpeg,image/png,image/webp"

export type ConversionResult = {
  blob: Blob // always application/pdf
  filename: string // .pdf-suffixed name
}

export async function fileToPdf(file: File): Promise<ConversionResult> {
  const filename = pdfFilename(file.name)

  if (file.type === "application/pdf") {
    return { blob: file, filename }
  }
  if (ACCEPTED_IMAGE_TYPES.has(file.type)) {
    return { blob: await imageToPdfBlob(file), filename }
  }
  throw new Error(
    `不支援的檔案類型：${file.type || "unknown"}（只收 PDF / JPG / PNG / WebP）`
  )
}

async function imageToPdfBlob(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const { width, height } = scaleToFit(bitmap.width, bitmap.height, MAX_DIM)

  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext("2d")
  if (!ctx) {
    bitmap.close()
    throw new Error("瀏覽器拒絕給 canvas 2d context — 沒辦法壓縮")
  }
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  const jpegBlob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("圖片編碼失敗"))),
      "image/jpeg",
      JPEG_QUALITY
    )
  })
  const jpegBytes = new Uint8Array(await jpegBlob.arrayBuffer())

  const pdf = await PDFDocument.create()
  const image = await pdf.embedJpg(jpegBytes)
  const page = pdf.addPage([image.width, image.height])
  page.drawImage(image, {
    x: 0,
    y: 0,
    width: image.width,
    height: image.height,
  })
  const bytes = await pdf.save()
  return new Blob([new Uint8Array(bytes)], { type: "application/pdf" })
}

function scaleToFit(w: number, h: number, maxDim: number) {
  if (w <= maxDim && h <= maxDim) return { width: w, height: h }
  const ratio = w > h ? maxDim / w : maxDim / h
  return {
    width: Math.max(1, Math.round(w * ratio)),
    height: Math.max(1, Math.round(h * ratio)),
  }
}

function pdfFilename(originalName: string): string {
  const trimmed = originalName.replace(/\.[^.]+$/, "").trim()
  const safe = trimmed.length > 0 ? trimmed : "file"
  return `${safe}.pdf`
}
