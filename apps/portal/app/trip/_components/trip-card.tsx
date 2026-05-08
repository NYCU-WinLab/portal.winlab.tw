"use client"

import Link from "next/link"

import { Badge } from "@workspace/ui/components/badge"

import type { Trip } from "@/lib/trip/types"

import { TripRowActions } from "./trip-row-actions"

export function TripCard({ trip, isAdmin }: { trip: Trip; isAdmin: boolean }) {
  const isOpen = trip.status === "open"

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
      <Link
        href={`/trip/${trip.id}`}
        className="flex min-w-0 flex-1 flex-col gap-1"
      >
        <span className="truncate text-sm font-medium">{trip.name}</span>
        {trip.description && (
          <p className="truncate text-sm text-muted-foreground">
            {trip.description}
          </p>
        )}
      </Link>
      <Badge variant="outline" className="shrink-0 text-xs">
        {isOpen ? "進行中" : "已關閉"}
      </Badge>
      {isAdmin && <TripRowActions trip={trip} />}
    </div>
  )
}
