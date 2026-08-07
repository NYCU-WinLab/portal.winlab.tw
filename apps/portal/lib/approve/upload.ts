export const MAX_PDF_BYTES = 50 * 1024 * 1024

type PdfFileMetadata = Pick<File, "size" | "type">

export function validatePdfFile(
  file: PdfFileMetadata
): { ok: true } | { ok: false; error: string } {
  if (file.type !== "application/pdf") {
    return { ok: false, error: "只收 PDF" }
  }
  if (file.size > MAX_PDF_BYTES) {
    return { ok: false, error: "PDF 超過 50MB" }
  }
  return { ok: true }
}
