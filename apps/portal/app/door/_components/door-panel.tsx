"use client"

import { useEffect, useState, useTransition } from "react"

import { toast } from "sonner"

import { cn } from "@workspace/ui/lib/utils"

import { getDoorState, openDoor } from "../actions"

const POLL_MS = 5000
const FLASH_MS = 2000

type Phase = "idle" | "opening" | "opened"

// The whole viewport is the button. Corners from PortalShell sit above it
// (z-50), so they stay clickable.
export function DoorPanel({
  configured,
  initialOnline,
}: {
  configured: boolean
  initialOnline: boolean | null
}) {
  const [online, setOnline] = useState<boolean | null>(initialOnline)
  const [phase, setPhase] = useState<Phase>("idle")
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    if (!configured) return
    let cancelled = false
    const tick = async () => {
      const result = await getDoorState()
      if (!cancelled) setOnline(result.ok)
    }
    const id = setInterval(tick, POLL_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [configured])

  useEffect(() => {
    if (phase !== "opened") return
    const id = setTimeout(() => setPhase("idle"), FLASH_MS)
    return () => clearTimeout(id)
  }, [phase])

  const busy = pending || phase === "opening"

  const unlock = () => {
    if (busy) return
    setPhase("opening")
    startTransition(async () => {
      const result = await openDoor()
      if (result.ok) {
        setOnline(true)
        setPhase("opened")
      } else {
        setOnline(false)
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
          ? "🔓"
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

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={!configured || busy}
      onClick={unlock}
      className={cn(
        "fixed inset-0 z-40 flex items-center justify-center bg-background outline-none select-none",
        "focus-visible:ring-3 focus-visible:ring-ring/30 focus-visible:ring-inset",
        "disabled:cursor-default",
        configured && !busy && "cursor-pointer"
      )}
    >
      <span
        className={cn(
          "text-[8rem] leading-none transition-transform duration-200 sm:text-[12rem]",
          phase === "opening" && "scale-90",
          phase === "opened" && "scale-110"
        )}
      >
        {emoji}
      </span>
    </button>
  )
}
