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
  if (!ALLOWED_MIME.has(file.type)) {
    return { ok: false, error: `Unsupported file type: ${file.type}` }
  }

  const supabase = await createClient()

  // Confirm we're signed in — RLS will reject otherwise but we want a nice
  // error message instead of a cryptic 403.
  const { data: claimsData } = await supabase.auth.getClaims()
  const userId = claimsData?.claims?.sub
  if (!userId) return { ok: false, error: "Not signed in." }

  const ext = guessExtension(file.type, file.name)
  // Path layout `{user_id}/{uuid}.{ext}` — first segment doubles as ownership
  // for storage RLS (see migration's storage policies).
  const objectPath = `${userId}/${randomUUID()}.${ext}`

  const { error: uploadError } = await supabase.storage
    .from("gallery")
    .upload(objectPath, file, {
      contentType: file.type,
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
    default:
      return "bin"
  }
}
