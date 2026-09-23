// A member's door sound: a short audio file the panel service plays when they
// open the door, uploaded on /profile. The same rules are the bucket limits,
// the storage INSERT policy and the checks on user_profiles.door_sound_path /
// door_sound_mode (20260923140000). The service trims past 10 seconds and
// levels the loudness, so Portal only checks type and size.

export const DOOR_SOUND_BUCKET = "door-sounds"
export const DOOR_SOUND_MAX_BYTES = 3 * 1024 * 1024
export const DOOR_SOUND_MAX_SECONDS = 10

// One content type per extension, sent with the upload so the bucket's
// allowed_mime_types can be an exact list instead of whatever each browser
// guesses (Safari says audio/x-m4a, Chrome audio/mp4, some say nothing).
export const DOOR_SOUND_TYPES = {
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  wav: "audio/wav",
  ogg: "audio/ogg",
} as const

export type DoorSoundExtension = keyof typeof DOOR_SOUND_TYPES

export const DOOR_SOUND_ACCEPT = [
  ...Object.keys(DOOR_SOUND_TYPES).map((ext) => `.${ext}`),
  ...new Set(Object.values(DOOR_SOUND_TYPES)),
].join(",")

export const DOOR_SOUND_MODES = [
  "sound_only",
  "sound_then_voice",
  "voice_only",
] as const

export type DoorSoundMode = (typeof DOOR_SOUND_MODES)[number]

// The modes the panel needs a file for; voice_only is the spoken greeting the
// panel already does for everyone.
export type DoorSoundPlayMode = Exclude<DoorSoundMode, "voice_only">

export const DOOR_SOUND_MODE_LABELS: Record<DoorSoundMode, string> = {
  sound_only: "只播音效",
  sound_then_voice: "先播音效，再念「歡迎，名字」",
  voice_only: "只念語音（不用音效）",
}

export function isDoorSoundMode(value: unknown): value is DoorSoundMode {
  return (
    typeof value === "string" &&
    (DOOR_SOUND_MODES as readonly string[]).includes(value)
  )
}

export function isDoorSoundPlayMode(
  value: unknown
): value is DoorSoundPlayMode {
  return isDoorSoundMode(value) && value !== "voice_only"
}

export function doorSoundExtension(
  filename: string
): DoorSoundExtension | null {
  const match = /\.([A-Za-z0-9]+)$/.exec(filename.trim())
  const ext = match?.[1]?.toLowerCase()
  return ext && Object.hasOwn(DOOR_SOUND_TYPES, ext)
    ? (ext as DoorSoundExtension)
    : null
}

export const SOUND_BAD_TYPE = "只接受 mp3、m4a、aac、wav、ogg 音檔。"
export const SOUND_TOO_LARGE = "音檔超過 3 MB。"
export const SOUND_EMPTY = "音檔是空的。"
export const SOUND_NOT_AUDIO = "這個檔案看起來不是音檔。"

const OGG_CONTAINER_TYPES = new Set(["application/ogg", "video/ogg"])

export type DoorSoundFileCheck =
  | { ok: true; ext: DoorSoundExtension; contentType: string }
  | { ok: false; error: string }

export function validateDoorSoundFile(
  file: Pick<File, "name" | "size" | "type">
): DoorSoundFileCheck {
  const ext = doorSoundExtension(file.name)
  if (!ext) return { ok: false, error: SOUND_BAD_TYPE }
  // An empty type is common for .m4a / .aac; a non-audio one means the
  // extension is lying.
  const type = file.type.toLowerCase()
  if (type && !type.startsWith("audio/") && !OGG_CONTAINER_TYPES.has(type)) {
    return { ok: false, error: SOUND_BAD_TYPE }
  }
  if (file.size <= 0) return { ok: false, error: SOUND_EMPTY }
  if (file.size > DOOR_SOUND_MAX_BYTES) {
    return { ok: false, error: SOUND_TOO_LARGE }
  }
  return { ok: true, ext, contentType: DOOR_SOUND_TYPES[ext] }
}

const ascii = (bytes: Uint8Array, start: number, text: string) =>
  Array.from(text).every((ch, i) => bytes[start + i] === ch.charCodeAt(0))

// First bytes of each container, so a renamed image or PDF is caught before
// it is uploaded. Loose on purpose: it only has to tell audio from not-audio.
export function looksLikeDoorSound(
  ext: DoorSoundExtension,
  head: Uint8Array
): boolean {
  const adts = head[0] === 0xff && ((head[1] ?? 0) & 0xf0) === 0xf0
  const mpegFrame = head[0] === 0xff && ((head[1] ?? 0) & 0xe0) === 0xe0
  switch (ext) {
    case "mp3":
      return ascii(head, 0, "ID3") || mpegFrame
    case "aac":
      return ascii(head, 0, "ID3") || adts
    case "m4a":
      return ascii(head, 4, "ftyp")
    case "wav":
      return ascii(head, 0, "RIFF") && ascii(head, 8, "WAVE")
    case "ogg":
      return ascii(head, 0, "OggS")
  }
}

const PATH_NAME = /^[A-Za-z0-9_-]{1,64}\.(mp3|m4a|aac|wav|ogg)$/

// True only for a file in this member's own folder, the same shape the
// column check and the INSERT policy accept.
export function isDoorSoundPath(path: unknown, userId: string): boolean {
  if (typeof path !== "string" || !userId) return false
  const prefix = `${userId}/`
  return path.startsWith(prefix) && PATH_NAME.test(path.slice(prefix.length))
}

// A fresh name per upload, so the path doubles as the version the panel
// caches by and an upload never has to overwrite.
export function newDoorSoundPath(
  userId: string,
  ext: DoorSoundExtension,
  now: Date = new Date(),
  random: string = crypto.randomUUID().replace(/-/g, "").slice(0, 8)
): string {
  const stamp = now.toISOString().replace(/\D/g, "").slice(0, 14)
  return `${userId}/${stamp}-${random}.${ext}`
}
