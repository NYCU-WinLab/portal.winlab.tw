"use client"

import { IconChevronRight, IconPencil } from "@tabler/icons-react"

import { Button } from "@workspace/ui/components/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@workspace/ui/components/collapsible"

import type { Expense, Member } from "@/lib/debt/types"

interface ExpenseCardProps {
  expense: Expense
  members: Member[]
  onEdit: (expense: Expense) => void
  editable?: boolean
}

export function ExpenseCard({
  expense,
  members,
  onEdit,
  editable = true,
}: ExpenseCardProps) {
  const nameMap = new Map(members.map((m) => [m.id, m.name]))
  const total = expense.items.reduce((s, i) => s + Number(i.amount), 0)
  const date = new Date(expense.created_at).toLocaleDateString("zh-TW", {
    month: "numeric",
    day: "numeric",
  })

  return (
    <Collapsible>
      <div className="flex items-center gap-2">
        <CollapsibleTrigger className="flex flex-1 items-center justify-between rounded-md p-2 text-sm hover:bg-muted">
          <div className="flex items-center gap-2">
            <IconChevronRight className="size-4 transition-transform [[data-state=open]_&]:rotate-90" />
            <span>{expense.name}</span>
            <span className="text-xs text-muted-foreground">{date}</span>
          </div>
          <span className="font-medium">${total}</span>
        </CollapsibleTrigger>
        {editable && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onEdit(expense)}
          >
            <IconPencil />
          </Button>
        )}
      </div>
      <CollapsibleContent>
        <div className="ml-8 border-l pb-2 pl-3">
          {expense.items.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between py-1 text-xs text-muted-foreground"
            >
              <span>{nameMap.get(item.debtor_id) ?? "(unknown)"}</span>
              <span>${Number(item.amount)}</span>
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
