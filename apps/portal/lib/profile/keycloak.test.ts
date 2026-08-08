import { describe, expect, test } from "bun:test"

import {
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
