"use server"

import { revalidatePath } from "next/cache"

import {
  GALLERY_ALBUM_PHOTOS_MAX,
  isGalleryAlbumsUnavailable,
  normalizeAlbumPositions,
  normalizeGalleryAlbumDescription,
  normalizeGalleryAlbumImageIds,
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

function albumErrorResult(error: { message?: string; code?: string }): {
  ok: false
  error: string
} {
  if (isGalleryAlbumsUnavailable(error)) {
    return { ok: false, error: "Albums are not available yet." }
  }
  return { ok: false, error: error.message ?? "Album action failed." }
}

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
    return albumErrorResult(error)
  }

  revalidateAlbumPaths(data.slug)
  return { ok: true, data: { id: data.id, slug: data.slug, title: data.title } }
}

/** Create an album and immediately attach the given covers. */
export async function createGalleryAlbumWithImages(input: {
  title: string
  description?: string | null
  imageIds: string[]
}): Promise<
  AlbumActionResult<{
    id: string
    slug: string
    title: string
    added: number
  }>
> {
  const created = await createGalleryAlbum({
    title: input.title,
    description: input.description,
  })
  if (!created.ok) return created

  const added = await addImagesToGalleryAlbum(created.data.id, input.imageIds)
  if (!added.ok) {
    return {
      ok: true,
      data: {
        ...created.data,
        added: 0,
      },
    }
  }

  return {
    ok: true,
    data: {
      ...created.data,
      added: added.data.added,
    },
  }
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

  if (existingError) return albumErrorResult(existingError)
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
      if (memberError) return albumErrorResult(memberError)
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
    return albumErrorResult(error)
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

  if (existingError) return albumErrorResult(existingError)
  if (!existing) return { ok: false, error: "Album not found." }

  const { error } = await auth.supabase
    .from("gallery_albums")
    .delete()
    .eq("id", albumId)

  if (error) return albumErrorResult(error)

  revalidateAlbumPaths(existing.slug)
  return { ok: true }
}

export async function addImageToGalleryAlbum(
  albumId: string,
  imageId: string
): Promise<AlbumActionResult<{ added: number }>> {
  return addImagesToGalleryAlbum(albumId, [imageId])
}

