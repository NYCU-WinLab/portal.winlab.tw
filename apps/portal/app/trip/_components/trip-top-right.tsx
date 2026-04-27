"use client"

import { useTripAdmin } from "@/hooks/trip/use-admin"

// TR slot is currently a no-op — admin "下載全部" lives on the trip detail
// page itself (so it has access to the file list). Reserved for future cross-
// page admin nav.
export function TripTopRight() {
  const { isAdmin } = useTripAdmin()
  if (!isAdmin) return null
  return <span className="text-xs text-muted-foreground">Admin</span>
}
