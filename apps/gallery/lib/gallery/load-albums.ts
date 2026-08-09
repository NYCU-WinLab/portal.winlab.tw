import type { SupabaseClient } from "@supabase/supabase-js"

import type {
  GalleryAlbumDetail,
  GalleryAlbumPhoto,
  GalleryAlbumSummary,
} from "@/lib/gallery/albums"
import { isGalleryAlbumsUnavailable } from "@/lib/gallery/albums"
import { isGalleryVideoColumnsUnavailable } from "@/lib/gallery/manage-uploads"

type ListRow = {
  id: string
  title: string
  slug: string
  description: string | null
  cover_image_path: string | null
  cover_media_type: string | null
  cover_poster_path: string | null
  photo_count: number | string
  created_by: string
  owner_name: string
  created_at: string
  updated_at: string
}

type PhotoRow = {
  image_id: string
  name: string
  image_path: string
  media_type: string
  poster_path: string | null
  uploader_name: string
  created_by: string | null
  created_at: string
  sort_position: number
  added_at: string
}

function asMediaType(value: string | null): "image" | "video" | null {
  if (value === "image" || value === "video") return value
  return null
}

export async function loadGalleryAlbumSummaries(
  supabase: SupabaseClient,
  limit = 60
): Promise<GalleryAlbumSummary[]> {
  const { data, error } = await supabase.rpc("gallery_list_albums", {
    p_limit: Math.max(1, Math.min(limit, 200)),
  })

  if (error) {
    if (isGalleryAlbumsUnavailable(error)) return []
    console.error("[gallery] list albums failed", error)
    return []
  }

  return ((data ?? []) as ListRow[]).map((row) => ({
    id: row.id,
    title: row.title,
    slug: row.slug,
    description: row.description,
    cover_image_path: row.cover_image_path,
    cover_media_type: asMediaType(row.cover_media_type),
    cover_poster_path: row.cover_poster_path,
    photo_count: Number(row.photo_count) || 0,
    created_by: row.created_by,
    owner_name: row.owner_name,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }))
}

export async function loadGalleryAlbumBySlug(
  supabase: SupabaseClient,
  slug: string
): Promise<GalleryAlbumDetail | null> {
  const normalized = slug.trim().toLowerCase()
  if (!normalized) return null

  const { data: album, error: albumError } = await supabase
    .from("gallery_albums")
    .select(
      "id, title, slug, description, cover_image_id, created_by, created_at, updated_at"
    )
    .eq("slug", normalized)
    .maybeSingle()

  if (albumError) {
    if (!isGalleryAlbumsUnavailable(albumError)) {
      console.error("[gallery] load album failed", albumError)
    }
    return null
  }
  if (!album) return null

  const [{ data: owner }, { data: photos, error: photosError }] =
    await Promise.all([
      supabase
        .from("user_profiles")
        .select("name")
        .eq("id", album.created_by)
        .maybeSingle(),
      supabase.rpc("gallery_album_photos", { p_slug: normalized }),
    ])

  if (photosError && !isGalleryAlbumsUnavailable(photosError)) {
    if (isGalleryVideoColumnsUnavailable(photosError)) {
      const fallbackPhotos = await loadAlbumPhotosWithoutVideoColumns(
        supabase,
        album.id
      )
      return {
        id: album.id,
        title: album.title,
        slug: album.slug,
        description: album.description,
        cover_image_id: album.cover_image_id,
        created_by: album.created_by,
        owner_name: owner?.name || "Someone",
        created_at: album.created_at,
        updated_at: album.updated_at,
        photos: fallbackPhotos,
      }
    }
    console.error("[gallery] load album photos failed", photosError)
  }

  const mappedPhotos: GalleryAlbumPhoto[] = (
    (photos ?? []) as PhotoRow[]
  ).flatMap((row) => {
    const mediaType = asMediaType(row.media_type)
    if (!mediaType) return []
    return [
      {
        image_id: row.image_id,
        name: row.name,
        image_path: row.image_path,
        media_type: mediaType,
        poster_path: row.poster_path,
        uploader_name: row.uploader_name,
        created_by: row.created_by,
        created_at: row.created_at,
        position: row.sort_position,
        added_at: row.added_at,
      },
    ]
  })

  return {
    id: album.id,
    title: album.title,
    slug: album.slug,
    description: album.description,
    cover_image_id: album.cover_image_id,
    created_by: album.created_by,
    owner_name: owner?.name || "Someone",
    created_at: album.created_at,
    updated_at: album.updated_at,
    photos: mappedPhotos,
  }
}

