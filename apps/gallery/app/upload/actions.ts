"use server"

import { revalidatePath } from "next/cache"

import {
  describeNothingSelectedError,
  describeSelectAtLeastOneWorkError,
} from "@/lib/gallery/action-errors"
import { attachGalleryTagsToImage } from "@/app/actions/tags"
import { sanitizeClientTakenAt } from "@/lib/gallery/extract-taken-at"
import {
  isGallerySequenceUnavailable,
  isGalleryTakenAtUnavailable,
  isGalleryVideoColumnsUnavailable,
} from "@/lib/gallery/manage-uploads"
import { isValidClientObjectPath } from "@/lib/gallery/object-path"
import {
  buildSequenceRenamePatches,
  normalizeArtworkRenameDraft,
  shouldCascadeSequenceRename,
} from "@/lib/gallery/rename-artwork"
import {
  allObjectNamesPresent,
  DEFAULT_VERIFY_PLAN,
  objectNamesFromPaths,
  storageSearchOptions,
} from "@/lib/gallery/storage-verify"
import { parseGalleryTagList } from "@/lib/gallery/tags"
import { createClient } from "@/lib/supabase/server"

export type ActionResult =
  | { ok: true; warning?: string }
  | { ok: false; error: string }
export type RegisterResult =
  | { ok: true; id: string; warning?: string }
  | { ok: false; error: string }

export type RegisterMediaInput = {
  name: string
  imagePath: string
  mediaType: "image" | "video"
  posterPath?: string | null
  durationSeconds?: number | null
  sequenceId?: string | null
  sequenceIndex?: number | null
  tagNames?: string[]
  /** ISO capture time from EXIF when known; server falls back to now(). */
  takenAt?: string | null
}

/**
 * Registers a gallery row after the browser uploads the file directly to
 * Supabase Storage — avoids Vercel's ~4.5MB Server Action body limit (413).
 */
