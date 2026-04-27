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

export function useUploadTripFiles(tripId: string) {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: {
      userId: string
      files: File[]
      signature?: { dataUrl: string; position: SignaturePosition } | null
      onProgress?: (done: number, total: number) => void
    }) => {
      const total = params.files.length
      let done = 0

      for (const file of params.files) {
        const converted = await fileToPdf(file)
        const blob = params.signature
          ? await stampSignatureOnPdf(
              converted.blob,
              params.signature.dataUrl,
              params.signature.position
            )
          : converted.blob
        const fileUuid = crypto.randomUUID()
        const path = tripFilePath(tripId, params.userId, fileUuid)

        const upload = await supabase.storage
          .from(TRIP_BUCKET)
          .upload(path, blob, { contentType: "application/pdf" })
        if (upload.error) throw upload.error

        const insert = await supabase.from("trip_files").insert({
          trip_id: tripId,
          user_id: params.userId,
          storage_path: path,
          filename: converted.filename,
          size_bytes: blob.size,
        })
        if (insert.error) {
          // Best-effort cleanup of the orphaned object on DB failure.
          await supabase.storage.from(TRIP_BUCKET).remove([path])
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
      const { error: storageErr } = await supabase.storage
        .from(TRIP_BUCKET)
        .remove([file.storage_path])
      if (storageErr) throw storageErr
      const { error } = await supabase
        .from("trip_files")
        .delete()
        .eq("id", file.id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.files.byTrip(tripId),
      })
    },
  })
}

// Open one file in a new tab via a short-lived signed URL.
export function useOpenTripFile() {
  const supabase = createClient()

  return useMutation({
    mutationFn: async (file: { storage_path: string; filename: string }) => {
      const { data, error } = await supabase.storage
        .from(TRIP_BUCKET)
        .createSignedUrl(file.storage_path, SIGNED_URL_TTL_SECONDS, {
          download: file.filename,
        })
      if (error) throw error
      window.open(data.signedUrl, "_blank", "noopener,noreferrer")
    },
  })
}

// Bulk download helpers: build signed URLs, then stream into a zip.

async function signMany(
  supabase: ReturnType<typeof createClient>,
  paths: string[]
): Promise<Map<string, string>> {
  const { data, error } = await supabase.storage
    .from(TRIP_BUCKET)
    .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS)
  if (error) throw error
  const map = new Map<string, string>()
  for (const row of data ?? []) {
    if (row.signedUrl && row.path) map.set(row.path, row.signedUrl)
  }
  return map
}

// Admin: download every file uploaded by one user inside the trip.
export function useDownloadUserFiles() {
  const supabase = createClient()

  return useMutation({
    mutationFn: async (params: {
      tripName: string
      userName: string
      files: TripFileWithUser[]
    }) => {
      if (params.files.length === 0) throw new Error("這位成員還沒有檔案")
      const urlMap = await signMany(
        supabase,
        params.files.map((f) => f.storage_path)
      )
      const used = new Set<string>()
      const entries = params.files.map((f) => ({
        name: uniquifyName(used, f.filename),
        url: urlMap.get(f.storage_path) ?? "",
      }))
      await saveZip(
        `${safeFolderName(params.tripName)}_${safeFolderName(params.userName)}.zip`,
        entries
      )
    },
  })
}

// Admin: download all files in trip, grouped into per-user folders.
export function useDownloadAllFiles() {
  const supabase = createClient()

  return useMutation({
    mutationFn: async (params: {
      tripName: string
      files: TripFileWithUser[]
    }) => {
      if (params.files.length === 0) throw new Error("這個 trip 還沒有檔案")
      const urlMap = await signMany(
        supabase,
        params.files.map((f) => f.storage_path)
      )
      const usedPerFolder = new Map<string, Set<string>>()
      const entries = params.files.map((f) => {
        const folder = safeFolderName(f.user?.name ?? f.user_id ?? "unknown")
        const used = usedPerFolder.get(folder) ?? new Set<string>()
        usedPerFolder.set(folder, used)
        const name = uniquifyName(used, f.filename)
        return {
          name: `${folder}/${name}`,
          url: urlMap.get(f.storage_path) ?? "",
        }
      })
      await saveZip(`${safeFolderName(params.tripName)}.zip`, entries)
    },
  })
}

// Member: single-file fallback when the user wants a local copy.
export function useDownloadSingleFile() {
  const supabase = createClient()

  return useMutation({
    mutationFn: async (file: { storage_path: string; filename: string }) => {
      const { data, error } = await supabase.storage
        .from(TRIP_BUCKET)
        .createSignedUrl(file.storage_path, SIGNED_URL_TTL_SECONDS, {
          download: file.filename,
        })
      if (error) throw error
      const a = document.createElement("a")
      a.href = data.signedUrl
      a.rel = "noopener noreferrer"
      a.download = file.filename
      document.body.appendChild(a)
      a.click()
      a.remove()
    },
  })
}
