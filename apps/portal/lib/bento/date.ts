export function parseOrderDate(orderId: string): string {
  if (orderId.length === 8 && /^\d{8}$/.test(orderId)) {
    const year = orderId.substring(0, 4)
    const month = orderId.substring(4, 6)
    const day = orderId.substring(6, 8)
    return `${year}/${month}/${day}`
  }
  return orderId
}
