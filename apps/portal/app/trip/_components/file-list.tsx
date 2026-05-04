"use client"

import { Skeleton } from "@workspace/ui/components/skeleton"

import { useSignPrefs } from "@/hooks/trip/use-sign-prefs"
import type { SignConfig } from "@/hooks/trip/use-trip-files"
import { useAuth } from "@/hooks/use-auth"
import { useSavedSignature } from "@/hooks/use-saved-signature"
import type { TripFileWithUser } from "@/lib/trip/types"

import { FileCard } from "./file-card"

export function FileList({
  tripId,
  files,
  isLoading,
  canEdit,
}: {
  tripId: string
  files: TripFileWithUser[]
  isLoading: boolean
  canEdit: boolean
}) {
  const { user } = useAuth()
  const { signature } = useSavedSignature(user?.id)
  const { prefs } = useSignPrefs(user?.id)

  const sign: SignConfig =
    prefs.enabled && signature ? { signature, corner: prefs.corner } : null

  if (isLoading && files.length === 0) {
    return (
      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-medium">我的檔案</h2>
        <div className="flex flex-col gap-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-[72px] w-full rounded-xl" />
          ))}
        </div>
      </section>
    )
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-medium">我的檔案</h2>
        <span className="text-xs text-muted-foreground">{files.length} 個</span>
      </div>
      {files.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          還沒上傳任何檔案
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {files.map((file) => (
            <FileCard
              key={file.id}
              tripId={tripId}
              file={file}
              sign={sign}
              canEdit={canEdit}
              canDelete={canEdit}
            />
          ))}
        </div>
      )}
    </section>
  )
}
