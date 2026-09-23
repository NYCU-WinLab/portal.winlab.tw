// The name -> suffix, name -> colour and name -> sound maps the door panel
// service reads from GET /api/door/greetings. The panel looks a greeting up by the name it is
// about to draw, and that name reaches it two ways: a /door press sends
// user_profiles.name, a card swipe carries the controller's holder name
// (mirrored in door_cards.holder_name). So each member with a suffix, a
// colour or a sound gets a key for both, normalised the way the panel normalises before
// it looks up.

import { createHash, timingSafeEqual } from "node:crypto"

import { isDoorGreetingColor } from "@/lib/door/greeting-color"
import {
  isDoorSoundPath,
  isDoorSoundPlayMode,
  type DoorSoundPlayMode,
} from "@/lib/door/sound"

// Keycloak's full name is "<given> <family>", so a Chinese name arrives as
// "詠翔 詹". The panel draws family first; handle_new_user() applies the same
// rule in SQL.
const HAN_GIVEN_FAMILY = /^(\p{Script=Han}+) (\p{Script=Han}+)$/u

export function normalizeGreetingName(name: string): string {
  const collapsed = name.trim().replace(/\s+/g, " ")
  const match = HAN_GIVEN_FAMILY.exec(collapsed)
  return match ? `${match[2]}${match[1]}` : collapsed
}

export type GreetingProfile = {
  id: string
  name: string | null
  door_greeting_suffix: string | null
  door_greeting_color: string | null
  // Optional so a caller that only reads suffixes and colours can leave them
  // out; absent means no sound.
  door_sound_path?: string | null
  door_sound_mode?: string | null
}

export type GreetingCardHolder = {
  holder_name: string | null
  holder_user_id: string | null
}

// Two different people can normalise to the same key. The first writer wins,
// and profiles are written before card names, each in id order, so the answer
// does not depend on the order PostgREST returned rows in. Each map applies
// that rule on its own, over the members that have a value for it, so adding
// a map never changes the keys of another.
function buildGreetingMap<T>(
  profiles: GreetingProfile[],
  cards: GreetingCardHolder[],
  pick: (profile: GreetingProfile) => T | null
): Record<string, T> {
  const valueById = new Map<string, T>()
  const map = new Map<string, T>()
  const put = (name: string | null, value: T | undefined) => {
    const key = name ? normalizeGreetingName(name) : ""
    if (key && value && !map.has(key)) map.set(key, value)
  }

  const sorted = [...profiles].sort((a, b) => a.id.localeCompare(b.id))
  for (const profile of sorted) {
    const value = pick(profile)
    if (!value) continue
    valueById.set(profile.id, value)
    put(profile.name, value)
  }

  const holders = cards
    .filter((card) => card.holder_user_id && valueById.has(card.holder_user_id))
    .sort(
      (a, b) =>
        (a.holder_user_id ?? "").localeCompare(b.holder_user_id ?? "") ||
        (a.holder_name ?? "").localeCompare(b.holder_name ?? "")
    )
  for (const card of holders) {
    put(card.holder_name, valueById.get(card.holder_user_id ?? ""))
  }
  return Object.fromEntries(map)
}

export function buildGreetingSuffixMap(
  profiles: GreetingProfile[],
  cards: GreetingCardHolder[]
): Record<string, string> {
  return buildGreetingMap(profiles, cards, (p) => p.door_greeting_suffix)
}

// The CHECK already guarantees the format; the filter keeps a value the panel
// cannot parse out of its map even if that ever stops being true.
export function buildGreetingColorMap(
  profiles: GreetingProfile[],
  cards: GreetingCardHolder[]
): Record<string, string> {
  return buildGreetingMap(profiles, cards, (p) =>
    isDoorGreetingColor(p.door_greeting_color) ? p.door_greeting_color : null
  )
}

export type GreetingSound = {
  url: string
  mode: DoorSoundPlayMode
  version: string
}

// The paths the endpoint has to sign: members who picked a mode that plays a
// file, with a path in their own folder. voice_only members are left out so
// their files are never signed.
export function greetingSoundPaths(profiles: GreetingProfile[]): string[] {
  return profiles.flatMap((profile) =>
    isDoorSoundPlayMode(profile.door_sound_mode) &&
    isDoorSoundPath(profile.door_sound_path, profile.id)
      ? [profile.door_sound_path as string]
      : []
  )
}

// signedUrls maps a storage path to its signed URL; a path that failed to
// sign (a missing object) is absent, and that member falls back to the voice
// greeting. The path is the version: every upload gets a fresh one, so the
// panel can cache the file by it.
export function buildGreetingSoundMap(
  profiles: GreetingProfile[],
  cards: GreetingCardHolder[],
  signedUrls: ReadonlyMap<string, string>
): Record<string, GreetingSound> {
  return buildGreetingMap(profiles, cards, (p) => {
    const path = p.door_sound_path
    const mode = p.door_sound_mode
    if (!isDoorSoundPlayMode(mode) || !isDoorSoundPath(path, p.id)) return null
    const url = signedUrls.get(path as string)
    return url ? { url, mode, version: path as string } : null
  })
}

// The panel service authenticates with the same DISPLAY_API_SECRET Portal uses
// to reach it. Hashing both sides first gives timingSafeEqual equal-length
// inputs without leaking the secret's length.
export function greetingsAuthorized(
  authorization: string | null,
  secret: string
): boolean {
  if (secret.length < 32 || !authorization || authorization.length > 1024) {
    return false
  }
  const match = /^Bearer ([!-~]+)$/i.exec(authorization)
  if (!match?.[1]) return false
  const digest = (value: string) => createHash("sha256").update(value).digest()
  return timingSafeEqual(digest(match[1]), digest(secret))
}
