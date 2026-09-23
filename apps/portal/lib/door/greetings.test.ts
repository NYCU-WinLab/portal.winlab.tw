import { describe, expect, test } from "bun:test"

import {
  buildGreetingSuffixMap,
  greetingsAuthorized,
  normalizeGreetingName,
} from "@/lib/door/greetings"

const SECRET = "display-secret-at-least-32-characters"

describe("normalizeGreetingName", () => {
  test("puts a given-first Han name family first", () => {
    expect(normalizeGreetingName("詠翔 詹")).toBe("詹詠翔")
    expect(normalizeGreetingName("  詠翔   詹 ")).toBe("詹詠翔")
  })

  test("trims and collapses whitespace in any other name", () => {
    expect(normalizeGreetingName("  Simon   Chen ")).toBe("Simon Chen")
    expect(normalizeGreetingName("詹詠翔")).toBe("詹詠翔")
  })

  test("leaves Han names that are not exactly two runs alone", () => {
    expect(normalizeGreetingName("歐陽 詠 翔")).toBe("歐陽 詠 翔")
    expect(normalizeGreetingName("詠翔 Zhan")).toBe("詠翔 Zhan")
  })
})

describe("buildGreetingSuffixMap", () => {
  test("keys each member by profile name and every linked card holder name", () => {
    const map = buildGreetingSuffixMap(
      [
        { id: "a", name: "詠翔 詹", door_greeting_suffix: "好帥" },
        { id: "b", name: "Simon", door_greeting_suffix: "hi!" },
      ],
      [
        { holder_name: "詹詠翔", holder_user_id: "a" },
        { holder_name: "Loki  Zhan", holder_user_id: "a" },
        { holder_name: "Guest", holder_user_id: null },
        { holder_name: "Other", holder_user_id: "c" },
      ]
    )
    expect(map).toEqual({
      詹詠翔: "好帥",
      "Loki Zhan": "好帥",
      Simon: "hi!",
    })
  })

  test("skips members without a suffix and blank names", () => {
    const map = buildGreetingSuffixMap(
      [
        { id: "a", name: "Alice", door_greeting_suffix: null },
        { id: "b", name: "   ", door_greeting_suffix: "好" },
        { id: "c", name: null, door_greeting_suffix: "讚" },
      ],
      [
        { holder_name: "Alice", holder_user_id: "a" },
        { holder_name: "Carol", holder_user_id: "c" },
        { holder_name: null, holder_user_id: "c" },
      ]
    )
    expect(map).toEqual({ Carol: "讚" })
  })

  test("a collision resolves the same way regardless of row order", () => {
    const profiles = [
      { id: "b", name: "Sam", door_greeting_suffix: "B" },
      { id: "a", name: "Sam", door_greeting_suffix: "A" },
    ]
    const cards = [{ holder_name: "Sam", holder_user_id: "b" }]
    expect(buildGreetingSuffixMap(profiles, cards)).toEqual({ Sam: "A" })
    expect(buildGreetingSuffixMap([...profiles].reverse(), cards)).toEqual({
      Sam: "A",
    })
  })
})

describe("greetingsAuthorized", () => {
  test("accepts the exact bearer secret", () => {
    expect(greetingsAuthorized(`Bearer ${SECRET}`, SECRET)).toBe(true)
    expect(greetingsAuthorized(`bearer ${SECRET}`, SECRET)).toBe(true)
  })

  test("rejects a wrong, missing or malformed header", () => {
    expect(greetingsAuthorized(`Bearer ${SECRET}x`, SECRET)).toBe(false)
    expect(greetingsAuthorized(null, SECRET)).toBe(false)
    expect(greetingsAuthorized(SECRET, SECRET)).toBe(false)
    expect(greetingsAuthorized(`Bearer  ${SECRET}`, SECRET)).toBe(false)
    expect(greetingsAuthorized(`Bearer ${"x".repeat(2000)}`, SECRET)).toBe(
      false
    )
  })

  test("never accepts when the secret is too short", () => {
    expect(greetingsAuthorized("Bearer short", "short")).toBe(false)
  })
})
