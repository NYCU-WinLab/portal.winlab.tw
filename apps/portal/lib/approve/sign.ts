import type { SupabaseClient } from "@supabase/supabase-js"

import type { ApproveField, ApproveUserFieldValue } from "./types"

export type SignatureValue = { fieldId: string; value: string }

// approve_submit_signature writes the values, keeps them as the member's
// defaults per category, marks them signed and completes the document when
// they were the last signer, in one transaction. It refuses a member who is
// not a signer, a second signature and any empty field.
export async function submitSignatureValues(
  supabase: SupabaseClient,
  documentId: string,
  values: SignatureValue[]
): Promise<void> {
  const { error } = await supabase.rpc("approve_submit_signature", {
    p_document_id: documentId,
    p_values: values.map((v) => ({ fieldId: v.fieldId, value: v.value })),
  })
  if (error) throw new Error(error.message)
}

export type SignaturePlan = {
  values: SignatureValue[]
  missing: ApproveField[]
  fromSaved: number
  provided: number
}

// What the signing page would submit: a predefined field starts from the
// member's saved value, an "other" field starts empty, and `provided` fills
// or replaces text fields by field id. A signature field only ever takes the
// saved image, so an agent can sign but never draw a signature.
export function planSignature(
  fields: ApproveField[],
  saved: ApproveUserFieldValue[],
  provided: Record<string, string>
): SignaturePlan {
  const byId = new Map(fields.map((f) => [f.id, f]))
  for (const id of Object.keys(provided)) {
    const field = byId.get(id)
    if (!field) {
      throw new Error(
        `field ${id} is not one of this member's fields on the document`
      )
    }
    if (field.category === "signature") {
      throw new Error(
        `field ${id} is a signature; it is signed with the member's saved signature and takes no value`
      )
    }
  }

  const values: SignatureValue[] = []
  const missing: ApproveField[] = []
  let fromSaved = 0
  let providedCount = 0
  for (const field of fields) {
    const given = provided[field.id]?.trim()
    const stored =
      field.category === "other"
        ? undefined
        : saved.find((v) => v.category === field.category)?.value?.trim()
    if (given) {
      values.push({ fieldId: field.id, value: given })
      providedCount += 1
    } else if (stored) {
      values.push({ fieldId: field.id, value: stored })
      fromSaved += 1
    } else {
      missing.push(field)
    }
  }
  return { values, missing, fromSaved, provided: providedCount }
}
