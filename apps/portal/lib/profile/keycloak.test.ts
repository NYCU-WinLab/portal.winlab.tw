import { describe, expect, test } from "bun:test"

import {
  applyProfileToRepresentation,
  isRejectedByKeycloak,
  KeycloakAdminError,
  keycloakSubFromIdentities,
  profileFromRepresentation,
  type KeycloakUserRepresentation,
} from "@/lib/profile/keycloak"

function baseRep(): KeycloakUserRepresentation {
  return {
    id: "5f4c2a1e-0000-4000-8000-123456789abc",
    username: "tim",
    email: "tim@winlab.tw",
    emailVerified: true,
    firstName: "Tim",
    lastName: "Chen",
    attributes: {
      chinese_name: ["陳小明"],
      phone: ["0912 345 678"],
      locale: ["en"],
    },
  }
}

describe("profileFromRepresentation", () => {
  test("extracts top-level firstName and lastName", () => {
    const profile = profileFromRepresentation(baseRep())
    expect(profile.firstName).toBe("Tim")
    expect(profile.lastName).toBe("Chen")
  })

  test("extracts attribute-backed fields from the first array element", () => {
    const profile = profileFromRepresentation(baseRep())
    expect(profile.chinese_name).toBe("陳小明")
    expect(profile.phone).toBe("0912 345 678")
  })

  test("returns empty strings for absent fields", () => {
    const profile = profileFromRepresentation(baseRep())
    expect(profile.position).toBe("")
    expect(profile.gitlabUsername).toBe("")
    expect(profile.student_id).toBe("")
  })

  test("handles a representation with no attributes object", () => {
    const rep: KeycloakUserRepresentation = { username: "bare" }
    const profile = profileFromRepresentation(rep)
    expect(profile.firstName).toBe("")
    expect(profile.chinese_name).toBe("")
  })
})

describe("applyProfileToRepresentation", () => {
  test("sets firstName/lastName top-level, never as attributes", () => {
    const next = applyProfileToRepresentation(baseRep(), {
      firstName: "Timothy",
      lastName: "Chan",
    })
    expect(next.firstName).toBe("Timothy")
    expect(next.lastName).toBe("Chan")
    expect(next.attributes?.firstName).toBeUndefined()
    expect(next.attributes?.lastName).toBeUndefined()
  })

  test("sets attribute fields as single-element arrays", () => {
    const next = applyProfileToRepresentation(baseRep(), {
      student_id: "313552013",
      position: "碩士生",
    })
    expect(next.attributes?.student_id).toEqual(["313552013"])
    expect(next.attributes?.position).toEqual(["碩士生"])
  })

  test("preserves unrelated top-level fields and attributes", () => {
    const next = applyProfileToRepresentation(baseRep(), {
      chinese_name: "陳大明",
    })
    expect(next.id).toBe("5f4c2a1e-0000-4000-8000-123456789abc")
    expect(next.username).toBe("tim")
    expect(next.emailVerified).toBe(true)
    expect(next.attributes?.locale).toEqual(["en"])
    expect(next.attributes?.phone).toEqual(["0912 345 678"])
  })

  test("leaves fields absent from the update untouched", () => {
    const next = applyProfileToRepresentation(baseRep(), {
      phone: "02 1234 5678",
    })
    expect(next.firstName).toBe("Tim")
    expect(next.attributes?.chinese_name).toEqual(["陳小明"])
    expect(next.attributes?.phone).toEqual(["02 1234 5678"])
  })

  test("clears an attribute when the value is an empty string", () => {
    const next = applyProfileToRepresentation(baseRep(), { phone: "" })
    expect(next.attributes?.phone).toBeUndefined()
  })

  test("does not mutate the input representation", () => {
    const rep = baseRep()
    applyProfileToRepresentation(rep, { phone: "", chinese_name: "改了" })
    expect(rep.attributes?.phone).toEqual(["0912 345 678"])
    expect(rep.attributes?.chinese_name).toEqual(["陳小明"])
  })
})

describe("keycloakSubFromIdentities", () => {
  const KC_SUB = "9a1b2c3d-0000-4000-8000-abcdefabcdef"

  test("returns the sub from the keycloak identity's identity_data", () => {
    const identities = [
      { provider: "email", id: "ignore-me", identity_data: {} },
      { provider: "keycloak", id: KC_SUB, identity_data: { sub: KC_SUB } },
    ]
    expect(keycloakSubFromIdentities(identities)).toBe(KC_SUB)
  })

  test("falls back to the identity id when identity_data has no sub", () => {
    const identities = [{ provider: "keycloak", id: KC_SUB }]
    expect(keycloakSubFromIdentities(identities)).toBe(KC_SUB)
  })

  test("returns null when there is no keycloak identity", () => {
    expect(keycloakSubFromIdentities([{ provider: "github", id: "x" }])).toBe(
      null
    )
    expect(keycloakSubFromIdentities([])).toBe(null)
    expect(keycloakSubFromIdentities(undefined)).toBe(null)
  })
})

describe("isRejectedByKeycloak", () => {
  test("a 4xx on the write is a permanent rejection", () => {
    expect(isRejectedByKeycloak(new KeycloakAdminError("put", 400))).toBe(true)
    expect(isRejectedByKeycloak(new KeycloakAdminError("put", 409))).toBe(true)
  })

  test("a 5xx on the write is retryable, not a rejection", () => {
    expect(isRejectedByKeycloak(new KeycloakAdminError("put", 502))).toBe(false)
  })

  // A 401 from the token endpoint is a misconfigured service account, not bad
  // user input — telling the member to fix their field formats would misdirect.
  test("token and read failures are never data rejections", () => {
    expect(isRejectedByKeycloak(new KeycloakAdminError("token", 401))).toBe(
      false
    )
    expect(isRejectedByKeycloak(new KeycloakAdminError("get", 404))).toBe(false)
  })

  test("unrelated errors are not rejections", () => {
    expect(isRejectedByKeycloak(new Error("boom"))).toBe(false)
    expect(isRejectedByKeycloak(undefined)).toBe(false)
  })

  test("carries the detail into the message for server-side logs", () => {
    const err = new KeycloakAdminError("put", 400, "attribute not declared")
    expect(err.message).toContain("400")
    expect(err.message).toContain("attribute not declared")
  })
})
