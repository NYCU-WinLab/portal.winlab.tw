"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { createClient } from "@/lib/supabase/client"
import { fileToPdf } from "@/lib/trip/convert"
import { stampSignatureOnPdf, type SignaturePosition } from "@/lib/trip/sign"
import { TRIP_BUCKET, tripFilePath } from "@/lib/trip/storage"
import type { TripFile, TripFileWithUser } from "@/lib/trip/types"
import { safeFolderName, saveZip, uniquifyName } from "@/lib/trip/zip"

import { queryKeys } from "./query-keys"

const SIGNED_URL_TTL_SECONDS = 60 * 10

// Optional sign config passed by callers. If `signature` and `enabled` is
// true, we stamp the corresponding corner. Otherwise the file is returned /
// served exactly as it sits in storage.
export type SignConfig = {
  signature: string
  corner: SignaturePosition
} | null

export function useTripFiles(tripId: string | undefined) {
  const supabase = createClient()

  return useQuery({
    queryKey: queryKeys.files.byTrip(tripId!),
    queryFn: async (): Promise<TripFileWithUser[]> => {
      const { data, error } = await supabase
        .from("trip_files")
        .select("*")
        .eq("trip_id", tripId!)
        .order("created_at", { ascending: false })
      if (error) throw error

      const files = (data ?? []) as TripFile[]
      if (files.length === 0) return []

      const userIds = [
        ...new Set(
          files.map((f) => f.user_id).filter((id): id is string => !!id)
        ),
      ]
      const profileMap = new Map<string, { id: string; name: string | null }>()
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from("user_profiles")
          .select("id, name")
          .in("id", userIds)
        for (const p of (profiles ?? []) as {
          id: string
          name: string | null
        }[]) {
          profileMap.set(p.id, p)
        }
      }

      return files.map((f) => ({
        ...f,
        user: f.user_id
          ? (profileMap.get(f.user_id) ?? { id: f.user_id, name: null })
          : null,
      }))
    },
    enabled: !!tripId,
  })
}

// Upload always stores the unsigned, converted PDF. Signing is now applied
// at view / download time so that the toggle stays dynamic.
export function useUploadTripFiles(tripId: string) {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: {
      userId: string
      files: File[]
      onProgress?: (done: number, total: number) => void
    }) => {
      const total = params.files.length
      let done = 0

      for (const file of params.files) {
        const converted = await fileToPdf(file)
        const fileUuid = crypto.randomUUID()
        const path = tripFilePath(tripId, params.userId, fileUuid)

        const upload = await supabase.storage
          .from(TRIP_BUCKET)
          .upload(path, converted.blob, { contentType: "application/pdf" })
        if (upload.error) throw upload.error

        const insert = await supabase.from("trip_files").insert({
          trip_id: tripId,
          user_id: params.userId,
          storage_path: path,
          filename: converted.filename,
          size_bytes: converted.blob.size,
        })
        if (insert.error) {
          const cleanup = await supabase.storage
            .from(TRIP_BUCKET)
            .remove([path])
          if (cleanup.error) {
            console.error("[trip] orphan storage cleanup failed", cleanup.error)
          }
          throw insert.error
        }

        done++
        params.onProgress?.(done, total)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.files.byTrip(tripId),
      })
    },
  })
}

export function useUpdateTripFileDescription(tripId: string) {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: { id: string; description: string | null }) => {
      const { error } = await supabase
        .from("trip_files")
        .update({ description: params.description })
        .eq("id", params.id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.files.byTrip(tripId),
      })
    },
  })
}

export function useDeleteTripFile(tripId: string) {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (file: { id: string; storage_path: string }) => {
      // DB row is the source of truth — kill it first. If we removed the
      // storage object first and then DB deletion failed (RLS, network),
      // we'd leak a row pointing at nothing. The reverse case (DB row gone,
      // storage object still around) is harmless: orphaned bytes get
      // garbage-collected by a sweeper, RLS makes them unreadable anyway.
      const { error } = await supabase
        .from("trip_files")
        .delete()
        .eq("id", file.id)
      if (error) throw error
      const cleanup = await supabase.storage
        .from(TRIP_BUCKET)
        .remove([file.storage_path])
      if (cleanup.error) {
        console.error("[trip] storage cleanup failed", cleanup.error)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.files.byTrip(tripId),
      })
    },
  })
}

