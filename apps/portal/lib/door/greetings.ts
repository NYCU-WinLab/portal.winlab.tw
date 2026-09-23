// The name -> suffix and name -> colour maps the door panel service reads from
// GET /api/door/greetings. The panel looks a greeting up by the name it is
// about to draw, and that name reaches it two ways: a /door press sends
// user_profiles.name, a card swipe carries the controller's holder name
// (mirrored in door_cards.holder_name). So each member with a suffix or a
// colour gets a key for both, normalised the way the panel normalises before
// it looks up.

import { createHash, timingSafeEqual } from "node:crypto"

import { isDoorGreetingColor } from "@/lib/door/greeting-color"

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
function buildGreetingMap(
  profiles: GreetingProfile[],
  cards: GreetingCardHolder[],
  pick: (profile: GreetingProfile) => string | null
): Record<string, string> {
  const valueById = new Map<string, string>()
  const map = new Map<string, string>()
  const put = (name: string | null, value: string | undefined) => {
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
