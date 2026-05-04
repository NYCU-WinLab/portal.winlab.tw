export const queryKeys = {
  members: {
    all: ["debt", "members"] as const,
  },
  expenses: {
    all: ["debt", "expenses"] as const,
    mine: () => [...queryKeys.expenses.all, "mine"] as const,
  },
  balances: {
    all: ["debt", "balances"] as const,
    mine: () => [...queryKeys.balances.all, "mine"] as const,
  },
  settlements: {
    all: ["debt", "settlements"] as const,
    mine: () => [...queryKeys.settlements.all, "mine"] as const,
  },
}
