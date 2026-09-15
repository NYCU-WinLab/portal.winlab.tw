"use client"

import { useEffect, useState, useTransition } from "react"

import { IconDoorEnter } from "@tabler/icons-react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

import { getDoorState, openDoor } from "../actions"

const POLL_MS = 5000
const FLASH_MS = 2000

type Phase = "idle" | "opening" | "opened"

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

  const unlock = () => {
    setPhase("opening")
    startTransition(async () => {
      const result = await openDoor()
      if (result.ok) {
        setOnline(true)
        setPhase("opened")
        toast.success("Door opened")
      } else {
        setPhase("idle")
        toast.error(result.error)
      }
    })
  }

  if (!configured) {
    return (
      <p className="text-sm text-muted-foreground">
        Door API is not configured. Set DOOR_API_URL and DOOR_API_SECRET.
      </p>
    )
  }

  const opened = phase === "opened"
  const busy = pending || phase === "opening"

  return (
    <div className="flex flex-col items-center gap-8 py-10">
      <div className="flex flex-col items-center gap-3">
        <div
          className={cn(
            "flex size-28 items-center justify-center rounded-full border transition-colors",
            opened
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              : "border-border bg-muted text-muted-foreground"
          )}
        >
          <IconDoorEnter className="size-12" stroke={1.5} />
        </div>
        <p className="text-2xl font-medium">
          {opened ? "Opened" : busy ? "Opening…" : "Ready"}
        </p>
        <p className="text-xs text-muted-foreground">
          {online === false
            ? "Door controller unreachable"
            : "按一下觸發一次開門，門禁那邊決定開多久"}
        </p>
      </div>
      <Button size="lg" className="min-w-40" disabled={busy} onClick={unlock}>
        Open
      </Button>
    </div>
  )
}
