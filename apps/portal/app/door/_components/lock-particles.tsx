"use client"

import { useEffect, useState, type CSSProperties } from "react"

const SPAWN_MS = 70
const MAX_PARTICLES = 48
const FRAMES = ["🔒", "🔓"]

type Particle = {
  id: number
  emoji: string
  dx: number
  up: number
  spin: number
  duration: number
  size: number
}

let seq = 0

function makeParticle(): Particle {
  return {
    id: seq++,
    emoji: FRAMES[Math.floor(Math.random() * FRAMES.length)]!,
    dx: (Math.random() * 2 - 1) * 280,
    up: -(160 + Math.random() * 240),
    spin: (Math.random() * 2 - 1) * 180,
    duration: 1200 + Math.random() * 500,
    size: 22 + Math.random() * 26,
  }
}

// Keeps spawning while `active`; particles already in the air finish their
// arc after it turns off instead of vanishing mid-flight.
export function LockParticles({ active }: { active: boolean }) {
  const [particles, setParticles] = useState<Particle[]>([])

  useEffect(() => {
    if (!active) return
    const spawner = setInterval(() => {
      const p = makeParticle()
      setParticles((list) => [...list.slice(-(MAX_PARTICLES - 1)), p])
      setTimeout(() => {
        setParticles((list) => list.filter((x) => x.id !== p.id))
      }, p.duration + 50)
    }, SPAWN_MS)
    // Only the spawner stops here. Each particle's removal timeout keeps
    // running so it lands instead of vanishing when spawning stops.
    return () => clearInterval(spawner)
  }, [active])

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      {particles.map((p) => (
        <span
          key={p.id}
          className="door-particle"
          style={
            {
              "--dx": `${p.dx}px`,
              "--up": `${p.up}px`,
              "--spin": `${p.spin}deg`,
              "--t": `${p.duration}ms`,
              fontSize: p.size,
            } as CSSProperties
          }
        >
          <span>{p.emoji}</span>
        </span>
      ))}
    </div>
  )
}
