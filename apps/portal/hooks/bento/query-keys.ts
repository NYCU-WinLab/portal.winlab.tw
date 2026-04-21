export const queryKeys = {
  orders: {
    all: ["bento", "orders"] as const,
    list: () => [...queryKeys.orders.all, "list"] as const,
    detail: (id: string) => [...queryKeys.orders.all, id] as const,
  },
  menus: {
    all: ["bento", "menus"] as const,
    detail: (id: string) => [...queryKeys.menus.all, id] as const,
    stats: (id: string) => [...queryKeys.menus.all, id, "stats"] as const,
  },
  users: {
    all: ["bento", "users"] as const,
  },
  admin: {
    status: ["bento", "admin"] as const,
  },
}
