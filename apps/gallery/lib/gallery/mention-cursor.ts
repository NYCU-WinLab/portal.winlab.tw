/** Query fragment after `@` at the cursor, or null when not in a mention. */
export function mentionQueryAtCursor(
  value: string,
  cursor: number
): string | null {
  const before = value.slice(0, Math.max(0, cursor))
  const match = before.match(/@([\p{L}\p{N}._-]*)$/u)
  return match ? (match[1] ?? "") : null
}

/** Insert `@name ` replacing the in-progress mention before the cursor. */
export function applyMentionAtCursor(
  value: string,
  cursor: number,
  name: string
): { next: string; selection: number } {
  const safeCursor = Math.min(Math.max(cursor, 0), value.length)
  const before = value.slice(0, safeCursor).replace(/@[\p{L}\p{N}._-]*$/u, "")
  const after = value.slice(safeCursor)
  const next = `${before}@${name} ${after}`
  return {
    next,
    selection: before.length + name.length + 2,
  }
}
