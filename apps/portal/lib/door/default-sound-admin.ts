import type { SupabaseClient } from "@supabase/supabase-js"

import {
  isDefaultSoundPath,
  newDefaultSoundPath,
  normalizeDefaultSoundLabel,
  type DefaultSoundRow,
} from "@/lib/door/default-sounds"
import {
  DOOR_SOUND_BUCKET,
  DOOR_SOUND_MAX_BYTES,
  DOOR_SOUND_TYPES,
  doorSoundUploadBody,
  looksLikeDoorSound,
  validateDoorSoundFile,
} from "@/lib/door/sound"

// /door/admin's default sounds. Rows are read and written with the admin's
// own client, so RLS (is_door_admin()) is what decides; the bucket has no
// SELECT policy, so checking an upload, signing the players and removing a
// file take the service-role client, and each of those only ever touches a
// path under defaults/. The caller checks is_door_admin() before handing the
// service-role client in.

export type DefaultSoundView = DefaultSoundRow & { url: string | null }

export type DefaultSoundMutation =
  | { ok: true; message: string }
  | { ok: false; error: string }

export const DEFAULT_SOUND_FAILED = "操作失敗，請重試。"
export const DEFAULT_SOUND_NOT_FOUND = "找不到這個音效，可能已被刪除。"
export const DEFAULT_SOUND_UPLOAD_MISSING = "找不到剛上傳的音檔，請重新上傳。"
export const DEFAULT_SOUND_UPLOAD_REJECTED = "音檔格式或大小不符，請重新上傳。"
export const DEFAULT_SOUND_UPLOAD_FAILED = "上傳失敗，請重試。"
export const DEFAULT_SOUND_NOT_AUDIO = "這個檔案看起來不是音檔。"

const ALLOWED_TYPES = new Set<string>(Object.values(DOOR_SOUND_TYPES))
const SELECT = "id, label, path, enabled, created_at"

export async function listDefaultSounds(
  supabase: SupabaseClient,
  admin: SupabaseClient,
  expiresIn = 60 * 60
): Promise<DefaultSoundView[]> {
  const { data, error } = await supabase
    .from("door_default_sounds")
    .select(SELECT)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
  if (error) throw error
  const rows = (data ?? []) as DefaultSoundRow[]
  const paths = rows.map((row) => row.path).filter(isDefaultSoundPath)
  const urls = new Map<string, string>()
  if (paths.length > 0) {
    const signed = await admin.storage
      .from(DOOR_SOUND_BUCKET)
      .createSignedUrls(paths, expiresIn)
    // A player that cannot load is not worth failing the page over.
    if (signed.error) {
      console.error("[door] default sound signing failed", signed.error)
    }
    for (const item of signed.data ?? []) {
      if (!item.error && item.path && item.signedUrl) {
        urls.set(item.path, item.signedUrl)
      }
    }
  }
  return rows.map((row) => ({ ...row, url: urls.get(row.path) ?? null }))
}

// Browser side: check the picked file, then upload it under a fresh name with
// the admin's own client, which the storage INSERT policy limits to defaults/.
export async function uploadDefaultSoundFile(
  supabase: SupabaseClient,
  file: File
): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  const check = validateDoorSoundFile(file)
  if (!check.ok) return check
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer())
  if (!looksLikeDoorSound(check.ext, head)) {
    return { ok: false, error: DEFAULT_SOUND_NOT_AUDIO }
  }
  const path = newDefaultSoundPath(check.ext)
  const { error } = await supabase.storage
    .from(DOOR_SOUND_BUCKET)
    .upload(path, doorSoundUploadBody(file, check.contentType), {
      contentType: check.contentType,
      upsert: false,
    })
  if (error) {
    console.error("[door] default sound upload failed", error.message)
    return { ok: false, error: DEFAULT_SOUND_UPLOAD_FAILED }
  }
  return { ok: true, path }
}

type Deps = {
  supabase: SupabaseClient
  admin: SupabaseClient
  // Between info() retries, injectable so tests do not wait.
  sleep?: (ms: number) => Promise<void>
}

// The upload has only just finished; give the object a moment to show up.
async function uploadedObject(
  admin: SupabaseClient,
  path: string,
  sleep: (ms: number) => Promise<void>
) {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await sleep(200)
    const { data, error } = await admin.storage
      .from(DOOR_SOUND_BUCKET)
      .info(path)
    if (!error && data) return data
  }
  return null
}

