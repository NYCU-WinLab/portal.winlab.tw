import { describe, expect, test } from "bun:test"

import { parseMentions } from "@/lib/bulletin/types"

describe("parseMentions", () => {
  test("extracts the names from a simple two-mention message", () => {
    expect(parseMentions("hi @alice and @bob")).toEqual(["alice", "bob"])
  })

  test("dedups repeated mentions, keeping first-seen order", () => {
    expect(parseMentions("@alice @bob @alice again @bob")).toEqual([
      "alice",
      "bob",
    ])
  })

  test("matches CJK names via \\p{L}", () => {
    expect(parseMentions("@小明 says hi")).toEqual(["小明"])
    expect(parseMentions("hi @小明 and @大華")).toEqual(["小明", "大華"])
  })

  test("accepts letters, digits, dots, hyphens, and underscores in a name", () => {
    expect(parseMentions("@bob-smith.jr_2")).toEqual(["bob-smith.jr_2"])
  })

  test("stops the name at the first disallowed character", () => {
    expect(parseMentions("@alice!")).toEqual(["alice"])
    expect(parseMentions("(@bob)")).toEqual(["bob"])
    expect(parseMentions("@alice, @bob; @carol")).toEqual([
      "alice",
      "bob",
      "carol",
    ])
  })

  test("ignores a bare '@' with nothing matchable after it", () => {
    expect(parseMentions("@ alone")).toEqual([])
    expect(parseMentions("just an @ here")).toEqual([])
    expect(parseMentions("")).toEqual([])
  })

  test("still captures the first real mention after a bare '@'", () => {
    expect(parseMentions("hi @ @alice")).toEqual(["alice"])
  })

  test("caps the captured name at 40 characters", () => {
    const name = "a".repeat(45)
    const result = parseMentions(`@${name}`)
    expect(result).toEqual(["a".repeat(40)])
    expect(result[0]).toHaveLength(40)
  })

  test("has no leading word boundary, so it matches email-like text", () => {
    // `.` is in the character class, so the name runs through `alice.com`.
    expect(parseMentions("mail foo@alice.com")).toEqual(["alice.com"])
  })
})
