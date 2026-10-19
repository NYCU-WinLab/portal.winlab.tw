// Mailing-list addresses as the /groups UI accepts them. Google compares
// addresses case-insensitively, so everything is lower-cased here once and
// every comparison downstream can be a plain string match.

/** Same bound as group_membership_audit.member_email. */
export const MAX_EMAIL_LENGTH = 320

// \p{Cc} and \p{Cs} keep control characters and lone surrogates out:
// Postgres can't store U+0000 or an unpaired surrogate, and one such address
// in an audit insert would sink the whole batch's rows.
const EMAIL =
  /^[^\s\p{Cc}\p{Cs}@<>()",;]+@[^\s\p{Cc}\p{Cs}@<>()",;]+\.[^\s\p{Cc}\p{Cs}@<>()",;]+$/u

export function normalizeEmail(raw: string): string | null {
  const text = raw.trim().toLowerCase()
  if (text.length > MAX_EMAIL_LENGTH) return null
  return EMAIL.test(text) ? text : null
}

/** Free-text box → addresses. Order kept, duplicates dropped. */
export function parseEmailList(text: string): {
  valid: string[]
  invalid: string[]
} {
  const valid: string[] = []
  const invalid: string[] = []
  for (const token of text.split(/[\s,;]+/)) {
    if (!token) continue
    const email = normalizeEmail(token)
    if (email === null) invalid.push(token)
    else if (!valid.includes(email)) valid.push(email)
  }
  return { valid, invalid }
}
