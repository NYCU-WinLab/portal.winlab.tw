"use server"

import { revalidatePath } from "next/cache"

import {
  GALLERY_TAGS_PER_IMAGE_MAX,
  isGalleryTagsUnavailable,
  normalizeGalleryTagName,
  normalizeGalleryTagSlug,
  type GalleryTag,
  type GalleryTagSuggestion,
} from "@/lib/gallery/tags"
import {
  describeCouldNotAttachTagError,
  describePleaseSignInFirst,
  describeTagAdminUnavailableError,
  describeTagNameInvalidError,
  describeTagNotFoundError,
  describeTagsUnavailableError,
} from "@/lib/gallery/action-errors"
import { describeSelectAtLeastOnePhoto } from "@/lib/gallery/validation-toasts"
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
    return { ok: false, error: describeTagNameInvalidError() }
  }

  const { data: existing, error: existingError } = await supabase
    .from("gallery_tags")
    .select("id, name, slug")
    .eq("slug", slug)
    .maybeSingle()

  if (existingError) {
    if (isGalleryTagsUnavailable(existingError)) {
      return { ok: false, error: describeTagsUnavailableError() }
    }
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
    if (isGalleryTagsUnavailable(insertError)) {
      return { ok: false, error: describeTagsUnavailableError() }
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
    if (isGalleryTagsUnavailable(error)) {
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
  const result = await attachGalleryTagToImages([imageId], rawName)
  if (!result.ok) return result
  if (!result.data.tag) {
    return { ok: false, error: describeCouldNotAttachTagError() }
  }
  return { ok: true, data: result.data.tag }
}

export async function attachGalleryTagToImages(
  imageIds: string[],
  rawName: string
): Promise<TagActionResult<{ tag: GalleryTag; attached: number }>> {
  const ids = Array.from(
    new Set(imageIds.map((id) => id.trim()).filter(Boolean))
  ).slice(0, 200)
  if (ids.length === 0) {
    return { ok: false, error: describeSelectAtLeastOnePhoto() }
  }

  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const userId = claimsData?.claims?.sub
  if (!userId) return { ok: false, error: describePleaseSignInFirst() }

  const ensured = await ensureGalleryTag(supabase, userId, rawName)
  if (!ensured.ok) return ensured

  let attached = 0
  for (const imageId of ids) {
    const { count, error: countError } = await supabase
      .from("gallery_image_tags")
      .select("tag_id", { count: "exact", head: true })
      .eq("image_id", imageId)

    if (countError) {
      if (isGalleryTagsUnavailable(countError)) {
        return { ok: false, error: describeTagsUnavailableError() }
      }
      return { ok: false, error: countError.message }
    }
    if ((count ?? 0) >= GALLERY_TAGS_PER_IMAGE_MAX) continue

    const { error: linkError } = await supabase
      .from("gallery_image_tags")
      .insert({
        image_id: imageId,
        tag_id: ensured.data.id,
        created_by: userId,
      })

    if (linkError) {
      if (/duplicate|unique|23505/i.test(linkError.message)) continue
      if (isGalleryTagsUnavailable(linkError)) {
        return { ok: false, error: describeTagsUnavailableError() }
      }
      return { ok: false, error: linkError.message }
    }
    attached += 1
  }

  revalidatePath("/")
  revalidatePath("/upload")
  return { ok: true, data: { tag: ensured.data, attached } }
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
  if (!userId) return { ok: false, error: describePleaseSignInFirst() }

  const { error } = await supabase
    .from("gallery_image_tags")
    .delete()
    .eq("image_id", imageId)
    .eq("tag_id", tagId)

  if (error) {
    if (isGalleryTagsUnavailable(error)) {
      return { ok: false, error: describeTagsUnavailableError() }
    }
    return { ok: false, error: error.message }
  }

  revalidatePath("/")
  revalidatePath("/upload")
  return { ok: true }
}

export async function detachGalleryTagFromImagesBySlug(
  imageIds: string[],
  tagSlug: string
): Promise<TagActionResult<{ detached: number; tagName: string }>> {
  const ids = Array.from(
    new Set(imageIds.map((id) => id.trim()).filter(Boolean))
  ).slice(0, 200)
  const slug = normalizeGalleryTagSlug(tagSlug)
  if (ids.length === 0) {
    return { ok: false, error: describeSelectAtLeastOnePhoto() }
  }
  if (!slug) return { ok: false, error: "Missing tag." }

  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const userId = claimsData?.claims?.sub
  if (!userId) return { ok: false, error: describePleaseSignInFirst() }

  const { data: tag, error: tagError } = await supabase
    .from("gallery_tags")
    .select("id, name, slug")
    .eq("slug", slug)
    .maybeSingle()

  if (tagError) {
    if (isGalleryTagsUnavailable(tagError)) {
      return { ok: false, error: describeTagsUnavailableError() }
    }
    return { ok: false, error: tagError.message }
  }
  if (!tag) return { ok: false, error: describeTagNotFoundError() }

  const { error, count } = await supabase
    .from("gallery_image_tags")
    .delete({ count: "exact" })
    .eq("tag_id", tag.id)
    .in("image_id", ids)

  if (error) {
    if (isGalleryTagsUnavailable(error)) {
      return { ok: false, error: describeTagsUnavailableError() }
    }
    return { ok: false, error: error.message }
  }

  revalidatePath("/")
  revalidatePath("/upload")
  return {
    ok: true,
    data: { detached: count ?? 0, tagName: tag.name },
  }
}

export async function attachGalleryTagsToImage(
  imageId: string,
  rawNames: string[],
  userId: string,
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<{ attached: number; failed: number }> {
  let attached = 0
  let failed = 0
  for (const raw of rawNames) {
    const ensured = await ensureGalleryTag(supabase, userId, raw)
    if (!ensured.ok) {
      failed += 1
      continue
    }
    const { error } = await supabase.from("gallery_image_tags").insert({
      image_id: imageId,
      tag_id: ensured.data.id,
      created_by: userId,
    })
    if (error && !/duplicate|unique|23505/i.test(error.message)) {
      console.error("[gallery] attach tag on upload failed", error)
      failed += 1
      continue
    }
    attached += 1
  }
  return { attached, failed }
}

export async function adminRenameGalleryTag(
  tagId: string,
  rawName: string
): Promise<TagActionResult<GalleryTag>> {
  if (!tagId) return { ok: false, error: "Missing tag id." }
  const name = normalizeGalleryTagName(rawName)
  if (!name) return { ok: false, error: describeTagNameInvalidError() }

  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const userId = claimsData?.claims?.sub
  if (!userId) return { ok: false, error: describePleaseSignInFirst() }

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("is_admin")
    .eq("id", userId)
    .maybeSingle()
  if (!profile?.is_admin) {
    return { ok: false, error: "Only admins can rename tags." }
  }

  const { data, error } = await supabase.rpc("gallery_admin_rename_tag", {
    p_tag_id: tagId,
    p_new_name: name,
  })

  if (error) {
    if (isGalleryTagsUnavailable(error)) {
      return { ok: false, error: describeTagAdminUnavailableError() }
    }
    return { ok: false, error: error.message }
  }

  const row = Array.isArray(data) ? data[0] : data
  if (!row?.id) return { ok: false, error: "Rename failed." }

  revalidatePath("/")
  revalidatePath("/upload")
  return {
    ok: true,
    data: { id: row.id, name: row.name, slug: row.slug },
  }
}

export async function adminMergeGalleryTags(
  sourceTagId: string,
  targetTagId: string
): Promise<TagActionResult<GalleryTag & { moved_count: number }>> {
  if (!sourceTagId || !targetTagId) {
    return { ok: false, error: "Missing source or target tag." }
  }
  if (sourceTagId === targetTagId) {
    return { ok: false, error: "Pick two different tags to merge." }
  }

  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const userId = claimsData?.claims?.sub
  if (!userId) return { ok: false, error: describePleaseSignInFirst() }

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("is_admin")
    .eq("id", userId)
    .maybeSingle()
  if (!profile?.is_admin) {
    return { ok: false, error: "Only admins can merge tags." }
  }

  const { data, error } = await supabase.rpc("gallery_admin_merge_tags", {
    p_source_id: sourceTagId,
    p_target_id: targetTagId,
  })

  if (error) {
    if (isGalleryTagsUnavailable(error)) {
      return { ok: false, error: describeTagAdminUnavailableError() }
    }
    return { ok: false, error: error.message }
  }

  const row = Array.isArray(data) ? data[0] : data
  if (!row?.id) return { ok: false, error: "Merge failed." }

  revalidatePath("/")
  revalidatePath("/upload")
  return {
    ok: true,
    data: {
      id: row.id,
      name: row.name,
      slug: row.slug,
      moved_count: Number(row.moved_count) || 0,
    },
  }
}

/** Tags attached to one image (Manage / lightbox loaders). */
export async function listGalleryImageTags(
  imageId: string
): Promise<TagActionResult<GalleryTag[]>> {
  const id = imageId.trim()
  if (!id) return { ok: false, error: "Missing image." }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("gallery_image_tags")
    .select("gallery_tags(id, name, slug)")
    .eq("image_id", id)

  if (error) {
    if (isGalleryTagsUnavailable(error)) {
      return { ok: false, error: describeTagsUnavailableError() }
    }
    return { ok: false, error: error.message }
  }

  const tags: GalleryTag[] = []
  for (const row of data ?? []) {
    const tagValue = row.gallery_tags as
      | GalleryTag
      | GalleryTag[]
      | null
      | undefined
    const tag = Array.isArray(tagValue) ? tagValue[0] : tagValue
    if (!tag?.id || !tag.name || !tag.slug) continue
    tags.push({ id: tag.id, name: tag.name, slug: tag.slug })
  }

  tags.sort((a, b) => a.name.localeCompare(b.name))
  return { ok: true, data: tags }
}
