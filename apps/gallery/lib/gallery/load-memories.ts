import type { SupabaseClient } from "@supabase/supabase-js"

import {
  clampGalleryMemoriesLimit,
  type GalleryMemoryPhoto,
} from "@/lib/gallery/memories"

type ProfileRow = {
  id: string
  name: string | null
  email?: string | null
}

type MemoryRpcRow = {
  id: string
  name: string
  image_path: string
  media_type: string | null
  poster_path: string | null
  created_by: string | null
  created_at: string
  taken_at: string
  sequence_id: string | null
  sequence_index: number | null
  memory_year: number
}

function displayName(row: ProfileRow | undefined, fallbackId: string | null) {
  if (row) {
    const fromName = typeof row.name === "string" ? row.name.trim() : ""
    if (fromName) return fromName
    if (typeof row.email === "string" && row.email.includes("@")) {
      return row.email.split("@")[0] || "Unknown"
    }
  }
  return fallbackId ? "Unknown" : "Unknown"
}

export function isGalleryMemoriesUnavailable(
  error: { code?: string; message?: string } | null
): boolean {
  if (!error) return false
  const code = error.code ?? ""
  const message = error.message ?? ""
  return (
    code === "PGRST202" ||
    code === "PGRST205" ||
    code === "42P01" ||
    /gallery_memories_on_this_day/i.test(message) ||
    /could not find|does not exist|schema cache/i.test(message)
  )
}

export type GalleryMemoriesLoadResult = {
  photos: GalleryMemoryPhoto[]
  available: boolean
}

export async function loadGalleryMemoriesOnThisDay(
  supabase: SupabaseClient,
  {
    month,
    day,
    limit,
  }: {
    month: number
    day: number
    limit?: number
  }
): Promise<GalleryMemoriesLoadResult> {
  const capped = clampGalleryMemoriesLimit(limit)

  const { data, error } = await supabase.rpc("gallery_memories_on_this_day", {
    p_month: month,
    p_day: day,
    p_limit: capped,
  })

  if (error) {
    // Soft-fail when the migration hasn't landed yet (local/preview lag).
    if (isGalleryMemoriesUnavailable(error)) {
      return { photos: [], available: false }
    }
    console.error("[gallery] memories rpc failed", error)
    return { photos: [], available: true }
  }

  const rows = (data ?? []) as MemoryRpcRow[]
  if (rows.length === 0) return { photos: [], available: true }

  const uploaderIds = Array.from(
    new Set(
      rows
        .map((row) => row.created_by)
        .filter((id): id is string => typeof id === "string" && id.length > 0)
    )
  )

  const profilesById = new Map<string, ProfileRow>()
  if (uploaderIds.length > 0) {
    const { data: profiles } = await supabase
      .from("user_profiles")
      .select("id, name")
      .in("id", uploaderIds)

    for (const profile of (profiles ?? []) as ProfileRow[]) {
      profilesById.set(profile.id, profile)
    }
  }

  const photos: GalleryMemoryPhoto[] = rows.map((row) => {
    const createdBy = row.created_by
    return {
      id: row.id,
      name: row.name,
      image_path: row.image_path,
      media_type:
        row.media_type === "video" ? ("video" as const) : ("image" as const),
      poster_path: row.poster_path,
      created_by: createdBy,
      created_at: row.created_at,
      taken_at: row.taken_at,
      sequence_id: row.sequence_id,
      sequence_index: row.sequence_index,
      memory_year: row.memory_year,
      uploader_name: displayName(
        createdBy ? profilesById.get(createdBy) : undefined,
        createdBy
      ),
    }
  })

  return { photos, available: true }
}