export async function registerGalleryImage(
  input: RegisterMediaInput
): Promise<RegisterResult> {
  const trimmed = input.name.trim()
  if (!trimmed) return { ok: false, error: "Name is required." }
  if (!input.imagePath) return { ok: false, error: "Missing media path." }
  if (input.mediaType !== "image" && input.mediaType !== "video") {
    return { ok: false, error: "Invalid media type." }
  }
  if (input.mediaType === "video" && !input.posterPath) {
    return { ok: false, error: "Video uploads require a poster image." }
  }
  if (input.mediaType === "image" && input.posterPath) {
    return { ok: false, error: "Images must not have a poster path." }
  }
  if (
    (input.sequenceId && input.sequenceIndex == null) ||
    (!input.sequenceId && input.sequenceIndex != null)
  ) {
    return { ok: false, error: "Sequence metadata is incomplete." }
  }
  if (input.sequenceIndex != null && input.sequenceIndex < 0) {
    return { ok: false, error: "Invalid sequence index." }
  }

  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const userId = claimsData?.claims?.sub
  if (!userId) return { ok: false, error: "Not signed in." }

  if (!isValidClientObjectPath(input.imagePath, userId)) {
    return { ok: false, error: "Invalid media path." }
  }
  if (
    input.posterPath &&
    !isValidClientObjectPath(input.posterPath, userId, { imageOnly: true })
  ) {
    return { ok: false, error: "Invalid poster path." }
  }

  const expectedPaths = [input.imagePath]
  if (input.posterPath) expectedPaths.push(input.posterPath)

  const expectedNames = objectNamesFromPaths(expectedPaths, userId)

  // Path-scoped search + backoff — bare list(limit:1000) misses objects when
  // the folder is large or Storage listing lags on mobile networks.
  let uploaded = false
  let lastListError: string | null = null
  for (
    let attempt = 0;
    attempt < DEFAULT_VERIFY_PLAN.attempts && !uploaded;
    attempt++
  ) {
    const delay = DEFAULT_VERIFY_PLAN.delayBeforeMs(attempt)
    if (delay > 0) {
      await new Promise((r) => setTimeout(r, delay))
    }

    const listedNames: string[] = []
    let listFailed = false
    for (const name of expectedNames) {
      const { data: files, error: listError } = await supabase.storage
        .from("gallery")
        .list(userId, storageSearchOptions(name))

      if (listError) {
        lastListError = listError.message
        listFailed = true
        break
      }
      for (const file of files ?? []) {
        if (file.name) listedNames.push(file.name)
      }
    }
    if (listFailed) continue

    uploaded = allObjectNamesPresent(expectedNames, listedNames)

    // Fallback: signed URL succeeds only when the object is readable.
    if (!uploaded) {
      let signedOk = true
      for (const path of expectedPaths) {
        const { data, error } = await supabase.storage
          .from("gallery")
          .createSignedUrl(path, 60)
        if (error || !data?.signedUrl) {
          signedOk = false
          break
        }
      }
      uploaded = signedOk
    }
  }
  if (!uploaded) {
    return {
      ok: false,
      error: lastListError
        ? `Could not verify upload: ${lastListError}`
        : "File not found in storage. Try uploading again.",
    }
  }

  const takenAt = sanitizeClientTakenAt(input.takenAt)

  const insertPayload: Record<string, unknown> = {
    name: trimmed,
    image_path: input.imagePath,
    media_type: input.mediaType,
    poster_path: input.posterPath ?? null,
    duration_seconds:
      input.mediaType === "video" && input.durationSeconds
        ? Math.max(1, Math.round(input.durationSeconds))
        : null,
    created_by: userId,
    sequence_id: input.sequenceId ?? null,
    sequence_index: input.sequenceIndex ?? null,
    ...(takenAt ? { taken_at: takenAt } : {}),
  }

  // Idempotent retry: if this sequence slot already exists for the uploader,
  // treat the earlier insert as success and drop the duplicate storage object.
  if (input.sequenceId != null && input.sequenceIndex != null) {
    const { data: existingSlot } = await supabase
      .from("gallery_images")
      .select("id")
      .eq("sequence_id", input.sequenceId)
      .eq("sequence_index", input.sequenceIndex)
      .eq("created_by", userId)
      .maybeSingle()

    if (existingSlot?.id) {
      await supabase.storage.from("gallery").remove(expectedPaths)
      revalidatePath("/")
      revalidatePath("/upload")
      revalidatePath("/memories")
      return { ok: true, id: existingSlot.id }
    }
  }

  let { data: inserted, error: insertError } = await supabase
    .from("gallery_images")
    .insert(insertPayload)
    .select("id")
    .single()

  // Soft-fail: Memories migration not applied yet — register without taken_at.
  if (
    insertError &&
    takenAt &&
    "taken_at" in insertPayload &&
    isGalleryTakenAtUnavailable(insertError)
  ) {
    const { taken_at: _dropped, ...withoutTakenAt } = insertPayload
    void _dropped
    const retry = await supabase
      .from("gallery_images")
      .insert(withoutTakenAt)
      .select("id")
      .single()
    inserted = retry.data
    insertError = retry.error
  }

  // Soft-fail: sequence columns missing — singles still register; bursts abort.
  if (insertError && isGallerySequenceUnavailable(insertError)) {
    if (input.sequenceId != null || input.sequenceIndex != null) {
      await supabase.storage.from("gallery").remove(expectedPaths)
      return {
        ok: false,
        error:
          "Sequences are not available yet — apply the gallery sequence migration.",
      }
    }
    const {
      sequence_id: _seqId,
      sequence_index: _seqIndex,
      ...withoutSequence
    } = insertPayload
    void _seqId
    void _seqIndex
    const retry = await supabase
      .from("gallery_images")
      .insert(withoutSequence)
      .select("id")
      .single()
    inserted = retry.data
    insertError = retry.error
  }

  // Soft-fail: video columns missing — images peel fields; videos abort.
  if (insertError && isGalleryVideoColumnsUnavailable(insertError)) {
    if (input.mediaType === "video") {
      await supabase.storage.from("gallery").remove(expectedPaths)
      return {
        ok: false,
        error:
          "Video uploads are not available yet — apply the gallery video migration.",
      }
    }
    const {
      media_type: _mediaType,
      poster_path: _posterPath,
      duration_seconds: _duration,
      ...withoutVideo
    } = insertPayload
    void _mediaType
    void _posterPath
    void _duration
    const retry = await supabase
      .from("gallery_images")
      .insert(withoutVideo)
      .select("id")
      .single()
    inserted = retry.data
    insertError = retry.error
  }

  if (insertError || !inserted) {
    // Unique slot race: another request won — resolve to that row.
    if (
      input.sequenceId != null &&
      input.sequenceIndex != null &&
      /duplicate|unique|23505/i.test(insertError?.message ?? "")
    ) {
      const { data: raced } = await supabase
        .from("gallery_images")
        .select("id")
        .eq("sequence_id", input.sequenceId)
        .eq("sequence_index", input.sequenceIndex)
        .eq("created_by", userId)
        .maybeSingle()
      if (raced?.id) {
        await supabase.storage.from("gallery").remove(expectedPaths)
        revalidatePath("/")
        revalidatePath("/upload")
        revalidatePath("/memories")
        return { ok: true, id: raced.id }
      }
    }
    await supabase.storage.from("gallery").remove(expectedPaths)
    return {
      ok: false,
      error: `Database insert failed: ${insertError?.message ?? "Unknown error."}`,
    }
  }

  let warning: string | undefined
  const tagNames = parseGalleryTagList(input.tagNames)
  if (tagNames.length > 0) {
    const attached = await attachGalleryTagsToImage(
      inserted.id,
      tagNames,
      userId,
      supabase
    )
    if (attached.failed > 0) {
      warning =
        attached.failed === 1
          ? "Hung on the wall, but one tag could not be attached."
          : `Hung on the wall, but ${attached.failed} tags could not be attached.`
    }
  }

  revalidatePath("/")
  revalidatePath("/upload")
  revalidatePath("/memories")
  return warning
    ? { ok: true, id: inserted.id, warning }
    : { ok: true, id: inserted.id }
}

