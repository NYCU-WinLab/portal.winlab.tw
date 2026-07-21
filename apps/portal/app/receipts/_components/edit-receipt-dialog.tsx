"use client"

import { useState } from "react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"

import { useUpdateReceipt } from "@/hooks/receipts/use-receipts"
import {
  DEPOSIT_ACCOUNT_LABELS,
  DEPOSIT_ACCOUNTS,
  type DepositAccount,
} from "@/lib/receipts/types"

export function EditReceiptDialog({
  id,
  name,
  depositAccount,
  onClose,
}: {
  id: string
  name: string
  depositAccount: DepositAccount | null
  onClose: () => void
}) {
  const [draft, setDraft] = useState(name)
  const [draftAccount, setDraftAccount] = useState<DepositAccount | "">(
    depositAccount ?? ""
  )
  const update = useUpdateReceipt()

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!draftAccount) {
      toast.error("請選擇入帳帳戶")
      return
    }
    update.mutate(
      { id, name: draft, depositAccount: draftAccount },
      {
        onSuccess: () => {
          toast.success("已更新")
          onClose()
        },
        onError: (err) => toast.error(`更新失敗：${err.message}`),
      }
    )
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>編輯收據</DialogTitle>
            <DialogDescription>
              改的是顯示用的名稱與入帳帳戶；檔案不會動到。
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="receipt-name-edit">
                名稱 <span className="text-destructive">*</span>
              </Label>
              <Input
                id="receipt-name-edit"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                disabled={update.isPending}
                required
                autoFocus
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="receipt-deposit-account-edit">
                入帳帳戶 <span className="text-destructive">*</span>
              </Label>
              <Select
                value={draftAccount}
                onValueChange={(v) => setDraftAccount(v as DepositAccount)}
                disabled={update.isPending}
              >
                <SelectTrigger
                  id="receipt-deposit-account-edit"
                  className="w-full"
                >
                  <SelectValue placeholder="選擇入帳帳戶" />
                </SelectTrigger>
                <SelectContent>
                  {DEPOSIT_ACCOUNTS.map((account) => (
                    <SelectItem key={account} value={account}>
                      {DEPOSIT_ACCOUNT_LABELS[account]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              disabled={update.isPending}
            >
              取消
            </Button>
            <Button type="submit" disabled={update.isPending}>
              {update.isPending ? "儲存中…" : "儲存"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
