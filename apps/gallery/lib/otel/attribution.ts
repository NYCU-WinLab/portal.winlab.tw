import type { Attributes } from "@opentelemetry/api"

/**
 * Fixed attribute-key contract with the Sensorium ingest side — it
 * aggregates attacker-origin telemetry on these exact keys, so don't rename
 * without updating that side too:
 *
 *   - client.address — caller's IP (x-forwarded-for, falling back to x-real-ip)
 *   - geo.country     — x-vercel-ip-country (ISO country code)
 *   - geo.city        — x-vercel-ip-city, percent-decoded
 *   - geo.region      — x-vercel-ip-country-region
 *
 * Vercel injects the x-vercel-ip-* headers at the edge for every request;
 * they (and x-forwarded-for) are simply absent when self-hosted / running
 * locally, so every key here is optional — never fabricate a placeholder.
 *
 * IP + geo only. Callers must never fold cookies, auth headers, tokens, or
 * body content into the returned attributes — gallery sits behind the same
 * Supabase Auth / Keycloak session as portal, so this boundary matters here
 * too.
 */
export function getClientAttributionAttributes(
  headers: Headers | NodeJS.Dict<string | string[]>
): Attributes {
  const get = (name: string): string | undefined => {
    if (headers instanceof Headers) return headers.get(name) ?? undefined
    const value = headers[name] ?? headers[name.toLowerCase()]
    return Array.isArray(value) ? value[0] : value
  }

  const attributes: Attributes = {}

  const clientAddress =
    get("x-forwarded-for")?.split(",")[0]?.trim() || get("x-real-ip")?.trim()
  if (clientAddress) attributes["client.address"] = clientAddress

  const country = get("x-vercel-ip-country")
  if (country) attributes["geo.country"] = country

  const city = get("x-vercel-ip-city")
  if (city) {
    try {
      attributes["geo.city"] = decodeURIComponent(city)
    } catch {
      // Malformed percent-encoding — keep the raw value rather than drop it.
      attributes["geo.city"] = city
    }
  }

  const region = get("x-vercel-ip-country-region")
  if (region) attributes["geo.region"] = region

  return attributes
}
