"use client"

import { useMemo } from "react"

import { Badge } from "@workspace/ui/components/badge"

import type { Ingress, Reimbursement, Transaction } from "@/lib/reimburse/types"

import { AddEgressDialog } from "./add-egress-dialog"
import { AddIngressDialog } from "./add-ingress-dialog"
import { getUnifiedColumns } from "./unified-columns"
import { UnifiedChart } from "./unified-chart"
import { UnifiedTable } from "./unified-table"

interface DataViewProps {
  egressData: Reimbursement[]
  ingressData: Ingress[]
  isAdmin: boolean
}

const twd = new Intl.NumberFormat("zh-TW", {
  style: "currency",
  currency: "TWD",
  minimumFractionDigits: 0,
})

export function DataView({ egressData, ingressData, isAdmin }: DataViewProps) {
  const transactions = useMemo<Transaction[]>(() => {
    return [
      ...egressData.map((item): Transaction => ({ type: "egress", ...item })),
      ...ingressData.map((item): Transaction => ({ type: "ingress", ...item })),
    ].sort((a, b) => {
      const dateA = a.type === "egress" ? a.invoiceDate : a.ingressDate
      const dateB = b.type === "egress" ? b.invoiceDate : b.ingressDate
      return dateB.localeCompare(dateA)
    })
  }, [egressData, ingressData])

  const balance = useMemo(() => {
    const totalIngress = ingressData.reduce(
      (sum, item) => sum + item.ingressAmount,
      0
    )
    const totalEgress = egressData.reduce(
      (sum, item) => sum + item.itemAmount + (item.transferFee ?? 0),
      0
    )
    return totalIngress - totalEgress
  }, [egressData, ingressData])

  const columns = useMemo(() => getUnifiedColumns(isAdmin), [isAdmin])

  return (
    <div className="flex w-full flex-col gap-6">
      <div className="flex items-center justify-between">
        <Badge
          variant={balance >= 0 ? "outline" : "destructive"}
          className="text-base"
        >
          {twd.format(balance)}
        </Badge>
        {isAdmin && (
          <div className="flex flex-wrap gap-2">
            <AddEgressDialog />
            <AddIngressDialog />
          </div>
        )}
      </div>

      <div className="h-64 w-full">
        <UnifiedChart data={transactions} />
      </div>

      <UnifiedTable columns={columns} data={transactions} />
    </div>
  )
}
