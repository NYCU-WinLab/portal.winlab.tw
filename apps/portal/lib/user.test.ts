import { describe, expect, test } from "bun:test"

import { normalizeClaims } from "@/lib/user"

type Claims = Parameters<typeof normalizeClaims>[0]

function claims(overrides: Partial<Claims> = {}): Claims {
  return {
    sub: "user-123",
    ...overrides,
  }
}

describe("normalizeClaims — id / email", () => {
  test("maps sub to id", () => {
    expect(normalizeClaims(claims({ sub: "abc" })).id).toBe("abc")
  })

  test("passes email through", () => {
    expect(normalizeClaims(claims({ email: "a@b.com" })).email).toBe("a@b.com")
  })

  test("missing email normalizes to null", () => {
    expect(normalizeClaims(claims()).email).toBeNull()
  })
})

describe("normalizeClaims — name fallback chain", () => {
  test("full_name wins when present", () => {
    const result = normalizeClaims(
      claims({
        email: "e@x.com",
        user_metadata: {
          full_name: "Full Name",
          name: "Name",
          preferred_username: "pref",
        },
      })
    )
    expect(result.name).toBe("Full Name")
  })

  test("falls back to name when full_name absent", () => {
    const result = normalizeClaims(
      claims({
        user_metadata: { name: "Name", preferred_username: "pref" },
      })
    )
    expect(result.name).toBe("Name")
  })

  test("falls back to preferred_username when full_name + name absent", () => {
    const result = normalizeClaims(
      claims({ user_metadata: { preferred_username: "pref" } })
    )
    expect(result.name).toBe("pref")
  })

  test("falls back to email when no metadata name fields", () => {
    const result = normalizeClaims(
      claims({ email: "fallback@x.com", user_metadata: {} })
    )
    expect(result.name).toBe("fallback@x.com")
  })

  test("falls back to 'Unknown' when nothing is available", () => {
    expect(normalizeClaims(claims()).name).toBe("Unknown")
  })

  test("missing user_metadata is treated as empty, name falls to email", () => {
    const result = normalizeClaims(claims({ email: "only@x.com" }))
    expect(result.name).toBe("only@x.com")
  })
})

describe("normalizeClaims — non-string metadata is dropped", () => {
  test("non-string full_name is skipped, chain continues to name", () => {
    const result = normalizeClaims(
      claims({
        user_metadata: { full_name: 42, name: "RealName" },
      })
    )
    expect(result.name).toBe("RealName")
  })

  test("null full_name is skipped (typeof null !== string)", () => {
    const result = normalizeClaims(
      claims({
        user_metadata: { full_name: null, name: "RealName" },
      })
    )
    expect(result.name).toBe("RealName")
  })

  test("all metadata non-string falls through to email", () => {
    const result = normalizeClaims(
      claims({
        email: "e@x.com",
        user_metadata: { full_name: 1, name: {}, preferred_username: [] },
      })
    )
    expect(result.name).toBe("e@x.com")
  })

  test("empty string full_name is a string, so it short-circuits the chain", () => {
    const result = normalizeClaims(
      claims({
        email: "e@x.com",
        user_metadata: { full_name: "", name: "RealName" },
      })
    )
    expect(result.name).toBe("")
  })
})

describe("normalizeClaims — avatar fallback", () => {
  test("avatar_url wins when present", () => {
    const result = normalizeClaims(
      claims({
        user_metadata: { avatar_url: "a.png", picture: "p.png" },
      })
    )
    expect(result.avatarUrl).toBe("a.png")
  })

  test("falls back to picture when avatar_url absent", () => {
    const result = normalizeClaims(
      claims({ user_metadata: { picture: "p.png" } })
    )
    expect(result.avatarUrl).toBe("p.png")
  })

  test("no avatar fields normalizes to null", () => {
    expect(normalizeClaims(claims({ user_metadata: {} })).avatarUrl).toBeNull()
  })

  test("non-string avatar_url is dropped, falls back to picture", () => {
    const result = normalizeClaims(
      claims({
        user_metadata: { avatar_url: 123, picture: "p.png" },
      })
    )
    expect(result.avatarUrl).toBe("p.png")
  })

  test("missing user_metadata yields null avatar", () => {
    expect(normalizeClaims(claims()).avatarUrl).toBeNull()
  })
})

describe("normalizeClaims — full shape", () => {
  test("assembles the complete NormalizedUser", () => {
    expect(
      normalizeClaims(
        claims({
          sub: "u-9",
          email: "u9@x.com",
          user_metadata: { full_name: "Nine", avatar_url: "nine.png" },
        })
      )
    ).toEqual({
      id: "u-9",
      email: "u9@x.com",
      name: "Nine",
      avatarUrl: "nine.png",
    })
  })
})
