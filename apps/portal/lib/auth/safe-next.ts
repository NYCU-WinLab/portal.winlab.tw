// A post-login destination we are willing to send the browser to. Only
// same-origin paths qualify: anything with a scheme or a protocol-relative
// "//host" prefix could bounce a freshly signed-in user to a third party.
export function safeNextPath(
  candidate: string | null | undefined,
  fallback = "/"
): string {
  if (!candidate) return fallback
  if (!candidate.startsWith("/")) return fallback
  if (candidate.startsWith("//")) return fallback
  if (candidate.includes("\\")) return fallback
  return candidate
}

export function loginUrlFor(pathWithSearch: string): string {
  const next = safeNextPath(pathWithSearch)
  if (next === "/") return "/auth/login"
  return `/auth/login?next=${encodeURIComponent(next)}`
}
