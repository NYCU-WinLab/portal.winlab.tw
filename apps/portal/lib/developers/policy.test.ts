import { describe, expect, test } from "bun:test"
import {
  applicationInput,
  authorizeInput,
  approvedScopes,
  memberGroups,
  profileResponse,
} from "./policy"

describe("developer identity boundary", () => {
  test("basic profile never includes name, groups, roles or upstream metadata", () => {
    expect(
      profileResponse({
        username: "member",
        email: "member@example.org",
        firstName: "Private",
        groups: ["master"],
        roles: ["admin"],
      })
    ).toEqual({ username: "member", email: "member@example.org" })
  })
  test("only the documented lab group namespaces are disclosed", () => {
    expect(
      memberGroups([
        { name: "114", path: "/lab-member/114" },
        { name: "master", path: "/lab-member/master" },
        { name: "cairn", path: "/winlab-projects/cairn" },
        { name: "wnc-easymesh", path: "/winlab-projects/wnc-easymesh" },
        { name: "admin", path: "/system/admin" },
        { name: "fake", path: "/lab-member-evil/fake" },
      ])
    ).toEqual(["114", "master", "cairn", "wnc-easymesh"])
  })
  test("unapproved, unknown and undefined status scopes fail closed", () => {
    expect(approvedScopes(["profile", "groups"], ["profile"])).toBe(false)
    expect(approvedScopes(["status"], ["profile", "status"])).toBe(false)
    expect(approvedScopes([], ["profile"])).toBe(false)
    expect(
      approvedScopes(["profile", "groups"], ["profile", "groups"])
    ).toEqual(["profile", "groups"])
  })
  const app = {
    name: "Test",
    description: "Member application",
    contact_email: "owner@example.org",
    client_type: "public",
    redirect_uris: ["https://example.org/callback"],
    privacy_url: "https://example.org/privacy",
  }
  test("redirect registration forbids wildcard, fragment, credentials and insecure remote URLs", () => {
    for (const uri of [
      "https://*.example.org/cb",
      "https://example.org/cb#x",
      "https://user:pass@example.org/cb",
      "http://example.org/cb",
      "javascript:alert(1)",
    ]) {
      expect(
        applicationInput.safeParse({ ...app, redirect_uris: [uri] }).success
      ).toBe(false)
    }
    expect(
      applicationInput.safeParse({
        ...app,
        redirect_uris: ["http://localhost:3000/callback"],
      }).success
    ).toBe(true)
  })
  test("authorization requires state, code flow and S256 PKCE", () => {
    const input = {
      client_id: "abc",
      redirect_uri: app.redirect_uris[0],
      response_type: "code",
      scope: "profile",
      state: "random-state",
      code_challenge: "a".repeat(43),
      code_challenge_method: "S256",
    }
    expect(authorizeInput.safeParse(input).success).toBe(true)
    for (const change of [
      { state: "" },
      { response_type: "token" },
      { code_challenge_method: "plain" },
      { code_challenge: "" },
    ]) {
      expect(authorizeInput.safeParse({ ...input, ...change }).success).toBe(
        false
      )
    }
  })
})
