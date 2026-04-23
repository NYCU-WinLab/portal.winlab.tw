import type { ApproveField } from "./types"

export type SubmitValidationInput = {
  title: string
  filePath: string | null
  fields: ApproveField[]
}

export type ValidationResult = { ok: true } | { ok: false; reason: string }

export function validateForSubmit(
  input: SubmitValidationInput
): ValidationResult {
  if (!input.title.trim()) return { ok: false, reason: "標題不可空白" }
  if (!input.filePath) return { ok: false, reason: "還沒上傳 PDF" }
  if (input.fields.length === 0)
    return { ok: false, reason: "至少要放一個方塊" }
  for (const f of input.fields) {
    if (!f.signer_id) {
      return { ok: false, reason: "有方塊還沒選 signer" }
    }
  }
  return { ok: true }
}
