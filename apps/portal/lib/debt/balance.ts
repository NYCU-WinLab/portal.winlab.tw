import type { BalanceEntry, BalanceExpense, Balances } from "@/lib/debt/types"

interface ExpenseItemRow {
  id: string
  debtor_id: string
  amount: number
  paid_at: string | null
  expense: {
    id: string
    name: string
    creator_id: string
    created_at: string
  }
}

// Settlement period is "YYYY-MM"; the next month's first instant is when the
// post-settlement window starts. If we've never settled, look back to epoch.
export function getUnsettledPeriodStart(latestPeriod: string | null): string {
  if (!latestPeriod) return "1970-01-01T00:00:00Z"

  const match = latestPeriod.match(/^(\d{4})-(\d{2})$/)
  if (!match) return "1970-01-01T00:00:00Z"

  const year = Number(match[1])
  const month = Number(match[2])
  const nextMonth = month === 12 ? 1 : month + 1
  const nextYear = month === 12 ? year + 1 : year
  return `${nextYear}-${String(nextMonth).padStart(2, "0")}-01T00:00:00Z`
}

export function computeBalances(
  items: ExpenseItemRow[],
  userId: string,
  nameMap: Map<string, string | null>
): Balances {
  const balanceMap = new Map<
    string,
    { net: number; total: number; expenses: Map<string, BalanceExpense> }
  >()

  for (const item of items) {
    const { expense } = item
    const amount = Number(item.amount)
    const isPaid = !!item.paid_at
    let otherId: string
    let sign: number

    if (expense.creator_id === userId) {
      otherId = item.debtor_id
      sign = 1
    } else if (item.debtor_id === userId) {
      otherId = expense.creator_id
      sign = -1
    } else {
      continue
    }

    const entry = balanceMap.get(otherId) ?? {
      net: 0,
      total: 0,
      expenses: new Map(),
    }
    entry.total += sign * amount
    if (!isPaid) {
      entry.net += sign * amount
    }

    entry.expenses.set(`${expense.id}:${item.id}`, {
      id: expense.id,
      itemId: item.id,
      name: expense.name,
      amount,
      paidAt: item.paid_at,
      createdAt: expense.created_at,
    })
    balanceMap.set(otherId, entry)
  }

  const iOwe: BalanceEntry[] = []
  const owedToMe: BalanceEntry[] = []

  for (const [uid, { net, total, expenses }] of balanceMap) {
    if (total === 0) continue
    const entry: BalanceEntry = {
      userId: uid,
      userName: nameMap.get(uid) ?? null,
      netAmount: Math.abs(net),
      expenses: Array.from(expenses.values()),
    }
    if (total > 0) owedToMe.push(entry)
    else iOwe.push(entry)
  }

  iOwe.sort((a, b) => b.netAmount - a.netAmount)
  owedToMe.sort((a, b) => b.netAmount - a.netAmount)

  return { iOwe, owedToMe }
}
