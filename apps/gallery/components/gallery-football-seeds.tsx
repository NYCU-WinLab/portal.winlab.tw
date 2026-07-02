"use client"

import type { CSSProperties, MouseEvent } from "react"
import { useCallback, useEffect, useState } from "react"

import {
  FOOTBALL_RESPAWN_MS,
  footballSpotKey,
  makeFootballKickParticles,
  makeFootballKickVector,
  pickPoppableFootballCount,
  pickPoppableFootballs,
  spawnPoppableFootball,
  type FootballKickVector,
  type PoppableFootballSpec,
} from "@/lib/gallery/football-seeds"

const MOBILE_MQ = "(max-width: 767px)"

function useMobileFootballLayout() {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const media = window.matchMedia(MOBILE_MQ)
    const sync = () => setIsMobile(media.matches)
    sync()
    media.addEventListener("change", sync)
    return () => media.removeEventListener("change", sync)
  }, [])

  return isMobile
}

type ActiveKickBurst = {
  id: string
  x: number
  y: number
  particles: ReturnType<typeof makeFootballKickParticles>
}

function FootballKickBurst({ burst }: { burst: ActiveKickBurst }) {
  return (
    <div
      className="gallery-football-burst pointer-events-none"
      style={{ left: burst.x, top: burst.y }}
      aria-hidden
    >
      {burst.particles.map((particle, index) => (
        <span
          key={`${burst.id}-${index}`}
          className="gallery-football-burst-particle"
          style={
            {
              "--tx": `${particle.tx}px`,
              "--ty": `${particle.ty}px`,
              "--delay": `${particle.delay}s`,
              fontSize: particle.size,
            } as CSSProperties
          }
        >
          ⚽
        </span>
      ))}
    </div>
  )
}

export function GalleryFootballSeeds() {
  const isMobile = useMobileFootballLayout()
  const [balls, setBalls] = useState<PoppableFootballSpec[]>([])
  const [bursts, setBursts] = useState<ActiveKickBurst[]>([])
  const [kickingIds, setKickingIds] = useState<Set<string>>(() => new Set())
  const [kickVectors, setKickVectors] = useState<
    Record<string, FootballKickVector>
  >({})

  useEffect(() => {
    setBalls(
      pickPoppableFootballs(pickPoppableFootballCount(), Math.random, isMobile)
    )
  }, [isMobile])

  const removeBurst = useCallback((id: string) => {
    setBursts((current) => current.filter((burst) => burst.id !== id))
  }, [])

  const respawnFootball = useCallback(
    (removedId: string) => {
      setBalls((current) => {
        const remaining = current.filter((item) => item.id !== removedId)
        const occupied = new Set(remaining.map(footballSpotKey))
        const next = spawnPoppableFootball(
          occupied,
          Math.random,
          undefined,
          isMobile
        )
        return next ? [...remaining, next] : remaining
      })
      setKickingIds((current) => {
        const next = new Set(current)
        next.delete(removedId)
        return next
      })
      setKickVectors((current) => {
        const next = { ...current }
        delete next[removedId]
        return next
      })
    },
    [isMobile]
  )

  const kickFootball = useCallback(
    (event: MouseEvent<HTMLButtonElement>, id: string) => {
      if (kickingIds.has(id)) return

      const rect = event.currentTarget.getBoundingClientRect()
      const kick = makeFootballKickVector()
      const burstId = `${id}-burst-${Date.now()}`
      const burst: ActiveKickBurst = {
        id: burstId,
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
        particles: makeFootballKickParticles(),
      }

      setKickVectors((current) => ({ ...current, [id]: kick }))
      setKickingIds((current) => new Set(current).add(id))
      setBursts((current) => [...current, burst])
      window.setTimeout(() => removeBurst(burstId), 680)
      window.setTimeout(() => respawnFootball(id), FOOTBALL_RESPAWN_MS)
    },
    [kickingIds, removeBurst, respawnFootball]
  )

  return (
    <div className="gallery-football-field pointer-events-none fixed inset-0 z-[35]">
      {balls.map((seed) => {
        const kick = kickVectors[seed.id]
        return (
          <button
            key={seed.id}
            type="button"
            aria-label="Kick the football"
            className="gallery-football-pop pointer-events-auto"
            style={
              {
                left: seed.left,
                top: seed.top,
                "--seed-rotate": `${seed.rotate}deg`,
                "--seed-delay": `${seed.delay}s`,
                "--kick-tx": kick ? `${kick.tx}px` : "0px",
                "--kick-ty": kick ? `${kick.ty}px` : "0px",
              } as CSSProperties
            }
            data-kicking={kickingIds.has(seed.id) ? "true" : undefined}
            onClick={(event) => kickFootball(event, seed.id)}
          >
            <span
              className="gallery-football-pop-glyph"
              aria-hidden
              style={{ fontSize: seed.size * 0.9 }}
            >
              ⚽
            </span>
          </button>
        )
      })}
      {bursts.map((burst) => (
        <FootballKickBurst key={burst.id} burst={burst} />
      ))}
    </div>
  )
}
