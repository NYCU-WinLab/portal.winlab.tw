import { isReimburseAdmin } from "@/lib/reimburse/admin"
import { getEgressList } from "@/lib/reimburse/egress"
import { getIngressList } from "@/lib/reimburse/ingress"
import { transformEgress, transformIngress } from "@/lib/reimburse/transformers"

import { DataView } from "./_components/data-view"

// /reimburse depends on the signed-in user's role + cookies. Skip static
// rendering so the admin gate and data are always fresh.
export const dynamic = "force-dynamic"

export default async function ReimbursePage() {
  const [egressRows, ingressRows, isAdmin] = await Promise.all([
    getEgressList().catch((err) => {
      console.error("[reimburse] failed to fetch egress", err)
      return []
    }),
    getIngressList().catch((err) => {
      console.error("[reimburse] failed to fetch ingress", err)
      return []
    }),
    isReimburseAdmin(),
  ])

  return (
    <DataView
      egressData={egressRows.map(transformEgress)}
      ingressData={ingressRows.map(transformIngress)}
      isAdmin={isAdmin}
    />
  )
}
