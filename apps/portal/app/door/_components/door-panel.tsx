"use client"

import Image from "next/image"
import { useEffect, useState, useTransition } from "react"

import { toast } from "sonner"

import { cn } from "@workspace/ui/lib/utils"

import { getDoorState, openDoor } from "../actions"
import { playUnlockSound } from "./unlock-sound"

const POLL_MS = 5000
const RUN_MS = 2000
const OPENING_FRAME_MS = 150

type Phase = "idle" | "opening" | "opened"
type Glyph = "door" | "lock" | "unlock" | "runner" | "blocked" | "wrench"

const GLYPHS: Glyph[] = [
  "door",
  "lock",
  "unlock",
  "runner",
  "blocked",
  "wrench",
]

// The whole viewport is the button. Corners from PortalShell sit above it
// (z-50), so they stay clickable. Emoji are vendored Noto SVGs (public/door)
// so they stay crisp at any size, unlike the system emoji font's bitmaps.
export function DoorPanel({
  configured,
  initialOnline,
}: {
  configured: boolean
  initialOnline: boolean | null
}) {
  const [online, setOnline] = useState<boolean | null>(initialOnline)
  const [phase, setPhase] = useState<Phase>("idle")
  const [frame, setFrame] = useState(0)
  const [shake, setShake] = useState(0)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    if (!configured) return
    let cancelled = false
    const tick = async () => {
      const result = await getDoorState()
      if (cancelled) return
      setOnline(result.ok)
      if (!result.ok) setShake((n) => n + 1)
    }
    const id = setInterval(tick, POLL_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [configured])

  useEffect(() => {
    if (phase !== "opening") return
    const id = setInterval(() => setFrame((f) => f + 1), OPENING_FRAME_MS)
    return () => clearInterval(id)
  }, [phase])

  useEffect(() => {
    if (phase !== "opened") return
    const id = setTimeout(() => setPhase("idle"), RUN_MS)
    return () => clearTimeout(id)
  }, [phase])

  const busy = pending || phase === "opening"

  const unlock = () => {
    if (busy) return
    playUnlockSound()
    setPhase("opening")
    startTransition(async () => {
      const result = await openDoor()
      if (result.ok) {
        setOnline(true)
        setPhase("opened")
      } else {
        setOnline(false)
        setShake((n) => n + 1)
        setPhase("idle")
        toast.error(result.error)
      }
    })
  }

  const glyph: Glyph = !configured
    ? "wrench"
    : online === false
      ? "blocked"
      : phase === "opened"
        ? "runner"
        : phase === "opening"
          ? frame % 2 === 0
            ? "lock"
            : "unlock"
          : "door"

  const label = !configured
    ? "Door API is not configured"
    : online === false
      ? "Door controller unreachable"
      : phase === "opened"
        ? "Door opened"
        : phase === "opening"
          ? "Opening"
          : "Open the door"

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={!configured || busy}
      onClick={unlock}
      className={cn(
        "fixed inset-0 z-40 flex items-center justify-center overflow-hidden bg-background outline-none select-none",
        "focus-visible:ring-3 focus-visible:ring-ring/30 focus-visible:ring-inset",
        "disabled:cursor-default",
        configured && !busy && "cursor-pointer"
      )}
    >
      <span
        key={glyph === "blocked" ? shake : glyph === "runner" ? phase : 0}
        className={cn(
          "relative size-40 sm:size-64",
          glyph === "lock" || glyph === "unlock" ? "door-wiggle" : null,
          glyph === "runner" && "door-run",
          glyph === "blocked" && shake > 0 && "door-shake"
        )}
      >
        {GLYPHS.map((g) => (
          <Image
            key={g}
            src={`/door/${g}.svg`}
            alt=""
            fill
            unoptimized
            priority={g === "door"}
            draggable={false}
            className={cn(
              "object-contain",
              g === glyph ? "opacity-100" : "opacity-0"
            )}
          />
        ))}
      </span>
    </button>
  )
}
