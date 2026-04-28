// Shapes returned by public.get_profile_stats(uuid). Mirrors the SQL —
// keep them in lockstep when adding new fields.

export type BentoStats = {
  total_orders: number
  total_spent: number
  unique_items: number
  top_item: { name: string; restaurant_name: string; count: number } | null
}

export type LeaveStats = {
  total_days: number
  first_date: string | null
}

export type ApproveStats = {
  created_count: number
  signed_count: number
  avg_sign_delay_seconds: number
}

export type TripStats = {
  trips_joined: number
  files_uploaded: number
  total_size_bytes: number
}

export type ProfileStats = {
  bento: BentoStats
  leave: LeaveStats
  approve: ApproveStats
  trip: TripStats
}

// "All-citizen" anchor goods: things every Taiwanese knows the price of,
// rotated on each render so the conversion stays fresh. Prices are NTD
// and rounded to whole units the calculator can divide cleanly.
export type ReferenceProduct = {
  name: string
  price: number
  emoji: string
  unit: string
}

export const REFERENCE_PRODUCTS: ReferenceProduct[] = [
  { name: "7-11 茶葉蛋", price: 10, emoji: "🥚", unit: "顆" },
  { name: "大樂透", price: 50, emoji: "🎰", unit: "注" },
  { name: "麥當勞大麥克", price: 75, emoji: "🍔", unit: "顆" },
]

export function pickReferenceProduct(): ReferenceProduct {
  const idx = Math.floor(Math.random() * REFERENCE_PRODUCTS.length)
  return REFERENCE_PRODUCTS[idx]!
}

// "你的便當錢可以買 N 顆茶葉蛋" — round down so we don't lie upward.
export function spendInReference(spent: number, product: ReferenceProduct) {
  return Math.floor(spent / product.price)
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

export function formatDelay(seconds: number): string {
  if (seconds <= 0) return "—"
  const hours = seconds / 3600
  if (hours < 1) return `${Math.round(seconds / 60)} 分`
  if (hours < 48) return `${hours.toFixed(1)} 小時`
  return `${(hours / 24).toFixed(1)} 天`
}

// Days → relatable scale. The 9-day cycle is ~Taiwan-round-the-island
// by bicycle, the canonical local reference.
export function leaveFlavor(days: number): string {
  if (days === 0) return "今年還沒請過假，是個工作機器"
  if (days < 3) return `${days} 天，還在發育期`
  const laps = (days / 9).toFixed(1)
  return `${days} 天，可以單車環島 ${laps} 圈`
}
