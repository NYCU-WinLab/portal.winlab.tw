"use client"

import { IconPlus } from "@tabler/icons-react"
import { useState } from "react"

import { Button } from "@workspace/ui/components/button"
import { Skeleton } from "@workspace/ui/components/skeleton"

import { useBalances } from "@/hooks/debt/use-balances"
import { useMembers } from "@/hooks/debt/use-members"
import { useMyExpenses } from "@/hooks/debt/use-expenses"
import type { Expense } from "@/lib/debt/types"

import { BalanceOverview } from "./balance-overview"
import { ExpenseCard } from "./expense-card"
import { ExpenseForm } from "./expense-form"

export function DebtHome() {
  const { data: balances, isLoading: balancesLoading } = useBalances()
  const { data: expenses, isLoading: expensesLoading } = useMyExpenses()
  const { data: members = [] } = useMembers()

  const [showForm, setShowForm] = useState(false)
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null)

  const handleEdit = (expense: Expense) => {
    setEditingExpense(expense)
    setShowForm(true)
  }

  const handleNew = () => {
    setEditingExpense(null)
    setShowForm(true)
  }

  const handleClose = () => {
    setShowForm(false)
    setEditingExpense(null)
  }

  if ((balancesLoading || expensesLoading) && !balances && !expenses) {
    return (
      <div className="flex flex-col gap-10">
        <div className="flex flex-col gap-1">
          <Skeleton className="h-6 w-16 rounded-md" />
          <Skeleton className="h-4 w-72 rounded-md" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </div>
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-10">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="font-medium">Debt</h1>
          <p className="text-sm text-muted-foreground">
            實驗室分帳。每月 10 號自動產生上個月的淨額結算。
          </p>
        </div>
        {!showForm && (
          <Button size="sm" onClick={handleNew}>
            <IconPlus />
            新增分帳
          </Button>
        )}
      </div>

      <BalanceOverview
        iOwe={balances?.iOwe ?? []}
        owedToMe={balances?.owedToMe ?? []}
      />

      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-medium">我的分帳</h2>

        {showForm && (
          <ExpenseForm expense={editingExpense} onClose={handleClose} />
        )}

        {!expenses || expenses.length === 0 ? (
          <p className="text-xs text-muted-foreground">還沒有任何分帳紀錄</p>
        ) : (
          <div className="flex flex-col gap-1">
            {expenses.map((expense) => (
              <ExpenseCard
                key={expense.id}
                expense={expense}
                members={members}
                onEdit={handleEdit}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