// --- Read sites: fetch + (optionally) stamp + open / save / zip --------

async function fetchAndMaybeStamp(
  supabase: ReturnType<typeof createClient>,
  storagePath: string,
  sign: SignConfig
): Promise<Blob> {
  const { data, error } = await supabase.storage
    .from(TRIP_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS)
  if (error) throw error

  const res = await fetch(data.signedUrl)
  if (!res.ok) throw new Error(`下載失敗（${res.status}）`)
  const raw = await res.blob()
  if (!sign) return raw
  return stampSignatureOnPdf(raw, sign.signature, sign.corner)
}

// Open in new tab. Always uses a blob URL since the bytes may have been
// stamped client-side; revoke on next tick after the tab takes over.
export function useOpenTripFile() {
  const supabase = createClient()

  return useMutation({
    mutationFn: async (params: {
      file: { storage_path: string; filename: string }
      sign: SignConfig
    }) => {
      const blob = await fetchAndMaybeStamp(
        supabase,
        params.file.storage_path,
        params.sign
      )
      const url = URL.createObjectURL(blob)
      window.open(url, "_blank", "noopener,noreferrer")
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    },
  })
}

export function useDownloadSingleFile() {
  const supabase = createClient()

  return useMutation({
    mutationFn: async (params: {
      file: { storage_path: string; filename: string }
      sign: SignConfig
    }) => {
      const blob = await fetchAndMaybeStamp(
        supabase,
        params.file.storage_path,
        params.sign
      )
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = params.file.filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    },
  })
}

// Admin: zip every file from one member, stamping per the member's pref.
export function useDownloadUserFiles() {
  const supabase = createClient()

  return useMutation({
    mutationFn: async (params: {
      tripName: string
      userName: string
      files: TripFileWithUser[]
      memberSign: SignConfig // pre-resolved by caller from RPC
    }) => {
      if (params.files.length === 0) throw new Error("這位成員還沒有檔案")
      const used = new Set<string>()
      const entries = await Promise.all(
        params.files.map(async (f) => ({
          name: uniquifyName(used, f.filename),
          blob: await fetchAndMaybeStamp(
            supabase,
            f.storage_path,
            params.memberSign
          ),
        }))
      )
      await saveZip(
        `${safeFolderName(params.tripName)}_${safeFolderName(params.userName)}.zip`,
        entries
      )
    },
  })
}

// Admin: zip every file in trip, stamping each according to its uploader's
// pref. The caller passes a `Map<userId, SignConfig>` already resolved via
// the RPC so we don't fan-out per-file lookups.
export function useDownloadAllFiles() {
  const supabase = createClient()

  return useMutation({
    mutationFn: async (params: {
      tripName: string
      files: TripFileWithUser[]
      memberSigns: Map<string, SignConfig>
    }) => {
      if (params.files.length === 0) throw new Error("這個 trip 還沒有檔案")
      const usedPerFolder = new Map<string, Set<string>>()
      const entries = await Promise.all(
        params.files.map(async (f) => {
          const folder = safeFolderName(f.user?.name ?? f.user_id ?? "unknown")
          const used = usedPerFolder.get(folder) ?? new Set<string>()
          usedPerFolder.set(folder, used)
          const name = uniquifyName(used, f.filename)
          const sign = (f.user_id && params.memberSigns.get(f.user_id)) || null
          return {
            name: `${folder}/${name}`,
            blob: await fetchAndMaybeStamp(supabase, f.storage_path, sign),
          }
        })
      )
      await saveZip(`${safeFolderName(params.tripName)}.zip`, entries)
    },
  })
}
