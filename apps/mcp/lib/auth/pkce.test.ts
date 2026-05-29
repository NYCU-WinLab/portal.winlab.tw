import { describe, expect, test } from "bun:test"

import { verifyPkce } from "@/lib/auth/pkce"

// RFC 7636 Appendix B canonical S256 example — locks the exact
// sha256 + base64url encoding so a digest/encoding regression is caught.
const RFC_VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
const RFC_CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"

describe("verifyPkce", () => {
  test("accepts the RFC 7636 verifier/challenge pair", () => {
    expect(verifyPkce(RFC_VERIFIER, RFC_CHALLENGE)).toBe(true)
  })

  test("rejects a mismatched challenge", () => {
    expect(verifyPkce(RFC_VERIFIER, "wrong-challenge")).toBe(false)
  })

  test("rejects an empty challenge", () => {
    expect(verifyPkce(RFC_VERIFIER, "")).toBe(false)
  })
})
