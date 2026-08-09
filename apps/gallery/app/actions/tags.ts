"use server"

import { revalidatePath } from "next/cache"

import {
  GALLERY_TAGS_PER_IMAGE_MAX,
  normalizeGalleryTagName,
  normalizeGalleryTagSlug,
  type GalleryTag,
  type GalleryTagSuggestion,
} from "@/lib/gallery/tags"
import { createClient } from "@/lib/supabase/server"

export type TagActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string }

async function ensureGalleryTag(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  rawName: string
): Promise<TagActionResult<GalleryTag>> {
  const name = normalizeGalleryTagName(rawName)
  const slug = name ? normalizeGalleryTagSlug(name) : null
  if (!name || !slug) {
    return { ok: false, error: "Tag name is empty or invalid." }
  }

  const { data: existing, error: existingError } = await supabase
    .from("gallery_tags")
    .select("id, name, slug")
    .eq("slug", slug)
    .maybeSingle()

  if (existingError) {
    return { ok: false, error: existingError.message }
  }
  if (existing) {
    return {
      ok: true,
      data: { id: existing.id, name: existing.name, slug: existing.slug },
    }
  }

  const { data: inserted, error: insertError } = await supabase
    .from("gallery_tags")
    .insert({ name, slug, created_by: userId })
    .select("id, name, slug")
    .single()

  if (insertError) {
    if (/duplicate|unique|23505/i.test(insertError.message)) {
      const { data: raced } = await supabase
        .from("gallery_tags")
        .select("id, name, slug")
        .eq("slug", slug)
        .maybeSingle()
      if (raced) {
        return {
          ok: true,
          data: { id: raced.id, name: raced.name, slug: raced.slug },
        }
      }
    }
    return { ok: false, error: insertError.message }
  }

  return {
    ok: true,
    data: { id: inserted.id, name: inserted.name, slug: inserted.slug },
  }
}

export async function listPopularGalleryTags(
  limit = 40
): Promise<TagActionResult<GalleryTagSuggestion[]>> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("gallery_list_popular_tags", {
    p_limit: Math.max(1, Math.min(limit, 100)),
  })

  if (error) {
    if (/gallery_list_popular_tags/i.test(error.message)) {
      return { ok: true, data: [] }
    }
    return { ok: false, error: error.message }
  }

  const tags = ((data ?? []) as GalleryTagSuggestion[]).map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    use_count: Number(row.use_count) || 0,
  }))

  return { ok: true, data: tags }
}

export async function attachGalleryTag(
  imageId: string,
  rawName: string
): Promise<TagActionResult<GalleryTag>> {
  if (!imageId) return { ok: false, error: "Missing image id." }

  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const userId = claimsData?.claims?.sub
  if (!userId) return { ok: false, error: "Please sign in first." }

  const { count, error: countError } = await supabase
    .from("gallery_image_tags")
    .select("tag_id", { count: "exact", head: true })
    .eq("image_id", imageId)

  if (countError) return { ok: false, error: countError.message }
  if ((count ?? 0) >= GALLERY_TAGS_PER_IMAGE_MAX) {
    return {
      ok: false,
      error: `At most ${GALLERY_TAGS_PER_IMAGE_MAX} tags per photo.`,
    }
  }

  const ensured = await ensureGalleryTag(supabase, userId, rawName)
  if (!ensured.ok) return ensured

  const { error: linkError } = await supabase
    .from("gallery_image_tags")
    .insert({
      image_id: imageId,
      tag_id: ensured.data.id,
      created_by: userId,
    })

  if (linkError) {
    if (/duplicate|unique|23505/i.test(linkError.message)) {
      return { ok: true, data: ensured.data }
    }
    return { ok: false, error: linkError.message }
  }

  revalidatePath("/")
  return { ok: true, data: ensured.data }
}

export async function detachGalleryTag(
  imageId: string,
  tagId: string
): Promise<TagActionResult> {
  if (!imageId || !tagId) {
    return { ok: false, error: "Missing image or tag id." }
  }

  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const userId = claimsData?.claims?.sub
  if (!userId) return { ok: false, error: "Please sign in first." }

  const { error } = await supabase
    .from("gallery_image_tags")
    .delete()
    .eq("image_id", imageId)
    .eq("tag_id", tagId)

  if (error) return { ok: false, error: error.message }

  revalidatePath("/")
  return { ok: true }
}

export async function attachGalleryTagsToImage(
  imageId: string,
  rawNames: string[],
  userId: string,
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<void> {
  for (const raw of rawNames) {
    const ensured = await ensureGalleryTag(supabase, userId, raw)
    if (!ensured.ok) continue
    const { error } = await supabase.from("gallery_image_tags").insert({
      image_id: imageId,
      tag_id: ensured.data.id,
      created_by: userId,
    })
    if (error && !/duplicate|unique|23505/i.test(error.message)) {
      console.error("[gallery] attach tag on upload failed", error)
    }
  }
}
