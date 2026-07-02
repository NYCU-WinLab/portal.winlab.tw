/**
 * Parse @mentions from a comment body.
 * Mentions look like `@name`. Letters, digits, dots, hyphens, underscores;
 * matching against user_profiles.name is done by the caller.
 */
export function parseMentions(content: string): string[] {
  const matches = content.matchAll(/@([\p{L}\p{N}._-]{1,40})/gu)
  const names = new Set<string>()
  for (const m of matches) {
    if (m[1]) names.add(m[1])
  }
  return Array.from(names)
}

export type MentionProfile = {
  id: string
  name: string | null
}

/** Case-insensitive name match; returns one row per matched user id. */
export function resolveMentionedProfiles(
  mentionNames: string[],
  profiles: MentionProfile[]
): MentionProfile[] {
  if (mentionNames.length === 0) return []

  const byLowerName = new Map<string, MentionProfile[]>()
  for (const profile of profiles) {
    const trimmed = profile.name?.trim()
    if (!trimmed) continue
    const key = trimmed.toLowerCase()
    const bucket = byLowerName.get(key) ?? []
    bucket.push(profile)
    byLowerName.set(key, bucket)
  }

  const seen = new Set<string>()
  const resolved: MentionProfile[] = []
  for (const raw of mentionNames) {
    const matches = byLowerName.get(raw.toLowerCase()) ?? []
    for (const profile of matches) {
      if (seen.has(profile.id)) continue
      seen.add(profile.id)
      resolved.push(profile)
    }
  }
  return resolved
}
