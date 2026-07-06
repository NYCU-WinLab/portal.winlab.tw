// Pure view helpers for the order-items list. React-free / I/O-free so the
// grouping, ordering, and time formatting can be unit-tested directly
// (see order-items-view.test.ts).

export interface ViewOrderItem {
  id: string
  created_at: string
  menu_item_id: string
  no_sauce: boolean
  additional: number | null
  user_id: string | null
  anonymous_name?: string | null
  anonymous_contact?: string | null
  menu_items: {
    name: string
    price: number
  } | null
  user: {
    name: string | null
    email?: string
  } | null
  selected_options?: {
    group_name: string
    label: string
    price_delta: number
  }[]
}

export interface PersonGroup {
  key: string
  userId: string | null
  userName: string | null
  contact: string | null
  items: ViewOrderItem[]
  total: number
}

export function itemPrice(item: ViewOrderItem): number {
  const options = (item.selected_options ?? []).reduce(
    (sum, opt) => sum + opt.price_delta,
    0
  )
  return (item.menu_items?.price ?? 0) + options
}

export function itemPersonName(item: ViewOrderItem): string {
  return item.user?.name || item.anonymous_name || "未知"
}

function byTimeAsc(a: ViewOrderItem, b: ViewOrderItem): number {
  return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
}

// Groups items by person (logged-in user id, or an anon:<name> key), with the
// current user pinned first and remaining groups by descending spend — matching
// the existing list behaviour. Items inside each group are time-ordered.
export function groupByPerson(
  items: ViewOrderItem[],
  currentUserId?: string
): PersonGroup[] {
  const groups = new Map<string, PersonGroup>()

  for (const item of items) {
    const key = item.user_id ?? `anon:${item.anonymous_name ?? "unknown"}`
    let group = groups.get(key)
    if (!group) {
      group = {
        key,
        userId: item.user_id,
        userName: item.user?.name || item.anonymous_name || null,
        contact: item.anonymous_contact ?? null,
        items: [],
        total: 0,
      }
      groups.set(key, group)
    }
    group.items.push(item)
    group.total += itemPrice(item)
  }

  for (const group of groups.values()) {
    group.items.sort(byTimeAsc)
  }

  return Array.from(groups.values()).sort((a, b) => {
    if (currentUserId) {
      if (a.key === currentUserId) return -1
      if (b.key === currentUserId) return 1
    }
    return b.total - a.total
  })
}

// Flattens all items into a single chronological list.
export function sortByTime(
  items: ViewOrderItem[],
  direction: "asc" | "desc" = "asc"
): ViewOrderItem[] {
  const sorted = [...items].sort(byTimeAsc)
  return direction === "desc" ? sorted.reverse() : sorted
}

// Formats an item's timestamp as HH:mm in Taipei time, independent of the
// runtime's timezone so it stays correct on servers and deterministic in tests.
export function formatItemTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  return date.toLocaleTimeString("zh-TW", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Taipei",
  })
}
