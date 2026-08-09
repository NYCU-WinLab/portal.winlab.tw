// The Teams meeting subject, as `[prefix]-suffix`.
//
// This is not just a display string: Teams derives the recording's filename
// from the meeting topic, and those recordings are later sorted into
// NextCloud. So the topic carries a machine-readable prefix identifying who
// the meeting belongs to, and it has to survive being turned into a filename.
//
// The prefix is an ASCII identifier on purpose — the Keycloak group's `name`
// (its slug) rather than its `description`, and a member's `username` rather
// than their display name. Both display forms are Chinese, and a filename
// built from them is worse to sort, script against, and move between systems.
//
// Prefix and suffix are stored separately and only ever joined here. That's
// what makes the prefix un-spoofable: there is no parsing step for a
// hand-typed "[some-other-group]" to fool, because the prefix never comes
// from the same field as the text a person types.

// What a filename can't hold on Windows, macOS, or Linux, plus the brackets
// and hyphen that delimit the prefix. Spaces are fine and deliberately kept.
const UNSAFE = /[\\/:*?"<>|[\]]/g

// What the suffix box starts out saying. English so the whole topic — and
// therefore the recording's filename — stays ASCII by default.
export const DEFAULT_TOPIC_SUFFIX = "meeting"

export interface TopicSource {
  /** Keycloak group name when the attendees came from a group button. */
  groupName?: string | null
  /** Otherwise, the first attendee's Keycloak username. */
  firstAttendeeUsername?: string | null
}

/**
 * Strips what a filename can't hold and collapses the whitespace that
 * removing it leaves behind.
 */
export function sanitizeForFilename(value: string): string {
  return value.replace(UNSAFE, " ").replace(/\s+/g, " ").trim()
}

/**
 * The bare identifier, with no brackets — this is what gets stored.
 *
 * Null when neither a group nor a named attendee is available, e.g. a room
 * booked with no attendees at all. A meeting with no prefix is better than
 * one prefixed with a guess.
 */
export function topicPrefix(source: TopicSource): string | null {
  const raw = source.groupName ?? source.firstAttendeeUsername ?? null
  if (!raw) return null
  const clean = sanitizeForFilename(raw)
  return clean === "" ? null : clean
}

/** `tasa` -> `[tasa]`, for display next to the suffix box. */
export function formatPrefix(prefix: string): string {
  return `[${prefix}]`
}

/**
 * `[tasa]-討論`
 *
 * Falls back to the bare suffix when there's no prefix, rather than emitting
 * a dangling `-`.
 */
export function composeTopic(
  prefix: string | null | undefined,
  suffix: string
): string {
  const cleanSuffix = sanitizeForFilename(suffix) || DEFAULT_TOPIC_SUFFIX
  if (!prefix) return cleanSuffix
  return `${formatPrefix(prefix)}-${cleanSuffix}`
}
