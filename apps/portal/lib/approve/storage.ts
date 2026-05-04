export const APPROVE_BUCKET = "approve-documents"

export function documentStoragePath(documentId: string): string {
  return `${documentId}/original.pdf`
}
