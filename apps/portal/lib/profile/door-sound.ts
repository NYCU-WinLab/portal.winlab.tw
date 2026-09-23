import type { SupabaseClient } from "@supabase/supabase-js"

import {
  DOOR_SOUND_BUCKET,
  DOOR_SOUND_MAX_BYTES,
  DOOR_SOUND_TYPES,
  isDoorSoundMode,
  isDoorSoundPath,
  type DoorSoundMode,
} from "@/lib/door/sound"

// The member's own client reads and writes user_profiles, so
// user_profiles_update_own keeps every write on their row. The door-sounds
// bucket has no SELECT policy (only the service role reads it), so checking
// an upload, signing the member's own file for the /profile player and
// removing old files take the service-role client, and every one of those
// first checks that the path is in the member's own folder.

export type DoorSound = {
  path: string | null
  mode: DoorSoundMode
}

export async function fetchDoorSound(
  supabase: SupabaseClient,
  userId: string
): Promise<DoorSound> {
  const { data, error } = await supabase
    .from("user_profiles")
    .select("door_sound_path, door_sound_mode")
    .eq("id", userId)
    .maybeSingle()
  if (error) throw error
  const path = isDoorSoundPath(data?.door_sound_path, userId)
    ? (data?.door_sound_path as string)
    : null
  const mode = isDoorSoundMode(data?.door_sound_mode)
    ? data.door_sound_mode
    : "voice_only"
  return { path, mode: path ? mode : "voice_only" }
}

// For the /profile player only, and only for the member's own file.
export async function signOwnDoorSound(
  admin: SupabaseClient,
  userId: string,
  path: string | null,
  expiresIn = 60 * 60
): Promise<string | null> {
  if (!path || !isDoorSoundPath(path, userId)) return null
  const { data, error } = await admin.storage
    .from(DOOR_SOUND_BUCKET)
    .createSignedUrl(path, expiresIn)
  if (error) {
    console.error("[profile] door sound signing failed", error.message)
    return null
  }
  return data.signedUrl
}

export type SaveDoorSoundInput = {
  // A path the browser just uploaded to, or undefined to keep the current
  // file and change only the mode.
  path?: unknown
  mode: unknown
}

export type SaveDoorSoundResult =
  | { ok: true; path: string | null; mode: DoorSoundMode }
  | { ok: false; error: string }

export const SAVE_SOUND_FAILED = "儲存失敗，請重試。"
export const SOUND_MODE_INVALID = "播放方式不正確。"
export const SOUND_MODE_NEEDS_FILE = "要先上傳音效，才能選這個播放方式。"
export const SOUND_UPLOAD_MISSING = "找不到剛上傳的音檔，請重新上傳。"
export const SOUND_UPLOAD_REJECTED = "音檔格式或大小不符，請重新上傳。"

const ALLOWED_TYPES = new Set<string>(Object.values(DOOR_SOUND_TYPES))

type Deps = {
  supabase: SupabaseClient
  admin: SupabaseClient
  userId: string
  // Between info() retries, injectable so tests do not wait.
  sleep?: (ms: number) => Promise<void>
}

// The upload has only just finished; give the object a moment to show up
// before calling it missing, the same allowance finalizePdfUpload makes.
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

