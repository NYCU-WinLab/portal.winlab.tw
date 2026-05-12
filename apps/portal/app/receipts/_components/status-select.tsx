"use client"

import { toast } from "sonner"

import { Badge } from "@workspace/ui/components/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"

import { useUpdateReceiptStatus } from "@/hooks/receipts/use-receipts"
import { STATUS_LABELS, type ReceiptStatus } from "@/lib/receipts/types"

const VARIANTS: Record<ReceiptStatus, "secondary" | "default" | "destructive"> =
  {
    pending: "secondary",
    approved: "default",
    rejected: "destructive",
  }

export function ReceiptStatusBadge({ status }: { status: ReceiptStatus }) {
  return <Badge variant={VARIANTS[status]}>{STATUS_LABELS[status]}</Badge>
}

export function StatusSelect({
  id,
  value,
}: {
  id: string
  value: ReceiptStatus
}) {
  const update = useUpdateReceiptStatus()

  const handleChange = (next: string) => {
    if (next === value) return
    update.mutate(
      { id, status: next as ReceiptStatus },
      {
        onSuccess: () =>
          toast.success(`狀態改為「${STATUS_LABELS[next as ReceiptStatus]}」`),
        onError: (err) => toast.error(`改狀態失敗：${err.message}`),
      }
    )
  }

  return (
    <Select
      value={value}
      onValueChange={handleChange}
      disabled={update.isPending}
    >
      <SelectTrigger className="w-32">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {(["pending", "approved", "rejected"] as ReceiptStatus[]).map((s) => (
          <SelectItem key={s} value={s}>
            {STATUS_LABELS[s]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
