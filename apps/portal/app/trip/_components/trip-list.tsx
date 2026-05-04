"use client"

import { Skeleton } from "@workspace/ui/components/skeleton"

import { useTripAdmin } from "@/hooks/trip/use-admin"
import { useTrips } from "@/hooks/trip/use-trips"

import { CreateTripDialog } from "./create-trip-dialog"
import { TripCard } from "./trip-card"

export function TripList() {
  const { data: trips, isLoading } = useTrips()
  const { isAdmin } = useTripAdmin()

  if (isLoading && !trips) {
    return (
      <div className="flex flex-col gap-10">
        <Skeleton className="h-6 w-32 rounded-md" />
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-[88px] w-full rounded-xl" />
          ))}
        </div>
      </div>
    )
  }

  const open = (trips ?? []).filter((t) => t.status === "open")
  const closed = (trips ?? []).filter((t) => t.status === "closed")

  return (
    <div className="flex flex-col gap-10">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="font-medium">Trip</h1>
          <p className="text-sm text-muted-foreground">
            出差文件上傳。每位成員只看得到自己上傳的；admin 看得到全部。
          </p>
        </div>
        {isAdmin && <CreateTripDialog />}
      </div>

      {open.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-medium">進行中</h2>
          <div className="flex flex-col gap-3">
            {open.map((trip) => (
              <TripCard key={trip.id} trip={trip} isAdmin={isAdmin} />
            ))}
          </div>
        </section>
      )}

      {closed.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-medium">已關閉</h2>
          <div className="flex flex-col gap-3">
            {closed.map((trip) => (
              <TripCard key={trip.id} trip={trip} isAdmin={isAdmin} />
            ))}
          </div>
        </section>
      )}

      {(trips ?? []).length === 0 && (
        <div className="py-12 text-center text-sm text-muted-foreground">
          {isAdmin ? "還沒有出差紀錄，按右上角新增" : "目前沒有出差紀錄"}
        </div>
      )}
    </div>
  )
}
