"use client"

import { useCallback, useEffect, useRef, useState, useTransition } from "react"

import { toast } from "sonner"

import { cn } from "@workspace/ui/lib/utils"

import {
  readLaunchKind,
  shouldAutoOpen,
  shouldOpenOnResume,
} from "@/lib/door/auto-open"

import { getDoorState, openDoor } from "../actions"
import { LockParticles } from "./lock-particles"
import { playUnlockSound } from "./unlock-sound"

const POLL_MS = 5000
const OPENED_MS = 2000
const FRAME_MS = 500

// Frames cycled while opening; opened is a single still glyph.
const OPENING_FRAMES = ["🔒", "🔓"]

type Phase = "idle" | "opening" | "opened"

// The whole viewport is the button. Corners from PortalShell sit above it
// (z-50), so they stay clickable. Native emoji on purpose; the large size is
// capped at 10rem (160 px) so Apple's bitmap emoji renders 1:1 and stays sharp.
export function DoorPanel({
  configured,
  initialOnline,
  autoOpen = false,
}: {
  configured: boolean
  initialOnline: boolean | null
  // Set by /door/go, the route the installed home-screen icon launches. The
  // tap on the icon is the tap that opens the door; the panel still renders so
  // a failed open leaves a button to press again.
  autoOpen?: boolean
}) {
  const [online, setOnline] = useState<boolean | null>(initialOnline)
  const [phase, setPhase] = useState<Phase>("idle")
  const [frame, setFrame] = useState(0)
  const [shake, setShake] = useState(0)
  const [pending, startTransition] = useTransition()
  const autoFired = useRef(false)

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

  // The open sequence itself, with no guard on it. Stable so the auto-open
  // effect below can depend on it honestly; every setter and startTransition
  // already is.
  const runOpen = useCallback(() => {
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
  }, [startTransition])

  const unlock = () => {
    if (busy) return
    runOpen()
  }

  // One shot, and only for a launch the person actually started — see
  // lib/door/auto-open.ts for why the navigation type is the thing we trust.
  // The ref keeps it to once per launch; a door is not something to open twice
  // because state changed. Scheduled rather than called inline so the first
  // paint lands before the opening animation starts, and so the effect body
  // never cascades renders.
  //
  // playUnlockSound() stays silent on this path — there is no tap handler for
  // iOS to start the AudioContext in. The door still opens.
  useEffect(() => {
    if (!autoOpen || autoFired.current || !configured) return
    if (!shouldAutoOpen(readLaunchKind(performance))) return
    autoFired.current = true
    const id = setTimeout(runOpen, 0)
    return () => clearTimeout(id)
  }, [autoOpen, configured, runOpen])

  // The effect above only fires when something mounts. Tapping the icon of an
  // app iOS still holds in memory mounts nothing — it just brings this page
  // back to the front — so that is the other half of "the icon is the door
  // button". A ref carries the idle check because the listener outlives the
  // render that registered it.
  const idle = phase === "idle" && !pending
  const idleRef = useRef(idle)
  useEffect(() => {
    idleRef.current = idle
  }, [idle])

  useEffect(() => {
    if (!autoOpen || !configured) return
    const onVisibility = () => {
      if (!shouldOpenOnResume(document.visibilityState, idleRef.current)) return
      runOpen()
    }
    document.addEventListener("visibilitychange", onVisibility)
    return () => document.removeEventListener("visibilitychange", onVisibility)
  }, [autoOpen, configured, runOpen])

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
      <LockParticles active={phase === "opening"} />
      <span
        key={offline ? shake : 0}
        className={cn(
          "relative text-[8rem] leading-none sm:text-[10rem]",
          !offline && phase === "opening" && "door-wiggle",
          offline && shake > 0 && "door-shake"
        )}
      >
        {emoji}
      </span>
    </button>
  )
}
