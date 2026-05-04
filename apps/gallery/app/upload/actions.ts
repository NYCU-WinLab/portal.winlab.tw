"use server"

import { randomUUID } from "node:crypto"
import { revalidatePath } from "next/cache"

import { createClient } from "@/lib/supabase/server"

export type ActionResult = { ok: true } | { ok: false; error: string }

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
  "image/heic",
  "image/heif",
])

export async function uploadGalleryImage(
  formData: FormData
): Promise<ActionResult> {
  const name = (formData.get("name") as string | null)?.trim() ?? ""
  const file = formData.get("file") as File | null

  if (!name) return { ok: false, error: "Name is required." }
  if (!file || !(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Pick an image file." }
  }

  const resolvedMime = resolveImageMimeType(file)
  if (!resolvedMime) {
    return {
      ok: false,
      error: `Unsupported file type: ${file.type || "unknown"}. Use JPEG, PNG, WebP, GIF, AVIF, or HEIC.`,
    }
  }
  if (!ALLOWED_MIME.has(resolvedMime)) {
    return { ok: false, error: `Unsupported file type: ${resolvedMime}` }
  }

  const supabase = await createClient()

  // Confirm we're signed in — RLS will reject otherwise but we want a nice
  // error message instead of a cryptic 403.
  const { data: claimsData } = await supabase.auth.getClaims()
  const userId = claimsData?.claims?.sub
  if (!userId) return { ok: false, error: "Not signed in." }

  const ext = guessExtension(resolvedMime, file.name)
  // Path layout `{user_id}/{uuid}.{ext}` — first segment doubles as ownership
  // for storage RLS (see migration's storage policies).
  const objectPath = `${userId}/${randomUUID()}.${ext}`

  const { error: uploadError } = await supabase.storage
    .from("gallery")
    .upload(objectPath, file, {
      contentType: resolvedMime,
      upsert: false,
    })

  if (uploadError) {
    return { ok: false, error: `Upload failed: ${uploadError.message}` }
  }

  const { error: insertError } = await supabase.from("gallery_images").insert({
    name,
    image_path: objectPath,
    created_by: userId,
  })

  if (insertError) {
    // Best-effort cleanup of the orphan object.
    await supabase.storage.from("gallery").remove([objectPath])
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

/** Browsers / OS file pickers often send "" or application/octet-stream. */
function resolveImageMimeType(file: File): string | null {
  let t = file.type.trim().toLowerCase()
  if (t === "image/jpg") t = "image/jpeg"

  if (t && t !== "application/octet-stream" && ALLOWED_MIME.has(t)) {
    return t
  }

  const inferred = inferMimeFromFilename(file.name)
  if (inferred && ALLOWED_MIME.has(inferred)) return inferred

  return null
}

function inferMimeFromFilename(filename: string): string | null {
  const ext = filename.split(".").pop()?.toLowerCase()
  switch (ext) {
    case "jpg":
    case "jpeg":
      return "image/jpeg"
    case "png":
      return "image/png"
    case "webp":
      return "image/webp"
    case "gif":
      return "image/gif"
    case "avif":
      return "image/avif"
    case "heic":
      return "image/heic"
    case "heif":
      return "image/heif"
    default:
      return null
  }
}

function guessExtension(mime: string, filename: string): string {
  const fromName = filename.split(".").pop()?.toLowerCase()
  if (fromName && /^[a-z0-9]{2,5}$/.test(fromName)) return fromName
  switch (mime) {
    case "image/jpeg":
      return "jpg"
    case "image/png":
      return "png"
    case "image/webp":
      return "webp"
    case "image/gif":
      return "gif"
    case "image/avif":
      return "avif"
    case "image/heic":
      return "heic"
    case "image/heif":
      return "heif"
    default:
      return "bin"
  }
}
