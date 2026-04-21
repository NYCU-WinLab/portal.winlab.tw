interface MenuItemLike {
  name: string
  type?: string | null
}

export interface MenuItemGroup<T extends MenuItemLike> {
  type: string
  items: T[]
}

export function groupMenuItems<T extends MenuItemLike>(
  items: T[]
): MenuItemGroup<T>[] {
  const grouped = new Map<string, T[]>()

  for (const item of items) {
    const type = item.type?.trim() || "其他"
    if (!grouped.has(type)) {
      grouped.set(type, [])
    }
    grouped.get(type)!.push(item)
  }

  return Array.from(grouped.entries())
    .sort(([a], [b]) => {
      if (a === "其他") return 1
      if (b === "其他") return -1
      return a.localeCompare(b)
    })
    .map(([type, items]) => ({
      type,
      items: items.slice().sort((a, b) => a.name.localeCompare(b.name)),
    }))
}

export function sortMenuItemsByType<
  T extends MenuItemLike & { price: number | string },
>(items: T[]): T[] {
  return items.slice().sort((a, b) => {
    const typeA = a.type?.trim() || ""
    const typeB = b.type?.trim() || ""
    if (typeA && typeB && typeA !== typeB) return typeA.localeCompare(typeB)
    if (typeA && !typeB) return -1
    if (!typeA && typeB) return 1
    const priceA =
      typeof a.price === "number" ? a.price : parseFloat(String(a.price)) || 0
    const priceB =
      typeof b.price === "number" ? b.price : parseFloat(String(b.price)) || 0
    return priceA - priceB
  })
}
