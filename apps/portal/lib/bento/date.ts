export function parseOrderDate(orderId: string): string {
  if (orderId.length === 8 && /^\d{8}$/.test(orderId)) {
    const year = orderId.substring(0, 4)
    const month = orderId.substring(4, 6)
    const day = orderId.substring(6, 8)
    return `${year}/${month}/${day}`
  }
  return orderId
}

// Display date for an order. Prefers the real order_date column ("YYYY-MM-DD"
// from Postgres); falls back to parsing the legacy date-based id.
export function formatOrderDate(
  orderDate: string | null | undefined,
  fallbackId: string
): string {
  if (orderDate) {
    const [year, month, day] = orderDate.split("-")
    if (year && month && day) return `${year}/${month}/${day.substring(0, 2)}`
  }
  return parseOrderDate(fallbackId)
}

// Batch number for the Nth order of the same day. Ids are "YYYYMMDD" for the
// first order and "YYYYMMDD-2", "YYYYMMDD-3", ... for later ones.
export function orderBatchSuffix(orderId: string): string | null {
  const match = orderId.match(/^\d{8}-(\d+)$/)
  return match ? match[1]! : null
}
