"use client"

import { IconPlus } from "@tabler/icons-react"
import { useState } from "react"

import { Button } from "@workspace/ui/components/button"

import { useBalances } from "@/hooks/debt/use-balances"
import { useMembers } from "@/hooks/debt/use-members"
import { useMyExpenses } from "@/hooks/debt/use-expenses"
import type { Expense } from "@/lib/debt/types"

import { BalanceOverview } from "./balance-overview"
import { ExpenseCard } from "./expense-card"
import { ExpenseForm } from "./expense-form"

export function DebtHome() {
  const { data: balances } = useBalances()
  const { data: expenses } = useMyExpenses()
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

  return (
    <div className="grid gap-6">
      <section>
        <BalanceOverview
          iOwe={balances?.iOwe ?? []}
          owedToMe={balances?.owedToMe ?? []}
        />
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium">我的分帳</h2>
          {!showForm && (
            <Button size="sm" onClick={handleNew}>
              <IconPlus />
              新增
            </Button>
          )}
        </div>

        {showForm && (
          <div className="mb-4">
            <ExpenseForm expense={editingExpense} onClose={handleClose} />
          </div>
        )}

        {!expenses || expenses.length === 0 ? (
          <p className="text-xs text-muted-foreground">還沒有任何分帳紀錄</p>
        ) : (
          <div className="grid gap-1">
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