// The bucket already refuses a file over the limit or of another type; this
// re-checks what was stored so a bucket configured by hand cannot let one
// through. A rejected upload is removed straight away.
export async function updateDoorSound(
  { supabase, admin, userId, sleep = defaultSleep }: Deps,
  input: SaveDoorSoundInput
): Promise<SaveDoorSoundResult & { previous?: string | null }> {
  const mode = input?.mode
  if (!isDoorSoundMode(mode)) return { ok: false, error: SOUND_MODE_INVALID }
  const newPath = input?.path
  if (newPath !== undefined && !isDoorSoundPath(newPath, userId)) {
    return { ok: false, error: SOUND_UPLOAD_REJECTED }
  }
  const discard = async () => {
    if (typeof newPath === "string") {
      await admin.storage.from(DOOR_SOUND_BUCKET).remove([newPath])
    }
  }

  let current: DoorSound
  try {
    current = await fetchDoorSound(supabase, userId)
  } catch (err) {
    console.error("[profile] door sound read failed", err)
    await discard()
    return { ok: false, error: SAVE_SOUND_FAILED }
  }

  const path = typeof newPath === "string" ? newPath : current.path
  if (!path && mode !== "voice_only") {
    return { ok: false, error: SOUND_MODE_NEEDS_FILE }
  }

  if (typeof newPath === "string") {
    const object = await uploadedObject(admin, newPath, sleep)
    if (!object) {
      await discard()
      return { ok: false, error: SOUND_UPLOAD_MISSING }
    }
    const size = object.size ?? 0
    const type = (object.contentType ?? "").toLowerCase()
    if (size <= 0 || size > DOOR_SOUND_MAX_BYTES || !ALLOWED_TYPES.has(type)) {
      await discard()
      return { ok: false, error: SOUND_UPLOAD_REJECTED }
    }
  }

  const { data, error } = await supabase
    .from("user_profiles")
    .update({ door_sound_path: path, door_sound_mode: mode })
    .eq("id", userId)
    .select("id")
  if (error || !data || data.length !== 1) {
    if (error) console.error("[profile] door sound save failed", error.code)
    if (newPath !== current.path) await discard()
    return { ok: false, error: SAVE_SOUND_FAILED }
  }
  return { ok: true, path, mode, previous: current.path }
}

// Clears the file and falls back to the voice greeting.
export async function clearDoorSound(
  supabase: SupabaseClient,
  userId: string
): Promise<SaveDoorSoundResult> {
  const { data, error } = await supabase
    .from("user_profiles")
    .update({ door_sound_path: null, door_sound_mode: "voice_only" })
    .eq("id", userId)
    .select("id")
  if (error || !data || data.length !== 1) {
    if (error) console.error("[profile] door sound clear failed", error.code)
    return { ok: false, error: SAVE_SOUND_FAILED }
  }
  return { ok: true, path: null, mode: "voice_only" }
}

// Uploads that were never saved (a closed tab, a failed save) are left in the
// folder; anything older than this is treated as abandoned. The grace period
// keeps a save in one tab from deleting a file another tab is about to save.
export const ORPHAN_GRACE_MS = 10 * 60 * 1000

// Removes the member's old files, keeping `keep`. `previous` (the file the
// member just replaced) goes regardless of age; other files only once they
// are older than graceMs. Runs after the response, so it only logs.
export async function removeStaleDoorSounds(
  admin: SupabaseClient,
  userId: string,
  {
    keep,
    previous,
    now = Date.now(),
    graceMs = ORPHAN_GRACE_MS,
  }: {
    keep: string | null
    previous: string | null
    now?: number
    graceMs?: number
  }
): Promise<string[]> {
  const bucket = admin.storage.from(DOOR_SOUND_BUCKET)
  const { data, error } = await bucket.list(userId, { limit: 100 })
  if (error) {
    console.error("[profile] door sound listing failed", error.message)
    return []
  }
  const stale = new Set<string>()
  if (previous && previous !== keep && isDoorSoundPath(previous, userId)) {
    stale.add(previous)
  }
  for (const file of data ?? []) {
    const path = `${userId}/${file.name}`
    if (path === keep || !file.id || !isDoorSoundPath(path, userId)) continue
    const created = Date.parse(file.created_at ?? "")
    if (Number.isNaN(created) || now - created >= graceMs) stale.add(path)
  }
  if (stale.size === 0) return []
  const paths = [...stale]
  const removed = await bucket.remove(paths)
  if (removed.error) {
    console.error("[profile] door sound cleanup failed", removed.error.message)
    return []
  }
  return paths
}

function defaultSleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}
