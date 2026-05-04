export interface Member {
  id: string
  name: string | null
}

export interface ExpenseItem {
  id: string
  expense_id: string
  debtor_id: string
  amount: number
  created_at: string
}

export interface Expense {
  id: string
  creator_id: string
  name: string
  description: string | null
  created_at: string
  items: ExpenseItem[]
}

export interface Settlement {
  id: string
  period: string
  from_user_id: string
  to_user_id: string
  amount: number
  from_confirmed: boolean
  to_confirmed: boolean
  settled_at: string | null
  created_at: string
}

export interface BalanceExpense {
  id: string
  itemId: string
  name: string
  amount: number
  paidAt: string | null
  createdAt: string
}

export interface BalanceEntry {
  userId: string
  userName: string | null
  netAmount: number
  expenses: BalanceExpense[]
}

export interface Balances {
  iOwe: BalanceEntry[]
  owedToMe: BalanceEntry[]
}
