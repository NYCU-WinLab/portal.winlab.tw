import { describe, expect, test } from "bun:test"

import { parseMentions, resolveMentionedProfiles } from "@/lib/gallery/mentions"

describe("parseMentions", () => {
  test("extracts names from a simple two-mention comment", () => {
    expect(parseMentions("hi @alice and @bob")).toEqual(["alice", "bob"])
  })

  test("dedups repeated mentions", () => {
    expect(parseMentions("@alice @bob @alice")).toEqual(["alice", "bob"])
  })

  test("matches CJK names", () => {
    expect(parseMentions("@Mike 不揪")).toEqual(["Mike"])
    expect(parseMentions("hi @小明 and @大華")).toEqual(["小明", "大華"])
  })

  test("stops at punctuation", () => {
    expect(parseMentions("@alice!")).toEqual(["alice"])
    expect(parseMentions("@alice, @bob")).toEqual(["alice", "bob"])
  })
})

describe("resolveMentionedProfiles", () => {
  const profiles = [
    { id: "1", name: "Alice" },
    { id: "2", name: "Bob" },
    { id: "3", name: "mike" },
  ]

  test("matches names case-insensitively", () => {
    expect(resolveMentionedProfiles(["alice", "MIKE"], profiles)).toEqual([
      { id: "1", name: "Alice" },
      { id: "3", name: "mike" },
    ])
  })

  test("returns empty when nothing matches", () => {
    expect(resolveMentionedProfiles(["ghost"], profiles)).toEqual([])
  })

  test("dedups duplicate ids when the same user is mentioned twice", () => {
    expect(resolveMentionedProfiles(["Alice", "ALICE"], profiles)).toEqual([
      { id: "1", name: "Alice" },
    ])
  })

  test("mentions every profile that shares the same name", () => {
    const dupes = [
      { id: "a", name: "Sam" },
      { id: "b", name: "sam" },
    ]
    expect(resolveMentionedProfiles(["SAM"], dupes)).toEqual(dupes)
  })
})
