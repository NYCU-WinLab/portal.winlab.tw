import { describe, expect, test } from "bun:test"

import {
  applyMentionAtCursor,
  insertMentionTriggerAtCursor,
  mentionQueryAtCursor,
} from "@/lib/gallery/mention-cursor"

describe("mentionQueryAtCursor", () => {
  test("returns null when not in a mention", () => {
    expect(mentionQueryAtCursor("hello world", 5)).toBeNull()
    expect(mentionQueryAtCursor("email@x.com ", 12)).toBeNull()
  })

  test("returns the partial query after @", () => {
    expect(mentionQueryAtCursor("hi @Ad", 6)).toBe("Ad")
    expect(mentionQueryAtCursor("@", 1)).toBe("")
    expect(mentionQueryAtCursor("ping @bob_1", 11)).toBe("bob_1")
  })
})

describe("applyMentionAtCursor", () => {
  test("replaces the partial mention and places the cursor after", () => {
    const result = applyMentionAtCursor("hi @Ad", 6, "Ada")
    expect(result.next).toBe("hi @Ada ")
    expect(result.selection).toBe("hi @Ada ".length)
  })

  test("keeps trailing text after the cursor", () => {
    const result = applyMentionAtCursor("hi @Ad thanks", 6, "Ada")
    expect(result.next).toBe("hi @Ada  thanks")
    expect(result.selection).toBe("hi @Ada ".length)
  })
})

describe("insertMentionTriggerAtCursor", () => {
  test("inserts @ at the start without a leading space", () => {
    expect(insertMentionTriggerAtCursor("hello", 0)).toEqual({
      next: "@hello",
      selection: 1,
    })
  })

  test("adds a space before @ when the cursor follows a word", () => {
    expect(insertMentionTriggerAtCursor("hi", 2)).toEqual({
      next: "hi @",
      selection: 4,
    })
  })

  test("does not double-space after existing whitespace", () => {
    expect(insertMentionTriggerAtCursor("hi ", 3)).toEqual({
      next: "hi @",
      selection: 4,
    })
  })
})
