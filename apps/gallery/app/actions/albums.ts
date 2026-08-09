"use server"

import { revalidatePath } from "next/cache"

import {
  GALLERY_ALBUM_PHOTOS_MAX,
  normalizeAlbumPositions,
  normalizeGalleryAlbumDescription,
  normalizeGalleryAlbumSlug,
  normalizeGalleryAlbumTitle,
  type GalleryAlbumSummary,
} from "@/lib/gallery/albums"
import {
  loadGalleryAlbumSummaries,
  loadMyGalleryAlbums,
} from "@/lib/gallery/load-albums"
import { createClient } from "@/lib/supabase/server"

export type AlbumActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string }

type GallerySupabase = Awaited<ReturnType<typeof createClient>>

async function requireSignedIn(): Promise<
  | { ok: true; supabase: GallerySupabase; userId: string }
  | { ok: false; error: string }
> {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const userId = claimsData?.claims?.sub
  if (!userId) return { ok: false, error: "Please sign in first." }
  return { ok: true, supabase, userId }
}

function revalidateAlbumPaths(slug?: string) {
  revalidatePath("/albums")
  revalidatePath("/")
  if (slug) revalidatePath(`/albums/${slug}`)
}

export async function listGalleryAlbums(
  limit = 60
): Promise<AlbumActionResult<GalleryAlbumSummary[]>> {
  const supabase = await createClient()
  const albums = await loadGalleryAlbumSummaries(supabase, limit)
  return { ok: true, data: albums }
}

export async function listMyGalleryAlbums(): Promise<
  AlbumActionResult<
    { id: string; title: string; slug: string; photo_count: number }[]
  >
> {
  const auth = await requireSignedIn()
  if (!auth.ok) return auth
  const albums = await loadMyGalleryAlbums(auth.supabase, auth.userId)
  return { ok: true, data: albums }
}

export async function createGalleryAlbum(input: {
  title: string
  description?: string | null
}): Promise<AlbumActionResult<{ id: string; slug: string; title: string }>> {
  const auth = await requireSignedIn()
  if (!auth.ok) return auth

  const title = normalizeGalleryAlbumTitle(input.title)
  const slug = title ? normalizeGalleryAlbumSlug(title) : null
  if (!title || !slug) {
    return { ok: false, error: "Album title is empty or invalid." }
  }

  const description = normalizeGalleryAlbumDescription(input.description)
  if (input.description?.trim() && description == null) {
    return { ok: false, error: "Description is too long." }
  }

  const { data, error } = await auth.supabase
    .from("gallery_albums")
    .insert({
      title,
      slug,
      description,
      created_by: auth.userId,
    })
    .select("id, slug, title")
    .single()

  if (error) {
    if (/duplicate|unique|23505/i.test(error.message)) {
      return {
        ok: false,
        error: "That album name is already taken — try another.",
      }
    }
    return { ok: false, error: error.message }
  }

  revalidateAlbumPaths(data.slug)
  return { ok: true, data: { id: data.id, slug: data.slug, title: data.title } }
}

export async function updateGalleryAlbum(input: {
  albumId: string
  title?: string
  description?: string | null
  coverImageId?: string | null
}): Promise<AlbumActionResult<{ slug: string }>> {
  if (!input.albumId) return { ok: false, error: "Missing album id." }

  const auth = await requireSignedIn()
  if (!auth.ok) return auth

  const { data: existing, error: existingError } = await auth.supabase
    .from("gallery_albums")
    .select("id, slug, title")
    .eq("id", input.albumId)
    .maybeSingle()

  if (existingError) return { ok: false, error: existingError.message }
  if (!existing) return { ok: false, error: "Album not found." }

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }

  if (input.title !== undefined) {
    const title = normalizeGalleryAlbumTitle(input.title)
    const slug = title ? normalizeGalleryAlbumSlug(title) : null
    if (!title || !slug) {
      return { ok: false, error: "Album title is empty or invalid." }
    }
    patch.title = title
    patch.slug = slug
  }

  if (input.description !== undefined) {
    const description = normalizeGalleryAlbumDescription(input.description)
    if (input.description?.trim() && description == null) {
      return { ok: false, error: "Description is too long." }
    }
    patch.description = description
  }

  if (input.coverImageId !== undefined) {
    if (input.coverImageId === null) {
      patch.cover_image_id = null
    } else {
      const { data: member, error: memberError } = await auth.supabase
        .from("gallery_album_images")
        .select("image_id")
        .eq("album_id", input.albumId)
        .eq("image_id", input.coverImageId)
        .maybeSingle()
      if (memberError) return { ok: false, error: memberError.message }
      if (!member) {
        return {
          ok: false,
          error: "Cover photo must already be in this album.",
        }
      }
      patch.cover_image_id = input.coverImageId
    }
  }

  const { data, error } = await auth.supabase
    .from("gallery_albums")
    .update(patch)
    .eq("id", input.albumId)
    .select("slug")
    .single()

  if (error) {
    if (/duplicate|unique|23505/i.test(error.message)) {
      return {
        ok: false,
        error: "That album name is already taken — try another.",
      }
    }
    return { ok: false, error: error.message }
  }

  revalidateAlbumPaths(existing.slug)
  if (data.slug !== existing.slug) revalidateAlbumPaths(data.slug)
  return { ok: true, data: { slug: data.slug } }
}

