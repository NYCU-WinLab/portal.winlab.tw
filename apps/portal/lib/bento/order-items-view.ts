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

// Formats an item's timestamp as "MM/DD HH:mm" in Taipei time. Taiwan is a
// fixed UTC+8 with no DST, so shifting the epoch by 8h and reading UTC parts is
// exact — and unlike toLocaleString it's independent of the runtime's timezone
// and ICU version, so it stays correct on servers and deterministic in tests.
export function formatItemDateTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  const taipei = new Date(date.getTime() + 8 * 60 * 60 * 1000)
  const mm = String(taipei.getUTCMonth() + 1).padStart(2, "0")
  const dd = String(taipei.getUTCDate()).padStart(2, "0")
  const hh = String(taipei.getUTCHours()).padStart(2, "0")
  const min = String(taipei.getUTCMinutes()).padStart(2, "0")
  return `${mm}/${dd} ${hh}:${min}`
}
