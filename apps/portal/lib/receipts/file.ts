import { PDFDocument } from "pdf-lib"

// Receipts get archived as PDF — uniform format whether the user uploaded an
// image (phone photo of a paper receipt) or a PDF invoice. PDFs go through
// untouched so vector content survives; images get rasterized to JPEG inside a
// single-page PDF sized to the image's pixel dimensions.

export const RECEIPT_MIME_PDF = "application/pdf"
export const RECEIPT_FILE_EXT = "pdf"

const SUPPORTED_IMAGE_PREFIXES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]

export function isSupportedReceiptFile(file: File): boolean {
  if (file.type === RECEIPT_MIME_PDF) return true
  return SUPPORTED_IMAGE_PREFIXES.some((p) => file.type === p)
}

export async function fileToReceiptPdf(file: File): Promise<Blob> {
  if (file.type === RECEIPT_MIME_PDF) {
    return new Blob([await file.arrayBuffer()], { type: RECEIPT_MIME_PDF })
  }
  if (!file.type.startsWith("image/")) {
    throw new Error("只支援圖片或 PDF — 收到的是 " + (file.type || "未知格式"))
  }
  const jpegBytes = await rasterizeToJpeg(file)
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
  // Copy into a fresh Uint8Array so the Blob constructor sees a typed array
  // backed by ArrayBuffer (not the wider ArrayBufferLike pdf-lib returns).
  return new Blob([new Uint8Array(bytes)], { type: RECEIPT_MIME_PDF })
}

async function rasterizeToJpeg(file: File): Promise<Uint8Array> {
  const url = URL.createObjectURL(file)
  try {
    const img = await loadImage(url)
    const canvas = document.createElement("canvas")
    canvas.width = img.naturalWidth || img.width
    canvas.height = img.naturalHeight || img.height
    const ctx = canvas.getContext("2d")
    if (!ctx) throw new Error("找不到 canvas 2d context")
    ctx.drawImage(img, 0, 0)
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.92)
    )
    if (!blob) throw new Error("圖片轉 JPEG 失敗")
    return new Uint8Array(await blob.arrayBuffer())
  } finally {
    URL.revokeObjectURL(url)
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error("讀不到圖片 — 可能不是支援的格式"))
    img.src = src
  })
}

// Strip characters that NTFS / HFS / common shells dislike, so the downloaded
// filename actually opens in the user's OS.
export function sanitizeFilename(name: string): string {
  // Strip control bytes (\x00-\x1f) and shell-hostile punctuation.
  // eslint-disable-next-line no-control-regex
  const cleaned = name
    .replace(/[\\/:*?"<>|\x00-\x1f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
  return cleaned.length > 0 ? cleaned : "receipt"
}
