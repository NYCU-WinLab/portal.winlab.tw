import { SettlementsList } from "../_components/settlements-list"

export default function DebtSettlementsPage() {
  return (
    <div className="grid gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-medium">結算單</h1>
        <p className="text-sm text-muted-foreground">
          每月 10 號自動產生上個月的淨額結算。雙方確認後關閉。
        </p>
      </div>
      <SettlementsList />
    </div>
  )
}
