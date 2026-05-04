"use client"

import { IconPlus, IconTrash, IconX } from "@tabler/icons-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardAction,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Separator } from "@workspace/ui/components/separator"

import {
  useCreateExpense,
  useDeleteExpense,
  useUpdateExpense,
} from "@/hooks/debt/use-expenses"
import { useMembers } from "@/hooks/debt/use-members"
import { useAuth } from "@/hooks/use-auth"
import type { Expense } from "@/lib/debt/types"

import { MemberSelect } from "./member-select"

interface DebtorRow {
  key: string
  debtorId: string
  amount: string
}

interface ExpenseFormProps {
  expense?: Expense | null
  onClose: () => void
}

export function ExpenseForm({ expense, onClose }: ExpenseFormProps) {
  const { user } = useAuth()
  const { data: members = [] } = useMembers()
  const createExpense = useCreateExpense()
  const updateExpense = useUpdateExpense()
  const deleteExpense = useDeleteExpense()

  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [rows, setRows] = useState<DebtorRow[]>([
    { key: crypto.randomUUID(), debtorId: "", amount: "" },
  ])

  const isEdit = !!expense

  useEffect(() => {
    if (expense) {
      setName(expense.name)
      setDescription(expense.description ?? "")
      setRows(
        expense.items.map((item) => ({
          key: crypto.randomUUID(),
          debtorId: item.debtor_id,
          amount: String(item.amount),
        }))
      )
    }
  }, [expense])

  const addRow = () => {
    setRows([...rows, { key: crypto.randomUUID(), debtorId: "", amount: "" }])
  }

  const removeRow = (key: string) => {
    if (rows.length <= 1) return
    setRows(rows.filter((r) => r.key !== key))
  }

  const updateRow = (
    key: string,
    field: "debtorId" | "amount",
    value: string
  ) => {
    setRows(rows.map((r) => (r.key === key ? { ...r, [field]: value } : r)))
  }

  const total = rows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0)
  const selectedDebtorIds = rows.map((r) => r.debtorId).filter(Boolean)

  const handleSave = async () => {
    const validRows = rows.filter((r) => r.debtorId && Number(r.amount) > 0)
    if (!name.trim() || validRows.length === 0) {
      toast.error("請填寫名稱和至少一筆分帳")
      return
    }

    const items = validRows.map((r) => ({
      debtor_id: r.debtorId,
      amount: Number(r.amount),
    }))

    try {
      if (isEdit) {
        await updateExpense.mutateAsync({
          id: expense!.id,
          name: name.trim(),
          description: description.trim() || undefined,
          items,
        })
        toast.success("分帳已更新")
      } else {
        await createExpense.mutateAsync({
          name: name.trim(),
          description: description.trim() || undefined,
          items,
        })
        toast.success("分帳已建立")
      }
      onClose()
    } catch (err: unknown) {
      const msg =
        (err as { message?: string })?.message ??
        (err as { details?: string })?.details ??
        JSON.stringify(err)
      toast.error(`操作失敗：${msg}`)
    }
  }

  const handleDelete = async () => {
    if (!expense) return
    try {
      await deleteExpense.mutateAsync(expense.id)
      toast.success("分帳已刪除")
      onClose()
    } catch {
      toast.error("刪除失敗")
    }
  }

  const isPending =
    createExpense.isPending ||
    updateExpense.isPending ||
    deleteExpense.isPending

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {isEdit ? "編輯分帳" : "新增分帳"}
        </CardTitle>
        <CardAction>
          <Button variant="ghost" size="icon-sm" onClick={onClose}>
            <IconX />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="name">名稱</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="名稱"
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="description">備註（選填）</Label>
          <Input
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="備註"
          />
        </div>

        <Separator />

        <div className="grid gap-3">
          <Label>分帳明細</Label>
          {rows.map((row) => (
            <div key={row.key} className="flex items-center gap-2">
              <div className="flex-1">
                <MemberSelect
                  members={members}
                  value={row.debtorId}
                  onSelect={(id) => updateRow(row.key, "debtorId", id)}
                  excludeIds={[
                    user?.id ?? "",
                    ...selectedDebtorIds.filter((id) => id !== row.debtorId),
                  ]}
                />
              </div>
              <Input
                type="number"
                min="0"
                step="1"
                className="w-24"
                value={row.amount}
                onChange={(e) => updateRow(row.key, "amount", e.target.value)}
                placeholder="金額"
              />
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => removeRow(row.key)}
                disabled={rows.length <= 1}
              >
                <IconTrash />
              </Button>
            </div>
          ))}

          <Button variant="outline" size="sm" onClick={addRow}>
            <IconPlus />
            新增
          </Button>
        </div>
      </CardContent>
      <CardFooter className="justify-between">
        <span className="text-sm text-muted-foreground">合計：${total}</span>
        <div className="flex gap-2">
          {isEdit && (
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isPending}
            >
              刪除
            </Button>
          )}
          <Button onClick={handleSave} disabled={isPending}>
            {isPending ? "處理中..." : "儲存"}
          </Button>
        </div>
      </CardFooter>
    </Card>
  )
}
