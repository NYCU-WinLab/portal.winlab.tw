"use client"

import { useEffect, useState, useTransition } from "react"

import { toast } from "sonner"

import { cn } from "@workspace/ui/lib/utils"

import { getDoorState, openDoor } from "../actions"
import { playUnlockSound } from "./unlock-sound"

const POLL_MS = 5000
const OPENED_MS = 2000
const FRAME_MS = 500

// Frames cycled while opening; opened is a single glyph with the wiggle.
const OPENING_FRAMES = ["🔒", "🔓"]

type Phase = "idle" | "opening" | "opened"

// The whole viewport is the button. Corners from PortalShell sit above it
// (z-50), so they stay clickable. Native emoji on purpose; the large size is
// capped at 10rem (160 px) so Apple's bitmap emoji renders 1:1 and stays sharp.
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
    const id = setInterval(() => setFrame((f) => f + 1), FRAME_MS)
    return () => clearInterval(id)
  }, [phase])

  useEffect(() => {
    if (phase !== "opened") return
    const id = setTimeout(() => setPhase("idle"), OPENED_MS)
    return () => clearTimeout(id)
  }, [phase])

  const busy = pending || phase === "opening"

  const unlock = () => {
    if (busy) return
    playUnlockSound()
    setFrame(0)
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

  const emoji = !configured
    ? "🔧"
    : online === false
      ? "🚫"
      : phase === "opened"
        ? "🏃"
        : phase === "opening"
          ? OPENING_FRAMES[frame % OPENING_FRAMES.length]
          : "🚪"

  const label = !configured
    ? "Door API is not configured"
    : online === false
      ? "Door controller unreachable"
      : phase === "opened"
        ? "Door opened"
        : phase === "opening"
          ? "Opening"
          : "Open the door"

  const offline = configured && online === false

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
        key={offline ? shake : 0}
        className={cn(
          "text-[8rem] leading-none sm:text-[10rem]",
          !offline && phase !== "idle" && "door-wiggle",
          offline && shake > 0 && "door-shake"
        )}
      >
        {emoji}
      </span>
    </button>
  )
}
