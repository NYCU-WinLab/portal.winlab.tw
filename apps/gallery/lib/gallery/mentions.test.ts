import { describe, expect, test } from "bun:test"

import { parseMentions } from "@/lib/gallery/mentions"

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
