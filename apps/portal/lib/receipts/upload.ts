import type { SupabaseClient } from "@supabase/supabase-js"

import { RECEIPT_FILE_EXT, RECEIPT_MIME_PDF } from "@/lib/receipts/file"
import {
  RECEIPTS_BUCKET,
  toReceipt,
  type DatabaseReceiptWithTags,
  type DepositAccount,
  type Receipt,
} from "@/lib/receipts/types"

// One receipt = one storage object + one row, keyed by the same UUID. Shared
// by the browser hook and the MCP tool so both writers produce identical
// records. The caller hands over a finished PDF; conversion from images is a
// separate concern (browser: lib/receipts/file.ts, server: lib/mcp/receipt-file.ts).
export async function uploadReceiptPdf(
  supabase: SupabaseClient,
  {
    name,
    depositAccount,
    pdf,
  }: {
    name: string
    depositAccount: DepositAccount
    pdf: Blob
  }
): Promise<Receipt> {
  const trimmed = name.trim()
  if (!trimmed) throw new Error("名稱不能空白")

  const id = crypto.randomUUID()
  const path = `${id}/${id}.${RECEIPT_FILE_EXT}`

  const { error: uploadError } = await supabase.storage
    .from(RECEIPTS_BUCKET)
    .upload(path, pdf, { contentType: RECEIPT_MIME_PDF, upsert: false })
  if (uploadError) throw uploadError

  const { data, error } = await supabase
    .from("receipts")
    .insert({
      id,
      name: trimmed,
      image_path: path,
      deposit_account: depositAccount,
    })
    .select()
    .single()
  if (error) {
    // best-effort cleanup; orphan object beats half a row
    await supabase.storage.from(RECEIPTS_BUCKET).remove([path])
    throw error
  }

  return toReceipt(data as unknown as DatabaseReceiptWithTags)
}