export async function deleteGalleryImage(
  id: string,
  imagePath: string,
  posterPath?: string | null
): Promise<ActionResult> {
  const supabase = await createClient()

  const { error: deleteError } = await supabase
    .from("gallery_images")
    .delete()
    .eq("id", id)

  if (deleteError) {
    return { ok: false, error: `Delete failed: ${deleteError.message}` }
  }

  const targets = [imagePath]
  if (posterPath) targets.push(posterPath)
  const { error: storageError } = await supabase.storage
    .from("gallery")
    .remove(targets)
  if (storageError) {
    console.error("[gallery] storage delete failed", storageError)
    revalidatePath("/")
    revalidatePath("/upload")
    return {
      ok: true,
      warning:
        "Removed from the wall, but a storage file may still remain. Retry delete or purge via Media health.",
    }
  }

  revalidatePath("/")
  revalidatePath("/upload")
  return { ok: true }
}

export async function deleteGalleryImages(
  items: {
    id: string
    imagePath: string
    posterPath?: string | null
  }[]
): Promise<ActionResult> {
  if (items.length === 0) {
    return { ok: false, error: describeNothingSelectedError() }
  }

  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const userId = claimsData?.claims?.sub
  if (!userId) return { ok: false, error: "Not signed in." }

  const ids = items.map((item) => item.id)
  const { data: ownedRows, error: fetchError } = await supabase
    .from("gallery_images")
    .select("id")
    .eq("created_by", userId)
    .in("id", ids)

  if (fetchError) {
    return { ok: false, error: `Delete failed: ${fetchError.message}` }
  }
  if ((ownedRows ?? []).length !== ids.length) {
    return { ok: false, error: "Some selected works could not be deleted." }
  }

  let warning: string | undefined
  for (const item of items) {
    const result = await deleteGalleryImage(
      item.id,
      item.imagePath,
      item.posterPath
    )
    if (!result.ok) return result
    if (result.warning) warning = result.warning
  }

  return warning ? { ok: true, warning } : { ok: true }
}

