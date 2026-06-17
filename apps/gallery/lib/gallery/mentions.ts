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
