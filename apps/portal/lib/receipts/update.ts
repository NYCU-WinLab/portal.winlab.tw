import type { SupabaseClient } from "@supabase/supabase-js"

import {
  toReceipt,
  type DatabaseReceiptWithTags,
  type DepositAccount,
  type Receipt,
} from "@/lib/receipts/types"

// Edits the display fields of one receipt; the stored file never changes.
// Shared by the browser edit dialog and the MCP rename_receipt tool. RLS only
// lets receipts admins update, and a row the caller may not touch updates
// nothing instead of erroring, so an empty result is reported as such.
export async function updateReceipt(
  supabase: SupabaseClient,
  id: string,
  { name, depositAccount }: { name: string; depositAccount?: DepositAccount }
): Promise<Receipt> {
  const trimmed = name.trim()
  if (!trimmed) throw new Error("名稱不能空白")

  const { data, error } = await supabase
    .from("receipts")
    .update(
      depositAccount
        ? { name: trimmed, deposit_account: depositAccount }
        : { name: trimmed }
    )
    .eq("id", id)
    .select()
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error("找不到這張收據，或你沒有權限修改它")

  return toReceipt(data as unknown as DatabaseReceiptWithTags)
}