export async function updateGallerySequenceOrder(
  sequenceId: string,
  orderedImageIds: string[]
): Promise<ActionResult> {
  if (!sequenceId) return { ok: false, error: "Missing sequence id." }
  if (orderedImageIds.length === 0) {
    return { ok: false, error: "Sequence is empty." }
  }

  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const userId = claimsData?.claims?.sub
  if (!userId) return { ok: false, error: "Not signed in." }

  const uniqueIds = Array.from(new Set(orderedImageIds))
  if (uniqueIds.length !== orderedImageIds.length) {
    return { ok: false, error: "Duplicate shots in sequence order." }
  }

  const { data: rows, error: fetchError } = await supabase
    .from("gallery_images")
    .select("id")
    .eq("sequence_id", sequenceId)
    .eq("created_by", userId)

  if (fetchError) {
    if (isGallerySequenceUnavailable(fetchError)) {
      return {
        ok: false,
        error:
          "Sequences are not available yet — apply the gallery sequence migration.",
      }
    }
    return { ok: false, error: `Sequence load failed: ${fetchError.message}` }
  }

  const existingIds = new Set((rows ?? []).map((row) => row.id))
  if (existingIds.size !== orderedImageIds.length) {
    return { ok: false, error: "Sequence shots do not match your uploads." }
  }
  for (const id of orderedImageIds) {
    if (!existingIds.has(id)) {
      return { ok: false, error: "Sequence shots do not match your uploads." }
    }
  }

  for (let index = 0; index < orderedImageIds.length; index++) {
    const imageId = orderedImageIds[index]!
    const { error } = await supabase
      .from("gallery_images")
      .update({ sequence_index: index })
      .eq("id", imageId)
      .eq("created_by", userId)
      .eq("sequence_id", sequenceId)

    if (error) {
      if (isGallerySequenceUnavailable(error)) {
        return {
          ok: false,
          error:
            "Sequences are not available yet — apply the gallery sequence migration.",
        }
      }
      return {
        ok: false,
        error: `Could not reorder sequence: ${error.message}`,
      }
    }
  }

  revalidatePath("/")
  revalidatePath("/upload")
  return { ok: true }
}

export type RenameGalleryImageResult =
  | { ok: true; names: { id: string; name: string }[] }
  | { ok: false; error: string }

export async function renameGalleryImage(
  id: string,
  newName: string
): Promise<RenameGalleryImageResult> {
  const nextName = normalizeArtworkRenameDraft(newName)

  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const userId = claimsData?.claims?.sub
  if (!userId) return { ok: false, error: "Not signed in." }

  const { data: currentRow, error: currentRowError } = await supabase
    .from("gallery_images")
    .select("id, sequence_id, sequence_index")
    .eq("id", id)
    .eq("created_by", userId)
    .single()

  if (currentRowError) {
    if (isGallerySequenceUnavailable(currentRowError)) {
      const { error: updateError } = await supabase
        .from("gallery_images")
        .update({ name: nextName })
        .eq("id", id)
        .eq("created_by", userId)

      if (updateError) {
        return { ok: false, error: `Rename failed: ${updateError.message}` }
      }

      revalidatePath("/")
      revalidatePath("/upload")
      return { ok: true, names: [{ id, name: nextName }] }
    }
    return {
      ok: false,
      error: `Could not load this work: ${currentRowError.message}`,
    }
  }

  // Cover rename cascades across the burst so wall + strip stay consistent.
  if (
    shouldCascadeSequenceRename(
      currentRow?.sequence_id,
      currentRow?.sequence_index
    )
  ) {
    const sequenceId = currentRow.sequence_id as string

    const { data: sequenceRows, error: seqLoadError } = await supabase
      .from("gallery_images")
      .select("id, sequence_index")
      .eq("created_by", userId)
      .eq("sequence_id", sequenceId)
      .order("sequence_index", { ascending: true })

    if (seqLoadError) {
      if (isGallerySequenceUnavailable(seqLoadError)) {
        const { error: updateError } = await supabase
          .from("gallery_images")
          .update({ name: nextName })
          .eq("id", id)
          .eq("created_by", userId)

        if (updateError) {
          return { ok: false, error: `Rename failed: ${updateError.message}` }
        }

        revalidatePath("/")
        revalidatePath("/upload")
        return { ok: true, names: [{ id, name: nextName }] }
      }
      return {
        ok: false,
        error: `Rename sequence failed: ${seqLoadError.message}`,
      }
    }

    const patches = buildSequenceRenamePatches(sequenceRows ?? [], nextName)

    for (const patch of patches) {
      const { error: updateError } = await supabase
        .from("gallery_images")
        .update({ name: patch.name })
        .eq("id", patch.id)
        .eq("created_by", userId)

      if (updateError) {
        return { ok: false, error: `Rename failed: ${updateError.message}` }
      }
    }

    revalidatePath("/")
    revalidatePath("/upload")
    return { ok: true, names: patches }
  }

  const { error: updateError } = await supabase
    .from("gallery_images")
    .update({ name: nextName })
    .eq("id", id)
    .eq("created_by", userId)

  if (updateError) {
    return { ok: false, error: `Rename failed: ${updateError.message}` }
  }

  revalidatePath("/")
  revalidatePath("/upload")
  return { ok: true, names: [{ id, name: nextName }] }
}

