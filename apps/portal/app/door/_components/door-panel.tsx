"use client"

import { useEffect, useState, useTransition } from "react"

import { IconDoor, IconDoorOff } from "@tabler/icons-react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

import { closeDoor, getDoorState, openDoor } from "../actions"

const POLL_MS = 3000

export function DoorPanel({
  configured,
  initialOpen,
}: {
  configured: boolean
  initialOpen: boolean | null
}) {
  const [open, setOpen] = useState<boolean | null>(initialOpen)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    if (!configured) return
    let cancelled = false
    const tick = async () => {
      const result = await getDoorState()
      if (cancelled) return
      setOpen(result.ok ? result.state.open : null)
    }
    const id = setInterval(tick, POLL_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [configured])

  const run = (action: typeof openDoor, label: string) =>
    startTransition(async () => {
      const result = await action()
      if (result.ok) {
        setOpen(result.state.open)
        toast.success(label)
      } else {
        toast.error(result.error)
      }
    })

  if (!configured) {
    return (
      <p className="text-sm text-muted-foreground">
        Door API is not configured. Set DOOR_API_URL and DOOR_API_SECRET.
      </p>
    )
  }

  const unknown = open === null

  return (
    <div className="flex flex-col items-center gap-8 py-10">
      <div className="flex flex-col items-center gap-3">
        <div
          className={cn(
            "flex size-28 items-center justify-center rounded-full border transition-colors",
            unknown && "border-border bg-muted text-muted-foreground",
            open === true &&
              "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
            open === false && "border-border bg-background text-foreground"
          )}
        >
          {open ? (
            <IconDoor className="size-12" stroke={1.5} />
          ) : (
            <IconDoorOff className="size-12" stroke={1.5} />
          )}
        </div>
        <p className="text-2xl font-medium tabular-nums">
          {unknown ? "Unknown" : open ? "Open" : "Closed"}
        </p>
        <p className="text-xs text-muted-foreground">
          {unknown ? "Door API unreachable" : "目前狀態"}
        </p>
      </div>
      <div className="flex gap-3">
        <Button
          size="lg"
          disabled={pending || open === true}
          onClick={() => run(openDoor, "Door opened")}
        >
          Open
        </Button>
        <Button
          size="lg"
          variant="outline"
          disabled={pending || open === false}
          onClick={() => run(closeDoor, "Door closed")}
        >
          Close
        </Button>
      </div>
    </div>
  )
}
