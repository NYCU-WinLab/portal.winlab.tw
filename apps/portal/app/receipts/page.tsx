import {
  dehydrate,
  HydrationBoundary,
  QueryClient,
} from "@tanstack/react-query"
import { notFound } from "next/navigation"

import { queryKeys } from "@/hooks/receipts/query-keys"
import { isReceiptsAdmin } from "@/lib/receipts/admin"
import { fetchReceipts } from "@/lib/receipts/fetch"
import { createClient } from "@/lib/supabase/server"

import { ReceiptsView } from "./_components/receipts-view"

// /receipts is admin-only; the listing is sensitive (incoming reimbursement
// claims). Skip static rendering so the gate runs per request.
export const dynamic = "force-dynamic"

export default async function ReceiptsPage() {
  const isAdmin = await isReceiptsAdmin()
  if (!isAdmin) notFound()

  const queryClient = new QueryClient()
  const supabase = await createClient()
  await queryClient.prefetchQuery({
    queryKey: queryKeys.receipts.all,
    queryFn: () => fetchReceipts(supabase),
  })

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <ReceiptsView />
    </HydrationBoundary>
  )
}
