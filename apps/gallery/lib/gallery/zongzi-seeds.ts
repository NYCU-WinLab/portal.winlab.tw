export const GALLERY_ZONGZI_STICKER_SRC = "/seasonal/zongzi-sticker.png"

export const ZONGZI_RESPAWN_MS = 1500

export type PoppableZongziSpec = {
  id: string
  left: string
  top: string
  size: number
  rotate: number
  delay: number
}

/** Edge-biased spots — corners and margins, away from the photo column. */
export const POPPABLE_ZONGZI_SPOTS: Omit<PoppableZongziSpec, "id" | "delay">[] =
  [
    { left: "4%", top: "24%", size: 52, rotate: -12 },
    { left: "7%", top: "58%", size: 48, rotate: 8 },
    { left: "5%", top: "78%", size: 44, rotate: -6 },
    { left: "91%", top: "22%", size: 50, rotate: 10 },
    { left: "88%", top: "52%", size: 46, rotate: -8 },
    { left: "93%", top: "72%", size: 48, rotate: 6 },
    { left: "10%", top: "38%", size: 44, rotate: 14 },
    { left: "86%", top: "36%", size: 52, rotate: -10 },
  ]

/** Phone — four corners only, smaller, so polaroids stay tappable. */
export const MOBILE_POPPABLE_ZONGZI_SPOTS: Omit<
  PoppableZongziSpec,
  "id" | "delay"
>[] = [
  { left: "3%", top: "17%", size: 40, rotate: -10 },
  { left: "4%", top: "83%", size: 36, rotate: 8 },
  { left: "91%", top: "18%", size: 38, rotate: 12 },
  { left: "90%", top: "82%", size: 36, rotate: -8 },
  { left: "6%", top: "48%", size: 34, rotate: 6 },
  { left: "88%", top: "50%", size: 34, rotate: -6 },
]

export function getPoppableZongziSpotPool(isMobile: boolean) {
  return isMobile ? MOBILE_POPPABLE_ZONGZI_SPOTS : POPPABLE_ZONGZI_SPOTS
}

export type ZongziBurstParticle = {
  tx: number
  ty: number
  size: number
  delay: number
  glyph: "image" | "emoji"
}

export function zongziSpotKey(spot: { left: string; top: string }) {
  return `${spot.left}-${spot.top}`
}

function pickFromPool<T>(pool: T[], count: number, random: () => number): T[] {
  const copy = [...pool]
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j]!, copy[i]!]
  }
  return copy.slice(0, Math.min(count, copy.length))
}

export function pickPoppableZongziCount(random: () => number = Math.random) {
  return 2 + Math.floor(random() * 2)
}

export function pickPoppableZongzi(
  count: number,
  random: () => number = Math.random,
  isMobile = false
): PoppableZongziSpec[] {
  const pool = getPoppableZongziSpotPool(isMobile)
  return pickFromPool(pool, count, random).map((spot, index) => ({
    ...spot,
    id: `zongzi-${index}-${spot.left}-${spot.top}`,
    delay: index * 0.2,
  }))
}

export function spawnPoppableZongzi(
  occupied: ReadonlySet<string>,
  random: () => number = Math.random,
  idSuffix = `${Date.now()}-${Math.floor(random() * 1_000_000)}`,
  isMobile = false
): PoppableZongziSpec | null {
  const pool = getPoppableZongziSpotPool(isMobile)
  const available = pool.filter((spot) => !occupied.has(zongziSpotKey(spot)))
  if (available.length === 0) return null

  const spot = available[Math.floor(random() * available.length)]!
  return {
    ...spot,
    id: `zongzi-${idSuffix}`,
    delay: 0,
  }
}

export function makeZongziBurstParticles(
  count = 10,
  random: () => number = Math.random
): ZongziBurstParticle[] {
  return Array.from({ length: count }, (_, index) => {
    const angle = random() * Math.PI * 2
    const distance = 36 + random() * 52
    return {
      tx: Math.cos(angle) * distance,
      ty: Math.sin(angle) * distance,
      size: 14 + Math.floor(random() * 12),
      delay: index * 0.02,
      glyph: random() > 0.45 ? "emoji" : "image",
    }
  })
}
