// Credentials for one meeting-creation request.
//
// The callback token is per-request and single-use by design. It travels to
// the pipeline as a GitLab trigger variable, and those are not masked — they
// can appear in job logs and in the pipeline API. A shared secret in that
// position would mean one leaked log lets anyone point ANY booking at a fake
// meeting URL. Scoped this way, the worst a leak buys is one already-answered
// request.

import { createHash, randomBytes, timingSafeEqual } from "node:crypto"

/** Correlates the trigger with the callback. Opaque to the pipeline. */
export function newRequestId(): string {
  return `room-booking-${randomBytes(6).toString("hex")}`
}

export function newCallbackToken(): string {
  return randomBytes(32).toString("hex")
}

export function hashCallbackToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex")
}

/**
 * Constant-time comparison of a presented token against a stored hash.
 *
 * Hashing first is what makes the timing-safe compare usable: both sides are
 * then fixed-length hex, so there's no length side channel and no throw from
 * timingSafeEqual on mismatched buffers.
 */
export function callbackTokenMatches(
  presented: string,
  expectedHash: string
): boolean {
  const actual = Buffer.from(hashCallbackToken(presented), "hex")
  let expected: Buffer
  try {
    expected = Buffer.from(expectedHash, "hex")
  } catch {
    return false
  }
  if (expected.length !== actual.length) return false
  return timingSafeEqual(actual, expected)
}

/** `Bearer <token>` -> `<token>`. Null for anything else. */
export function bearerToken(header: string | null | undefined): string | null {
  if (!header) return null
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim())
  return match?.[1] ?? null
}
