"use client"

import { IconArrowRight, IconCheck } from "@tabler/icons-react"
import { toast } from "sonner"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"

import {
  useConfirmSettlement,
  type SettlementWithNames,
} from "@/hooks/debt/use-settlements"
import { useAuth } from "@/hooks/use-auth"

interface SettlementCardProps {
  settlement: SettlementWithNames
}

export function SettlementCard({ settlement }: SettlementCardProps) {
  const { user } = useAuth()
  const confirm = useConfirmSettlement()

  const isFrom = settlement.from_user_id === user?.id
  const isTo = settlement.to_user_id === user?.id
  const myConfirmed = isFrom
    ? settlement.from_confirmed
    : isTo
      ? settlement.to_confirmed
      : true

  const handleConfirm = async () => {
    try {
      await confirm.mutateAsync(settlement.id)
      toast.success(isFrom ? "已確認轉帳" : "已確認收款")
    } catch {
      toast.error("確認失敗")
    }
  }

  return (
    <div className="flex items-center justify-between rounded-md border p-3 text-sm">
      <div className="flex items-center gap-2">
        <span>{settlement.from_user_name}</span>
        <IconArrowRight className="size-4 text-muted-foreground" />
        <span>{settlement.to_user_name}</span>
        <span className="font-medium">${settlement.amount}</span>
        <Badge variant="secondary">{settlement.period}</Badge>
      </div>

      <div className="flex items-center gap-2">
        {settlement.from_confirmed && (
          <Badge variant="outline" className="text-xs">
            已轉
          </Badge>
        )}
        {settlement.to_confirmed && (
          <Badge variant="outline" className="text-xs">
            已收
          </Badge>
        )}
        {!myConfirmed && (
          <Button
            size="sm"
            onClick={handleConfirm}
            disabled={confirm.isPending}
          >
            <IconCheck />
            {isFrom ? "確認已轉" : "確認已收"}
          </Button>
        )}
      </div>
    </div>
  )
}