async function loadAlbumPhotosWithoutVideoColumns(
  supabase: SupabaseClient,
  albumId: string
): Promise<GalleryAlbumPhoto[]> {
  const { data: links, error: linksError } = await supabase
    .from("gallery_album_images")
    .select("image_id, position, added_at")
    .eq("album_id", albumId)
    .order("position", { ascending: true })

  if (linksError || !links?.length) {
    if (linksError && !isGalleryAlbumsUnavailable(linksError)) {
      console.error("[gallery] load album image links failed", linksError)
    }
    return []
  }

  const ids = links.map((link) => link.image_id as string)
  const { data: images, error: imagesError } = await supabase
    .from("gallery_images")
    .select("id, name, image_path, created_by, created_at")
    .in("id", ids)

  if (imagesError) {
    console.error("[gallery] load album images without video cols", imagesError)
    return []
  }

  const byId = new Map(
    ((images ?? []) as Array<Record<string, unknown>>).map((row) => [
      row.id as string,
      row,
    ])
  )
  const nameById = new Map<string, string>()
  const uploaderIds = Array.from(
    new Set(
      ((images ?? []) as Array<{ created_by?: string | null }>)
        .map((row) => row.created_by)
        .filter((id): id is string => typeof id === "string")
    )
  )
  if (uploaderIds.length > 0) {
    const { data: profiles } = await supabase
      .from("user_profiles")
      .select("id, name")
      .in("id", uploaderIds)
    for (const profile of profiles ?? []) {
      nameById.set(profile.id, profile.name?.trim() || "Someone")
    }
  }

  return links.flatMap((link) => {
    const image = byId.get(link.image_id as string)
    if (!image) return []
    const createdBy =
      typeof image.created_by === "string" ? image.created_by : null
    return [
      {
        image_id: link.image_id as string,
        name: String(image.name ?? "Photo"),
        image_path: String(image.image_path ?? ""),
        media_type: "image" as const,
        poster_path: null,
        uploader_name: createdBy
          ? (nameById.get(createdBy) ?? "Someone")
          : "Someone",
        created_by: createdBy,
        created_at: String(image.created_at ?? ""),
        position: Number(link.position) || 0,
        added_at: String(link.added_at ?? ""),
      },
    ]
  })
}

export async function loadMyGalleryAlbums(
  supabase: SupabaseClient,
  userId: string
): Promise<{ id: string; title: string; slug: string; photo_count: number }[]> {
  const { data, error } = await supabase
    .from("gallery_albums")
    .select("id, title, slug")
    .eq("created_by", userId)
    .order("updated_at", { ascending: false })

  if (error) {
    if (!isGalleryAlbumsUnavailable(error)) {
      console.error("[gallery] load my albums failed", error)
    }
    return []
  }

  const albums = data ?? []
  if (albums.length === 0) return []

  const counts = await Promise.all(
    albums.map(async (album) => {
      const { count } = await supabase
        .from("gallery_album_images")
        .select("image_id", { count: "exact", head: true })
        .eq("album_id", album.id)
      return Number(count) || 0
    })
  )

  return albums.map((album, index) => ({
    id: album.id,
    title: album.title,
    slug: album.slug,
    photo_count: counts[index] ?? 0,
  }))
}