export async function deleteGalleryAlbum(
  albumId: string
): Promise<AlbumActionResult> {
  if (!albumId) return { ok: false, error: "Missing album id." }

  const auth = await requireSignedIn()
  if (!auth.ok) return auth

  const { data: existing, error: existingError } = await auth.supabase
    .from("gallery_albums")
    .select("slug")
    .eq("id", albumId)
    .maybeSingle()

  if (existingError) return { ok: false, error: existingError.message }
  if (!existing) return { ok: false, error: "Album not found." }

  const { error } = await auth.supabase
    .from("gallery_albums")
    .delete()
    .eq("id", albumId)

  if (error) return { ok: false, error: error.message }

  revalidateAlbumPaths(existing.slug)
  return { ok: true }
}

export async function addImageToGalleryAlbum(
  albumId: string,
  imageId: string
): Promise<AlbumActionResult> {
  if (!albumId || !imageId) {
    return { ok: false, error: "Missing album or image id." }
  }

  const auth = await requireSignedIn()
  if (!auth.ok) return auth

  const { data: album, error: albumError } = await auth.supabase
    .from("gallery_albums")
    .select("id, slug, cover_image_id")
    .eq("id", albumId)
    .maybeSingle()

  if (albumError) return { ok: false, error: albumError.message }
  if (!album) return { ok: false, error: "Album not found." }

  const { count, error: countError } = await auth.supabase
    .from("gallery_album_images")
    .select("image_id", { count: "exact", head: true })
    .eq("album_id", albumId)

  if (countError) return { ok: false, error: countError.message }
  if ((count ?? 0) >= GALLERY_ALBUM_PHOTOS_MAX) {
    return {
      ok: false,
      error: `At most ${GALLERY_ALBUM_PHOTOS_MAX} photos per album.`,
    }
  }

  const { data: maxPos } = await auth.supabase
    .from("gallery_album_images")
    .select("position")
    .eq("album_id", albumId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle()

  const nextPosition = (maxPos?.position ?? -1) + 1

  const { error: linkError } = await auth.supabase
    .from("gallery_album_images")
    .insert({
      album_id: albumId,
      image_id: imageId,
      position: nextPosition,
      added_by: auth.userId,
    })

  if (linkError) {
    if (/duplicate|unique|23505/i.test(linkError.message)) {
      return { ok: true }
    }
    return { ok: false, error: linkError.message }
  }

  if (!album.cover_image_id) {
    await auth.supabase
      .from("gallery_albums")
      .update({
        cover_image_id: imageId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", albumId)
  }

  revalidateAlbumPaths(album.slug)
  return { ok: true }
}

export async function removeImageFromGalleryAlbum(
  albumId: string,
  imageId: string
): Promise<AlbumActionResult> {
  if (!albumId || !imageId) {
    return { ok: false, error: "Missing album or image id." }
  }

  const auth = await requireSignedIn()
  if (!auth.ok) return auth

  const { data: album, error: albumError } = await auth.supabase
    .from("gallery_albums")
    .select("id, slug, cover_image_id")
    .eq("id", albumId)
    .maybeSingle()

  if (albumError) return { ok: false, error: albumError.message }
  if (!album) return { ok: false, error: "Album not found." }

  const { error } = await auth.supabase
    .from("gallery_album_images")
    .delete()
    .eq("album_id", albumId)
    .eq("image_id", imageId)

  if (error) return { ok: false, error: error.message }

  if (album.cover_image_id === imageId) {
    const { data: nextCover } = await auth.supabase
      .from("gallery_album_images")
      .select("image_id")
      .eq("album_id", albumId)
      .order("position", { ascending: true })
      .limit(1)
      .maybeSingle()

    await auth.supabase
      .from("gallery_albums")
      .update({
        cover_image_id: nextCover?.image_id ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", albumId)
  }

  revalidateAlbumPaths(album.slug)
  return { ok: true }
}

export async function reorderGalleryAlbumImages(
  albumId: string,
  imageIds: string[]
): Promise<AlbumActionResult> {
  if (!albumId) return { ok: false, error: "Missing album id." }

  const auth = await requireSignedIn()
  if (!auth.ok) return auth

  const { data: album, error: albumError } = await auth.supabase
    .from("gallery_albums")
    .select("slug")
    .eq("id", albumId)
    .maybeSingle()

  if (albumError) return { ok: false, error: albumError.message }
  if (!album) return { ok: false, error: "Album not found." }

  const positions = normalizeAlbumPositions(imageIds)
  for (const item of positions) {
    const { error } = await auth.supabase
      .from("gallery_album_images")
      .update({ position: item.position })
      .eq("album_id", albumId)
      .eq("image_id", item.image_id)
    if (error) return { ok: false, error: error.message }
  }

  await auth.supabase
    .from("gallery_albums")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", albumId)

  revalidateAlbumPaths(album.slug)
  return { ok: true }
}