export async function addImagesToGalleryAlbum(
  albumId: string,
  imageIds: string[]
): Promise<AlbumActionResult<{ added: number }>> {
  if (!albumId) return { ok: false, error: "Missing album id." }

  const ids = normalizeGalleryAlbumImageIds(imageIds)
  if (ids.length === 0) {
    return { ok: false, error: "Select at least one photo." }
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

  const { data: addedCount, error: rpcError } = await auth.supabase.rpc(
    "gallery_album_add_images",
    {
      p_album_id: albumId,
      p_image_ids: ids,
    }
  )

  if (!rpcError) {
    revalidateAlbumPaths(album.slug)
    return { ok: true, data: { added: Number(addedCount) || 0 } }
  }

  // Soft-fall back when migration 20260814020000 is not applied yet.
  if (!isGalleryAlbumsUnavailable(rpcError)) {
    return { ok: false, error: rpcError.message }
  }

  const { count, error: countError } = await auth.supabase
    .from("gallery_album_images")
    .select("image_id", { count: "exact", head: true })
    .eq("album_id", albumId)

  if (countError) return { ok: false, error: countError.message }
  const existing = count ?? 0
  if (existing >= GALLERY_ALBUM_PHOTOS_MAX) {
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

  let nextPosition = (maxPos?.position ?? -1) + 1
  let added = 0
  let firstAdded: string | null = null
  const capacity = GALLERY_ALBUM_PHOTOS_MAX - existing

  for (const imageId of ids.slice(0, capacity)) {
    const { error: linkError } = await auth.supabase
      .from("gallery_album_images")
      .insert({
        album_id: albumId,
        image_id: imageId,
        position: nextPosition,
        added_by: auth.userId,
      })

    if (linkError) {
      if (/duplicate|unique|23505/i.test(linkError.message)) continue
      return { ok: false, error: linkError.message }
    }
    if (!firstAdded) firstAdded = imageId
    added += 1
    nextPosition += 1
  }

  if (!album.cover_image_id && firstAdded) {
    await auth.supabase
      .from("gallery_albums")
      .update({
        cover_image_id: firstAdded,
        updated_at: new Date().toISOString(),
      })
      .eq("id", albumId)
  } else if (added > 0) {
    await auth.supabase
      .from("gallery_albums")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", albumId)
  }

  revalidateAlbumPaths(album.slug)
  return { ok: true, data: { added } }
}

export async function removeImageFromGalleryAlbum(
  albumId: string,
  imageId: string
): Promise<AlbumActionResult> {
  return removeImagesFromGalleryAlbum(albumId, [imageId])
}

export async function removeImagesFromGalleryAlbum(
  albumId: string,
  imageIds: string[]
): Promise<AlbumActionResult<{ removed: number }>> {
  if (!albumId) return { ok: false, error: "Missing album id." }

  const ids = normalizeGalleryAlbumImageIds(imageIds)
  if (ids.length === 0) {
    return { ok: false, error: "Select at least one photo." }
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

  const { data: removedCount, error: rpcError } = await auth.supabase.rpc(
    "gallery_album_remove_images",
    {
      p_album_id: albumId,
      p_image_ids: ids,
    }
  )

  if (!rpcError) {
    revalidateAlbumPaths(album.slug)
    return { ok: true, data: { removed: Number(removedCount) || 0 } }
  }

  // Soft-fall back when migration / RPC is not applied yet.
  if (!isGalleryAlbumsUnavailable(rpcError)) {
    return { ok: false, error: rpcError.message }
  }

  const { error } = await auth.supabase
    .from("gallery_album_images")
    .delete()
    .eq("album_id", albumId)
    .in("image_id", ids)

  if (error) return { ok: false, error: error.message }

  const coverWasRemoved =
    album.cover_image_id != null && ids.includes(album.cover_image_id)

  if (coverWasRemoved) {
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
  return { ok: true, data: { removed: ids.length } }
}

export async function removeImagesFromGalleryAlbumBySlug(
  albumSlug: string,
  imageIds: string[]
): Promise<AlbumActionResult<{ removed: number }>> {
  const slug = normalizeGalleryAlbumSlug(albumSlug)
  if (!slug) return { ok: false, error: "Missing album." }

  const auth = await requireSignedIn()
  if (!auth.ok) return auth

  const { data: album, error } = await auth.supabase
    .from("gallery_albums")
    .select("id")
    .eq("slug", slug)
    .maybeSingle()

  if (error) {
    return albumErrorResult(error)
  }
  if (!album) return { ok: false, error: "Album not found." }

  return removeImagesFromGalleryAlbum(album.id, imageIds)
}

export async function reorderGalleryAlbumImages(
  albumId: string,
  imageIds: string[]
): Promise<AlbumActionResult<{ updated: number }>> {
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
  const orderedIds = positions.map((item) => item.image_id)
  if (orderedIds.length === 0) {
    return { ok: false, error: "Select at least one photo." }
  }

  const { data: updatedCount, error: rpcError } = await auth.supabase.rpc(
    "gallery_album_reorder_images",
    {
      p_album_id: albumId,
      p_image_ids: orderedIds,
    }
  )

  if (!rpcError) {
    revalidateAlbumPaths(album.slug)
    return { ok: true, data: { updated: Number(updatedCount) || 0 } }
  }

  // Soft-fall back when migration 20260815010000 is not applied yet.
  if (!isGalleryAlbumsUnavailable(rpcError)) {
    return { ok: false, error: rpcError.message }
  }

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
  return { ok: true, data: { updated: positions.length } }
}
