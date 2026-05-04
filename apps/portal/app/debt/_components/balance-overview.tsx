"use client"

import { IconChevronRight } from "@tabler/icons-react"

import { Badge } from "@workspace/ui/components/badge"
import { Checkbox } from "@workspace/ui/components/checkbox"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@workspace/ui/components/collapsible"

import { useMarkItemPaid } from "@/hooks/debt/use-expenses"
import type { BalanceEntry } from "@/lib/debt/types"

interface BalanceOverviewProps {
  iOwe: BalanceEntry[]
  owedToMe: BalanceEntry[]
}

function BalanceRow({
  entry,
  showPaidToggle,
}: {
  entry: BalanceEntry
  showPaidToggle?: boolean
}) {
  const markPaid = useMarkItemPaid()

  return (
    <Collapsible>
      <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md p-2 text-sm hover:bg-muted">
        <span>{entry.userName ?? "(unknown)"}</span>
        <div className="flex items-center gap-2">
          <span className="font-medium">${entry.netAmount}</span>
          <IconChevronRight className="size-4 transition-transform [[data-state=open]_&]:rotate-90" />
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="ml-2 border-l pb-2 pl-3">
          {entry.expenses.map((exp) => {
            const isPaid = !!exp.paidAt
            return (
              <div
                key={exp.itemId}
                className="flex items-center justify-between py-1 text-xs text-muted-foreground"
              >
                <div className="flex items-center gap-2">
                  {showPaidToggle && (
                    <Checkbox
                      checked={isPaid}
                      onCheckedChange={(checked) => {
                        markPaid.mutate({
                          itemId: exp.itemId,
                          paid: !!checked,
                        })
                      }}
                    />
                  )}
                  <span className={isPaid ? "line-through opacity-50" : ""}>
                    {exp.name}
                  </span>
                </div>
                <span className={isPaid ? "line-through opacity-50" : ""}>
                  ${exp.amount}
                </span>
              </div>
            )
          })}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

export function BalanceOverview({ iOwe, owedToMe }: BalanceOverviewProps) {
  const totalIOwe = iOwe.reduce((s, e) => s + e.netAmount, 0)
  const totalOwedToMe = owedToMe.reduce((s, e) => s + e.netAmount, 0)

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="rounded-3xl border p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-medium">你欠別人</h3>
          {totalIOwe > 0 && <Badge variant="secondary">${totalIOwe}</Badge>}
        </div>
        {iOwe.length === 0 ? (
          <p className="text-xs text-muted-foreground">沒有欠款</p>
        ) : (
          iOwe.map((entry) => <BalanceRow key={entry.userId} entry={entry} />)
        )}
      </div>

      <div className="rounded-3xl border p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-medium">別人欠你</h3>
          {totalOwedToMe > 0 && (
            <Badge variant="secondary">${totalOwedToMe}</Badge>
          )}
        </div>
        {owedToMe.length === 0 ? (
          <p className="text-xs text-muted-foreground">沒有人欠你錢</p>
        ) : (
          owedToMe.map((entry) => (
            <BalanceRow key={entry.userId} entry={entry} showPaidToggle />
          ))
        )}
      </div>
    </div>
  )
}
