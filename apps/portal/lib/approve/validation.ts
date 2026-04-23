import type { ApproveField, ApproveSigner } from "./types"

export type SubmitValidationInput = {
  title: string
  filePath: string | null
  signers: ApproveSigner[]
  fields: ApproveField[]
}

export type ValidationResult = { ok: true } | { ok: false; reason: string }

export function validateForSubmit(
  input: SubmitValidationInput
): ValidationResult {
  if (!input.title.trim()) return { ok: false, reason: "標題不可空白" }
  if (!input.filePath) return { ok: false, reason: "還沒上傳 PDF" }
  if (input.signers.length === 0)
    return { ok: false, reason: "至少要一位 signer" }

  const signerIds = new Set(input.signers.map((s) => s.signer_id))
  for (const f of input.fields) {
    if (!signerIds.has(f.signer_id)) {
      return { ok: false, reason: "有方塊指派給未登記的 signer" }
    }
  }

  for (const signer of input.signers) {
    const hasField = input.fields.some((f) => f.signer_id === signer.signer_id)
    if (!hasField) {
      return { ok: false, reason: "每位 signer 都至少需要一個方塊" }
    }
  }

  return { ok: true }
}
