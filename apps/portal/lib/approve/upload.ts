export type ValidatedUploadPayload =
  | { documentId: string; file: File }
  | { error: string }

const MAX_PDF_BYTES = 50 * 1024 * 1024

/**
 * Pure parse + size cap for the uploadPdf action's FormData. Returns the
 * extracted `{ documentId, file }` on success or `{ error }` for a bad payload
 * / oversized file. The DB ownership + draft-status check stays in the action.
 */
export function validateUploadPayload(
  formData: FormData
): ValidatedUploadPayload {
  const documentId = formData.get("documentId")
  const file = formData.get("file")
  if (typeof documentId !== "string" || !(file instanceof File)) {
    return { error: "bad payload" }
  }
  if (file.size > MAX_PDF_BYTES) {
    return { error: "PDF too large (>50MB)" }
  }
  return { documentId, file }
}
