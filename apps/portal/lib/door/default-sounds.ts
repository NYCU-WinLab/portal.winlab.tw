// The lab's default door sounds: a pool door admins manage on /door/admin,
// published by GET /api/door/greetings as "default" for the panel service to
// pick from at random when a member has no sound of their own. Files share
// the door-sounds bucket with member sounds, under defaults/; the same rules
// are the path check and the storage INSERT policy (20260929100000).

import type { DoorSoundExtension } from "@/lib/door/sound"

export const DEFAULT_SOUND_FOLDER = "defaults"
export const DEFAULT_SOUND_LABEL_MAX = 40

export type DefaultSoundRow = {
  id: string
  label: string
  path: string
  enabled: boolean
  created_at: string
}

// What the panel reads, one entry per enabled sound. version is the path:
// every upload gets a fresh one, so the panel can cache a file by it.
export type PanelDefaultSound = {
  url: string
  version: string
  label: string
}

export const LABEL_EMPTY = "請輸入名稱。"
export const LABEL_TOO_LONG = `名稱最多 ${DEFAULT_SOUND_LABEL_MAX} 個字。`

const PATH = new RegExp(
  `^${DEFAULT_SOUND_FOLDER}/[A-Za-z0-9_-]{1,64}\\.(mp3|m4a|aac|wav|ogg)$`
)

export function isDefaultSoundPath(path: unknown): path is string {
  return typeof path === "string" && PATH.test(path)
}

export type LabelCheck =
  | { ok: true; label: string }
  | { ok: false; error: string }

// Trimmed and collapsed before it is stored, the shape the column check wants.
// Length counts characters, not UTF-16 units, as char_length does.
export function normalizeDefaultSoundLabel(value: unknown): LabelCheck {
  const label =
    typeof value === "string" ? value.trim().replace(/\s+/g, " ") : ""
  if (!label) return { ok: false, error: LABEL_EMPTY }
  if ([...label].length > DEFAULT_SOUND_LABEL_MAX) {
    return { ok: false, error: LABEL_TOO_LONG }
  }
  return { ok: true, label }
}

export function newDefaultSoundPath(
  ext: DoorSoundExtension,
  now: Date = new Date(),
  random: string = crypto.randomUUID().replace(/-/g, "").slice(0, 8)
): string {
  const stamp = now.toISOString().replace(/\D/g, "").slice(0, 14)
  return `${DEFAULT_SOUND_FOLDER}/${stamp}-${random}.${ext}`
}

// The paths the greetings endpoint signs: enabled sounds only, so a disabled
// one is never handed to the panel.
export function defaultSoundPaths(rows: DefaultSoundRow[]): string[] {
  return rows.flatMap((row) =>
    row.enabled && isDefaultSoundPath(row.path) ? [row.path] : []
  )
}

// Oldest first, so the list only grows at the end and the panel sees a stable
// order. A sound whose file failed to sign is left out; if none are left the
// list is empty and the panel keeps its built-in sound.
export function buildPanelDefaultSounds(
  rows: DefaultSoundRow[],
  signedUrls: ReadonlyMap<string, string>
): PanelDefaultSound[] {
  return [...rows]
    .sort(
      (a, b) =>
        a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)
    )
    .flatMap((row) => {
      if (!row.enabled || !isDefaultSoundPath(row.path)) return []
      const url = signedUrls.get(row.path)
      return url ? [{ url, version: row.path, label: row.label }] : []
    })
}
