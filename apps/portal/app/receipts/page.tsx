import { notFound } from "next/navigation"

import { isReceiptsAdmin } from "@/lib/receipts/admin"

import { ReceiptsView } from "./_components/receipts-view"

// /receipts is admin-only; the listing is sensitive (incoming reimbursement
// claims). Skip static rendering so the gate runs per request.
export const dynamic = "force-dynamic"

export default async function ReceiptsPage() {
  const isAdmin = await isReceiptsAdmin()
  if (!isAdmin) notFound()
  return <ReceiptsView />
}
