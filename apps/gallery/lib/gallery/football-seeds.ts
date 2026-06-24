import {
  makeZongziBurstParticles,
  pickPoppableZongzi,
  pickPoppableZongziCount,
  spawnPoppableZongzi,
  zongziSpotKey,
  type PoppableZongziSpec,
} from "@/lib/gallery/zongzi-seeds"

export const FOOTBALL_RESPAWN_MS = 1500

export type PoppableFootballSpec = PoppableZongziSpec

export type FootballKickVector = {
  tx: number
  ty: number
}

export function footballSpotKey(spot: { left: string; top: string }) {
  return zongziSpotKey(spot)
}

export function pickPoppableFootballCount(random: () => number = Math.random) {
  return pickPoppableZongziCount(random)
}

export function pickPoppableFootballs(
  count: number,
  random: () => number = Math.random,
  isMobile = false
): PoppableFootballSpec[] {
  return pickPoppableZongzi(count, random, isMobile).map((seed, index) => ({
    ...seed,
    id: `football-${index}-${seed.left}-${seed.top}`,
  }))
}

export function spawnPoppableFootball(
  occupied: ReadonlySet<string>,
  random: () => number = Math.random,
  idSuffix = `${Date.now()}-${Math.floor(random() * 1_000_000)}`,
  isMobile = false
): PoppableFootballSpec | null {
  const next = spawnPoppableZongzi(occupied, random, idSuffix, isMobile)
  if (!next) return null
  return { ...next, id: `football-${idSuffix}` }
}

export function makeFootballKickVector(
  random: () => number = Math.random
): FootballKickVector {
  const angle = random() * Math.PI * 2
  const distance = 72 + random() * 88
  return {
    tx: Math.cos(angle) * distance,
    ty: Math.sin(angle) * distance,
  }
}

/** Reuse burst layout for confetti-style ⚽ scatter on kick. */
export function makeFootballKickParticles(
  count = 8,
  random: () => number = Math.random
) {
  return makeZongziBurstParticles(count, random).map((particle) => ({
    ...particle,
    glyph: "emoji" as const,
  }))
}
