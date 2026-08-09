"use server"

import { revalidatePath } from "next/cache"

import {
  buildFinding,
  classifyObjectStatus,
  classifyThumbStatus,
  displayPathForRow,
  mapWithConcurrency,
  MEDIA_HEALTH_PAGE_SIZE,
  MEDIA_HEALTH_PROBE_CONCURRENCY,
  summarizeFindings,
  type MediaHealthFinding,
  type MediaHealthScanRow,
} from "@/lib/gallery/media-health"
import { getGalleryImageUrl, getGalleryThumbUrl } from "@/lib/gallery/url"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

export type MediaHealthActionError = { ok: false; error: string }

export type ScanMediaHealthPageResult =
  | {
      ok: true
      findings: MediaHealthFinding[]
      scanned: number
      summary: ReturnType<typeof summarizeFindings>
      nextOffset: number | null
      totalRows: number
    }
  | MediaHealthActionError

export type AdminDeleteBrokenResult =
  | { ok: true; deleted: number }
  | MediaHealthActionError

async function requireGalleryAdmin(): Promise<
  { ok: true; userId: string } | MediaHealthActionError
> {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const userId = claimsData?.claims?.sub
  if (!userId) return { ok: false, error: "Please sign in first." }

  const { data: profile, error: profileError } = await supabase
    .from("user_profiles")
    .select("is_admin")
    .eq("id", userId)
    .maybeSingle()

  if (profileError) {
    return { ok: false, error: profileError.message }
  }
  if (!profile?.is_admin) {
    return {
      ok: false,
      error: "Only super admins can scan gallery media health.",
    }
  }

  return { ok: true, userId }
}

async function probeUrl(url: string): Promise<number> {
  try {
    const head = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      cache: "no-store",
    })
    // Some CDNs reject HEAD; fall back to a tiny ranged GET.
    if (head.status === 405 || head.status === 501) {
      const get = await fetch(url, {
        method: "GET",
        headers: { Range: "bytes=0-0" },
        redirect: "follow",
        cache: "no-store",
      })
      return get.status
    }
    return head.status
  } catch {
    return 0
  }
}

async function probeRow(row: MediaHealthScanRow) {
  const displayPath = displayPathForRow(row)
  const originalUrl = getGalleryImageUrl(row.image_path)
  const posterUrl = row.poster_path ? getGalleryImageUrl(row.poster_path) : null
  const thumbUrl = getGalleryThumbUrl(displayPath, 400)

  const [originalStatus, posterStatus, thumbStatus] = await Promise.all([
    probeUrl(originalUrl),
    posterUrl ? probeUrl(posterUrl) : Promise.resolve(null),
    probeUrl(thumbUrl),
  ])

  return buildFinding(row, {
    original: classifyObjectStatus(originalStatus),
    poster: posterStatus == null ? null : classifyObjectStatus(posterStatus),
    thumb: classifyThumbStatus(thumbStatus),
  })
}

/**
 * Page through gallery_images and probe Storage. Offset pagination keeps each
 * Server Action under Vercel's time budget; the UI walks pages until done.
 */
export async function scanGalleryMediaHealthPage(
  offset = 0
): Promise<ScanMediaHealthPageResult> {
  const gate = await requireGalleryAdmin()
  if (!gate.ok) return gate

  const safeOffset = Math.max(0, Math.floor(offset))
  const supabase = await createClient()

  const { count, error: countError } = await supabase
    .from("gallery_images")
    .select("id", { count: "exact", head: true })

  if (countError) {
    return { ok: false, error: `Could not count media: ${countError.message}` }
  }

  const { data, error } = await supabase
    .from("gallery_images")
    .select(
      "id, name, image_path, media_type, poster_path, created_by, created_at"
    )
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(safeOffset, safeOffset + MEDIA_HEALTH_PAGE_SIZE - 1)

  if (error) {
    return { ok: false, error: `Could not load media: ${error.message}` }
  }

  const rows = (data ?? []) as MediaHealthScanRow[]
  const probed = await mapWithConcurrency(
    rows,
    MEDIA_HEALTH_PROBE_CONCURRENCY,
    (row) => probeRow(row)
  )
  const findings = probed.filter(
    (finding): finding is MediaHealthFinding => finding !== null
  )

  const scanned = rows.length
  const nextOffset =
    scanned < MEDIA_HEALTH_PAGE_SIZE
      ? null
      : safeOffset + MEDIA_HEALTH_PAGE_SIZE

  return {
    ok: true,
    findings,
    scanned,
    summary: summarizeFindings(findings),
    nextOffset,
    totalRows: count ?? 0,
  }
}

/**
 * Super-admin purge for broken rows. Uses the service-role client because RLS
 * only lets owners delete their own uploads.
 */
export async function adminDeleteBrokenGalleryImages(
  items: {
    id: string
    imagePath: string
    posterPath?: string | null
  }[]
): Promise<AdminDeleteBrokenResult> {
  const gate = await requireGalleryAdmin()
  if (!gate.ok) return gate

  if (items.length === 0) {
    return { ok: false, error: "Nothing selected." }
  }
  if (items.length > MEDIA_HEALTH_PAGE_SIZE) {
    return {
      ok: false,
      error: `Delete at most ${MEDIA_HEALTH_PAGE_SIZE} rows at a time.`,
    }
  }

  const admin = createAdminClient()
  const ids = items.map((item) => item.id)

  const { data: existing, error: fetchError } = await admin
    .from("gallery_images")
    .select("id, image_path, poster_path")
    .in("id", ids)

  if (fetchError) {
    return { ok: false, error: `Lookup failed: ${fetchError.message}` }
  }
  if ((existing ?? []).length !== ids.length) {
    return { ok: false, error: "Some selected rows no longer exist." }
  }

  const { error: deleteError } = await admin
    .from("gallery_images")
    .delete()
    .in("id", ids)

  if (deleteError) {
    return { ok: false, error: `Delete failed: ${deleteError.message}` }
  }

  const storagePaths = new Set<string>()
  for (const item of items) {
    storagePaths.add(item.imagePath)
    if (item.posterPath) storagePaths.add(item.posterPath)
  }

  const { error: storageError } = await admin.storage
    .from("gallery")
    .remove([...storagePaths])
  if (storageError) {
    console.error(
      "[gallery] admin media-health storage delete failed",
      storageError
    )
  }

  revalidatePath("/")
  revalidatePath("/upload")
  return { ok: true, deleted: ids.length }
}
