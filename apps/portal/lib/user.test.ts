import { describe, expect, test } from "bun:test"

import {
  displayNameFromMetadata,
  normalizeClaims,
  normalizeUser,
} from "@/lib/user"

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

describe("normalizeClaims — Keycloak chinese_name", () => {
  test("custom_claims.chinese_name wins over every other name field", () => {
    const result = normalizeClaims(
      claims({
        user_metadata: {
          custom_claims: { chinese_name: "詹詠翔", preferred_username: "yx" },
          full_name: "詠翔 詹",
          name: "詠翔 詹",
        },
      })
    )
    expect(result.name).toBe("詹詠翔")
  })

  test("chinese_name is trimmed", () => {
    const result = normalizeClaims(
      claims({
        user_metadata: { custom_claims: { chinese_name: "  何承運 " } },
      })
    )
    expect(result.name).toBe("何承運")
  })

  test("blank chinese_name falls back to the OIDC name", () => {
    const result = normalizeClaims(
      claims({
        user_metadata: {
          custom_claims: { chinese_name: "   " },
          name: "Chen Yun",
        },
      })
    )
    expect(result.name).toBe("Chen Yun")
  })

  test("null, array and non-string chinese_name are ignored", () => {
    for (const custom_claims of [
      null,
      ["詹詠翔"],
      { chinese_name: 42 },
      { chinese_name: null },
    ]) {
      const result = normalizeClaims(
        claims({ user_metadata: { custom_claims, name: "Name" } })
      )
      expect(result.name).toBe("Name")
    }
  })

  test("chinese_name wins even when full_name is blank", () => {
    const result = normalizeClaims(
      claims({
        user_metadata: {
          custom_claims: { chinese_name: "何承運" },
          full_name: "",
        },
      })
    )
    expect(result.name).toBe("何承運")
  })

  test("non-object custom_claims is ignored", () => {
    const result = normalizeClaims(
      claims({ user_metadata: { custom_claims: "x", name: "Name" } })
    )
    expect(result.name).toBe("Name")
  })
})

describe("normalizeClaims — Han name without chinese_name", () => {
  test("puts the family name first, like member_display_name()", () => {
    const result = normalizeClaims(
      claims({ user_metadata: { full_name: "詠翔 詹", name: "詠翔 詹" } })
    )
    expect(result.name).toBe("詹詠翔")
  })

  test("reorders whichever field the chain lands on", () => {
    const result = normalizeClaims(
      claims({ user_metadata: { name: "承運 何" } })
    )
    expect(result.name).toBe("何承運")
  })

  test("leaves non-Han and mixed names alone", () => {
    for (const name of ["Chen Yun", "詠翔 Chan", "a 詹", "詠翔  詹 x"]) {
      expect(normalizeClaims(claims({ user_metadata: { name } })).name).toBe(
        name
      )
    }
  })
})

describe("normalizeUser", () => {
  test("uses the same chain as normalizeClaims", () => {
    const user = {
      id: "u-1",
      email: "u1@x.com",
      user_metadata: {
        custom_claims: { chinese_name: "詹詠翔" },
        full_name: "詠翔 詹",
        avatar_url: "a.png",
      },
    } as unknown as Parameters<typeof normalizeUser>[0]
    expect(normalizeUser(user)).toEqual({
      id: "u-1",
      email: "u1@x.com",
      name: "詹詠翔",
      avatarUrl: "a.png",
    })
  })

  test("falls back to email, then Unknown", () => {
    const base = { id: "u-2", user_metadata: { full_name: "" } }
    const asUser = (u: object) => u as Parameters<typeof normalizeUser>[0]
    expect(normalizeUser(asUser({ ...base, email: "e@x.com" })).name).toBe(
      "e@x.com"
    )
    expect(normalizeUser(asUser(base)).name).toBe("Unknown")
  })
})

describe("displayNameFromMetadata", () => {
  test("is the chain normalizeClaims uses, minus the email fallback", () => {
    expect(
      displayNameFromMetadata({
        custom_claims: { chinese_name: "詹詠翔" },
        name: "詠翔 詹",
      })
    ).toBe("詹詠翔")
    expect(displayNameFromMetadata({ preferred_username: "pref" })).toBe("pref")
    expect(displayNameFromMetadata({})).toBeUndefined()
    expect(displayNameFromMetadata(undefined)).toBeUndefined()
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

  test("blank full_name is skipped, chain continues to name", () => {
    const result = normalizeClaims(
      claims({
        email: "e@x.com",
        user_metadata: { full_name: "  ", name: "RealName" },
      })
    )
    expect(result.name).toBe("RealName")
  })

  test("every name field blank falls through to email", () => {
    const result = normalizeClaims(
      claims({
        email: "e@x.com",
        user_metadata: { full_name: "", name: " ", preferred_username: "" },
      })
    )
    expect(result.name).toBe("e@x.com")
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
