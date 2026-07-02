"use server"

import { revalidatePath } from "next/cache"

import { isValidClientObjectPath } from "@/lib/gallery/object-path"
import { createClient } from "@/lib/supabase/server"

export type ActionResult = { ok: true } | { ok: false; error: string }
export type RegisterResult =
  | { ok: true; id: string }
  | { ok: false; error: string }

export type RegisterMediaInput = {
  name: string
  imagePath: string
  mediaType: "image" | "video"
  posterPath?: string | null
  durationSeconds?: number | null
  sequenceId?: string | null
  sequenceIndex?: number | null
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

  const expectedNames = new Set(
    expectedPaths.map((p) => p.slice(userId.length + 1))
  )

  let uploaded = false
  for (let attempt = 0; attempt < 5 && !uploaded; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, 120))
    }
    const { data: files, error: listError } = await supabase.storage
      .from("gallery")
      .list(userId, { limit: 1000 })

    if (listError) {
      return {
        ok: false,
        error: `Could not verify upload: ${listError.message}`,
      }
    }
    const present = new Set((files ?? []).map((f) => f.name))
    uploaded = [...expectedNames].every((n) => present.has(n))
  }
  if (!uploaded) {
    return {
      ok: false,
      error: "File not found in storage. Try uploading again.",
    }
  }

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
  }

  const { data: inserted, error: insertError } = await supabase
    .from("gallery_images")
    .insert(insertPayload)
    .select("id")
    .single()

  if (insertError || !inserted) {
    await supabase.storage.from("gallery").remove(expectedPaths)
    return {
      ok: false,
      error: `Database insert failed: ${insertError?.message ?? "Unknown error."}`,
    }
  }

  revalidatePath("/")
  revalidatePath("/upload")
  return { ok: true, id: inserted.id }
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
  }

  revalidatePath("/")
  revalidatePath("/upload")
  return { ok: true }
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

export async function renameGalleryImage(
  id: string,
  newName: string
): Promise<ActionResult> {
  const trimmed = newName.trim()
  if (!trimmed) {
    return { ok: false, error: "Name is required." }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("gallery_images")
    .update({ name: trimmed })
    .eq("id", id)
    .select("id")

  if (error) {
    return { ok: false, error: `Rename failed: ${error.message}` }
  }
  if (!data?.length) {
    return { ok: false, error: "Could not update this work." }
  }

  revalidatePath("/")
  revalidatePath("/upload")
  return { ok: true }
}
