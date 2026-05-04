"use client"

import { useMySettlements } from "@/hooks/debt/use-settlements"

import { SettlementCard } from "./settlement-card"

export function SettlementsList() {
  const { data: settlements, isLoading } = useMySettlements()

  if (isLoading && !settlements) {
    return <p className="text-sm text-muted-foreground">載入結算紀錄中...</p>
  }

  if (!settlements || settlements.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        目前沒有待結算項目。每月 10 號自動產生上個月的結算單。
      </p>
    )
  }

  return (
    <div className="grid gap-2">
      {settlements.map((s) => (
        <SettlementCard key={s.id} settlement={s} />
      ))}
    </div>
  )
}
