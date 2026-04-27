"use client"

import Link from "next/link"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Skeleton } from "@workspace/ui/components/skeleton"

import { useTripAdmin } from "@/hooks/trip/use-admin"
import { useTripFiles } from "@/hooks/trip/use-trip-files"
import { useTrip } from "@/hooks/trip/use-trips"
import { useAuth } from "@/hooks/use-auth"

import { AdminFolderList } from "./admin-folder-list"
import { FileList } from "./file-list"
import { UploadZone } from "./upload-zone"

export function TripDetail({ tripId }: { tripId: string }) {
  const { user } = useAuth()
  const { data: trip, isLoading: tripLoading } = useTrip(tripId)
  const { data: files, isLoading: filesLoading } = useTripFiles(tripId)
  const { isAdmin } = useTripAdmin()

  if (tripLoading || !trip) {
    return (
      <div className="flex flex-col gap-10">
        <Skeleton className="h-6 w-48 rounded-md" />
        <Skeleton className="h-[200px] w-full rounded-xl" />
      </div>
    )
  }

  const isOpen = trip.status === "open"

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <h1 className="flex-1 font-medium">{trip.name}</h1>
          <Badge variant="outline" className="shrink-0 text-xs">
            {isOpen ? "進行中" : "已關閉"}
          </Badge>
        </div>
        {trip.description && (
          <p className="text-sm text-muted-foreground">{trip.description}</p>
        )}
        <div>
          <Button asChild variant="link" size="sm" className="px-0">
            <Link href="/trip">← 全部 trips</Link>
          </Button>
        </div>
      </div>

      {isOpen && user && <UploadZone tripId={tripId} userId={user.id} />}
      {!isOpen && (
        <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
          這個 trip 已關閉，無法再上傳。
        </div>
      )}

      {isAdmin ? (
        <AdminFolderList
          tripId={tripId}
          tripName={trip.name}
          files={files ?? []}
          isLoading={filesLoading}
          canDelete
        />
      ) : (
        <FileList
          tripId={tripId}
          files={files ?? []}
          isLoading={filesLoading}
          canEdit={isOpen}
        />
      )}
    </div>
  )
}
