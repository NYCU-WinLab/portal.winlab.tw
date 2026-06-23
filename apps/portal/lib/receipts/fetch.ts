import type { SupabaseClient } from "@supabase/supabase-js"

import {
  STATUS_ORDER,
  toReceipt,
  type DatabaseReceiptWithTags,
  type Receipt,
} from "@/lib/receipts/types"

// Embed tags via the assignments join table; PostgREST returns
// { receipt_tag_assignments: [{ receipt_tags: {...} }, ...] }
const RECEIPT_WITH_TAGS_SELECT = `
  *,
  receipt_tag_assignments (
    receipt_tags ( id, name, variant, created_by, created_at )
  )
`

// Shared by the client hook and the server prefetch — same query + same
// queryKey (receipts.all) so the page hydrates with real rows from the HTML.
export async function fetchReceipts(
  supabase: SupabaseClient
): Promise<Receipt[]> {
  const { data, error } = await supabase
    .from("receipts")
    .select(RECEIPT_WITH_TAGS_SELECT)
    .order("created_at", { ascending: false })
  if (error) {
    console.error("[receipts] list query failed", error)
    throw new Error(error.message || "讀取收據失敗")
  }
  return (data as unknown as DatabaseReceiptWithTags[])
    .map(toReceipt)
    .sort((a, b) => {
      const byStatus = STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
      if (byStatus !== 0) return byStatus
      return b.createdAt.localeCompare(a.createdAt)
    })
}