// Server side, after the browser upload: re-check what was stored, then add
// the row. A rejected upload is removed, but only once we know no row points
// at that path, so replaying an existing path can never delete a live file.
export async function addDefaultSound(
  { supabase, admin, sleep = defaultSleep }: Deps,
  input: { path: unknown; label: unknown }
): Promise<DefaultSoundMutation> {
  const path = input?.path
  if (!isDefaultSoundPath(path)) {
    return { ok: false, error: DEFAULT_SOUND_UPLOAD_REJECTED }
  }
  const existing = await supabase
    .from("door_default_sounds")
    .select("id")
    .eq("path", path)
    .maybeSingle()
  if (existing.error) {
    console.error("[door] default sound lookup failed", existing.error.code)
    return { ok: false, error: DEFAULT_SOUND_FAILED }
  }
  if (existing.data) return { ok: false, error: DEFAULT_SOUND_UPLOAD_REJECTED }

  const discard = async () => {
    await admin.storage.from(DOOR_SOUND_BUCKET).remove([path])
  }
  const label = normalizeDefaultSoundLabel(input?.label)
  if (!label.ok) {
    await discard()
    return label
  }

  const object = await uploadedObject(admin, path, sleep)
  if (!object) {
    await discard()
    return { ok: false, error: DEFAULT_SOUND_UPLOAD_MISSING }
  }
  const size = object.size ?? 0
  const type = (object.contentType ?? "").toLowerCase()
  if (size <= 0 || size > DOOR_SOUND_MAX_BYTES || !ALLOWED_TYPES.has(type)) {
    await discard()
    return { ok: false, error: DEFAULT_SOUND_UPLOAD_REJECTED }
  }

  const { data, error } = await supabase
    .from("door_default_sounds")
    .insert({ label: label.label, path })
    .select("id")
  if (error || !data || data.length !== 1) {
    if (error) console.error("[door] default sound insert failed", error.code)
    // 23505 is another row already holding this path: that file is live.
    if (error?.code !== "23505") await discard()
    return { ok: false, error: DEFAULT_SOUND_FAILED }
  }
  return { ok: true, message: `已加入「${label.label}」。` }
}

export async function updateDefaultSound(
  supabase: SupabaseClient,
  id: unknown,
  patch: { label?: unknown; enabled?: unknown }
): Promise<DefaultSoundMutation> {
  if (typeof id !== "string" || !id) {
    return { ok: false, error: DEFAULT_SOUND_NOT_FOUND }
  }
  const changes: { label?: string; enabled?: boolean } = {}
  if (patch.label !== undefined) {
    const label = normalizeDefaultSoundLabel(patch.label)
    if (!label.ok) return label
    changes.label = label.label
  }
  if (patch.enabled !== undefined) {
    if (typeof patch.enabled !== "boolean") {
      return { ok: false, error: DEFAULT_SOUND_FAILED }
    }
    changes.enabled = patch.enabled
  }
  if (Object.keys(changes).length === 0) {
    return { ok: false, error: DEFAULT_SOUND_FAILED }
  }
  const { data, error } = await supabase
    .from("door_default_sounds")
    .update(changes)
    .eq("id", id)
    .select("id")
  if (error) {
    console.error("[door] default sound update failed", error.code)
    return { ok: false, error: DEFAULT_SOUND_FAILED }
  }
  if (!data || data.length !== 1) {
    return { ok: false, error: DEFAULT_SOUND_NOT_FOUND }
  }
  const message =
    changes.enabled === undefined
      ? "已更新名稱。"
      : changes.enabled
        ? "已加入輪播。"
        : "已移出輪播。"
  return { ok: true, message }
}

// The row goes first, so the panel stops getting the file before the file is
// removed. A failed removal only leaves an unreferenced file behind.
export async function deleteDefaultSound(
  { supabase, admin }: Deps,
  id: unknown
): Promise<DefaultSoundMutation> {
  if (typeof id !== "string" || !id) {
    return { ok: false, error: DEFAULT_SOUND_NOT_FOUND }
  }
  const { data, error } = await supabase
    .from("door_default_sounds")
    .delete()
    .eq("id", id)
    .select("path, label")
  if (error) {
    console.error("[door] default sound delete failed", error.code)
    return { ok: false, error: DEFAULT_SOUND_FAILED }
  }
  const row = data?.[0] as { path: string; label: string } | undefined
  if (!row) return { ok: false, error: DEFAULT_SOUND_NOT_FOUND }
  if (isDefaultSoundPath(row.path)) {
    const removed = await admin.storage
      .from(DOOR_SOUND_BUCKET)
      .remove([row.path])
    if (removed.error) {
      console.error(
        "[door] default sound file removal failed",
        removed.error.message
      )
    }
  }
  return { ok: true, message: `已刪除「${row.label}」。` }
}

function defaultSleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}