export type UpdateGalleryImageTakenAtResult =
  | { ok: true; takenAt: string }
  | { ok: false; error: string }

export async function updateGalleryImageTakenAt(
  id: string,
  rawTakenAt: string
): Promise<UpdateGalleryImageTakenAtResult> {
  const takenAt = sanitizeClientTakenAt(rawTakenAt)
  if (!takenAt) {
    return { ok: false, error: "That capture date does not look valid." }
  }

  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const userId = claimsData?.claims?.sub
  if (!userId) return { ok: false, error: "Not signed in." }

  const { error } = await supabase
    .from("gallery_images")
    .update({ taken_at: takenAt })
    .eq("id", id)
    .eq("created_by", userId)

  if (error) {
    if (isGalleryTakenAtUnavailable(error)) {
      return {
        ok: false,
        error:
          "Capture dates need the gallery Memories migration. Ask an admin to apply it.",
      }
    }
    return {
      ok: false,
      error: `Could not update capture date: ${error.message}`,
    }
  }

  revalidatePath("/")
  revalidatePath("/upload")
  revalidatePath("/memories")
  return { ok: true, takenAt }
}

export type UpdateGalleryImagesTakenAtResult =
  | { ok: true; takenAt: string; updated: number }
  | { ok: false; error: string }

/** Set one capture date across many Manage rows (Memories repair). */
export async function updateGalleryImagesTakenAt(
  ids: string[],
  rawTakenAt: string
): Promise<UpdateGalleryImagesTakenAtResult> {
  const takenAt = sanitizeClientTakenAt(rawTakenAt)
  if (!takenAt) {
    return { ok: false, error: "That capture date does not look valid." }
  }

  const uniqueIds = [...new Set(ids.map((id) => id.trim()).filter(Boolean))]
  if (uniqueIds.length === 0) {
    return { ok: false, error: describeSelectAtLeastOneWorkError() }
  }
  if (uniqueIds.length > 100) {
    return { ok: false, error: "Select at most 100 works at a time." }
  }

  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const userId = claimsData?.claims?.sub
  if (!userId) return { ok: false, error: "Not signed in." }

  const { error, count } = await supabase
    .from("gallery_images")
    .update({ taken_at: takenAt }, { count: "exact" })
    .in("id", uniqueIds)
    .eq("created_by", userId)

  if (error) {
    if (isGalleryTakenAtUnavailable(error)) {
      return {
        ok: false,
        error:
          "Capture dates need the gallery Memories migration. Ask an admin to apply it.",
      }
    }
    return {
      ok: false,
      error: `Could not update capture dates: ${error.message}`,
    }
  }

  revalidatePath("/")
  revalidatePath("/upload")
  revalidatePath("/memories")
  return { ok: true, takenAt, updated: count ?? uniqueIds.length }
}
