"use client"

import type { CSSProperties, MouseEvent } from "react"
import { useCallback, useEffect, useState } from "react"
import Image from "next/image"

import {
  GALLERY_ZONGZI_STICKER_SRC,
  makeZongziBurstParticles,
  pickPoppableZongzi,
  pickPoppableZongziCount,
  spawnPoppableZongzi,
  ZONGZI_RESPAWN_MS,
  zongziSpotKey,
  type PoppableZongziSpec,
  type ZongziBurstParticle,
} from "@/lib/gallery/zongzi-seeds"

const MOBILE_MQ = "(max-width: 767px)"

function useMobileZongziLayout() {
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

type ActiveBurst = {
  id: string
  x: number
  y: number
  particles: ZongziBurstParticle[]
}

function ZongziBurst({ burst }: { burst: ActiveBurst }) {
  return (
    <div
      className="gallery-zongzi-burst pointer-events-none"
      style={{ left: burst.x, top: burst.y }}
      aria-hidden
    >
      {burst.particles.map((particle, index) => (
        <span
          key={`${burst.id}-${index}`}
          className="gallery-zongzi-burst-particle"
          style={
            {
              "--tx": `${particle.tx}px`,
              "--ty": `${particle.ty}px`,
              "--delay": `${particle.delay}s`,
              width: particle.size,
              height: particle.size,
              fontSize: particle.size,
            } as CSSProperties
          }
        >
          {particle.glyph === "emoji" ? (
            "🫔"
          ) : (
            <Image
              src={GALLERY_ZONGZI_STICKER_SRC}
              alt=""
              width={particle.size}
              height={particle.size}
              aria-hidden
              className="h-full w-full object-contain"
            />
          )}
        </span>
      ))}
    </div>
  )
}

export function GalleryZongziSeeds() {
  const isMobile = useMobileZongziLayout()
  const [zongzi, setZongzi] = useState<PoppableZongziSpec[]>([])
  const [bursts, setBursts] = useState<ActiveBurst[]>([])
  const [poppingIds, setPoppingIds] = useState<Set<string>>(() => new Set())

  useEffect(() => {
    setZongzi(
      pickPoppableZongzi(pickPoppableZongziCount(), Math.random, isMobile)
    )
  }, [isMobile])

  const removeBurst = useCallback((id: string) => {
    setBursts((current) => current.filter((burst) => burst.id !== id))
  }, [])

  const respawnZongzi = useCallback(
    (removedId: string) => {
      setZongzi((current) => {
        const remaining = current.filter((item) => item.id !== removedId)
        const occupied = new Set(remaining.map(zongziSpotKey))
        const next = spawnPoppableZongzi(
          occupied,
          Math.random,
          undefined,
          isMobile
        )
        return next ? [...remaining, next] : remaining
      })
      setPoppingIds((current) => {
        const next = new Set(current)
        next.delete(removedId)
        return next
      })
    },
    [isMobile]
  )

  const popZongzi = useCallback(
    (event: MouseEvent<HTMLButtonElement>, id: string) => {
      if (poppingIds.has(id)) return

      const rect = event.currentTarget.getBoundingClientRect()
      const burstId = `${id}-burst-${Date.now()}`
      const burst: ActiveBurst = {
        id: burstId,
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
        particles: makeZongziBurstParticles(),
      }

      setPoppingIds((current) => new Set(current).add(id))
      setBursts((current) => [...current, burst])
      window.setTimeout(() => removeBurst(burstId), 720)
      window.setTimeout(() => respawnZongzi(id), ZONGZI_RESPAWN_MS)
    },
    [poppingIds, removeBurst, respawnZongzi]
  )

  return (
    <div className="gallery-zongzi-field pointer-events-none fixed inset-0 z-[35]">
      {zongzi.map((seed) => (
        <button
          key={seed.id}
          type="button"
          aria-label="Pop the zongzi"
          className="gallery-zongzi-pop pointer-events-auto"
          style={
            {
              left: seed.left,
              top: seed.top,
              "--seed-rotate": `${seed.rotate}deg`,
              "--seed-delay": `${seed.delay}s`,
            } as CSSProperties
          }
          data-popping={poppingIds.has(seed.id) ? "true" : undefined}
          onClick={(event) => popZongzi(event, seed.id)}
        >
          <Image
            src={GALLERY_ZONGZI_STICKER_SRC}
            alt=""
            width={seed.size}
            height={seed.size}
            aria-hidden
            className="gallery-zongzi-pop-image object-contain"
            style={{ width: seed.size, height: seed.size }}
            draggable={false}
          />
        </button>
      ))}
      {bursts.map((burst) => (
        <ZongziBurst key={burst.id} burst={burst} />
      ))}
    </div>
  )
}
