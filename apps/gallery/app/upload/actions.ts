"use server"

import { revalidatePath } from "next/cache"

import { ALLOWED_MIME, inferMimeFromFilename } from "@/lib/gallery/mime"
import { createClient } from "@/lib/supabase/server"

export type ActionResult = { ok: true } | { ok: false; error: string }

/**
 * Registers a gallery row after the browser uploads the file directly to
 * Supabase Storage — avoids Vercel's ~4.5MB Server Action body limit (413).
 */
export async function registerGalleryImage(
  name: string,
  imagePath: string
): Promise<ActionResult> {
  const trimmed = name.trim()
  if (!trimmed) return { ok: false, error: "Name is required." }
  if (!imagePath) return { ok: false, error: "Missing image path." }

  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const userId = claimsData?.claims?.sub
  if (!userId) return { ok: false, error: "Not signed in." }

  if (!isValidClientObjectPath(imagePath, userId)) {
    return { ok: false, error: "Invalid image path." }
  }

  const fileName = imagePath.slice(userId.length + 1)
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
    uploaded = files?.some((f) => f.name === fileName) ?? false
  }
  if (!uploaded) {
    return {
      ok: false,
      error: "File not found in storage. Try uploading again.",
    }
  }

  const { error: insertError } = await supabase.from("gallery_images").insert({
    name: trimmed,
    image_path: imagePath,
    created_by: userId,
  })

  if (insertError) {
    await supabase.storage.from("gallery").remove([imagePath])
    return {
      ok: false,
      error: `Database insert failed: ${insertError.message}`,
    }
  }

  revalidatePath("/")
  revalidatePath("/upload")
  return { ok: true }
}

export async function deleteGalleryImage(
  id: string,
  imagePath: string
): Promise<ActionResult> {
  const supabase = await createClient()

  const { error: deleteError } = await supabase
    .from("gallery_images")
    .delete()
    .eq("id", id)

  if (deleteError) {
    return { ok: false, error: `Delete failed: ${deleteError.message}` }
  }

  // Storage cleanup. Best-effort — RLS already gated the row delete, so if
  // this somehow fails we still log and move on; orphan objects are cheap.
  const { error: storageError } = await supabase.storage
    .from("gallery")
    .remove([imagePath])
  if (storageError) {
    console.error("[gallery] storage delete failed", storageError)
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

const UUID_FILE_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.([a-z0-9]{2,5})$/i

function isValidClientObjectPath(imagePath: string, userId: string): boolean {
  if (!imagePath.startsWith(`${userId}/`)) return false
  const rest = imagePath.slice(userId.length + 1)
  if (!rest || rest.includes("/") || rest.includes("..")) return false

  const m = UUID_FILE_RE.exec(rest)
  if (!m?.[1]) return false
  const ext = m[1].toLowerCase()
  const pseudoMime =
    ext === "jpg" ? "image/jpeg" : inferMimeFromFilename(`x.${ext}`)
  if (!pseudoMime || !ALLOWED_MIME.has(pseudoMime)) return false
  return true
}
