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
  // Browsers strip tab / newline before parsing, so "/\t/evil.example" would
  // resolve to https://evil.example/ once it lands in a Location header.
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(candidate)) return fallback
  return candidate
}

export function loginUrlFor(pathWithSearch: string): string {
  const next = safeNextPath(pathWithSearch)
  if (next === "/") return "/auth/login"
  return `/auth/login?next=${encodeURIComponent(next)}`
}
