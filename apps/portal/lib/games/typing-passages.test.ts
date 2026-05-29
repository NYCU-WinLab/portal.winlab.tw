import { describe, expect, test } from "bun:test"

import {
  countUnits,
  getTypingLanguage,
  TYPING_LANGUAGES,
} from "@/lib/games/typing-passages"

describe("getTypingLanguage", () => {
  test("returns the language at the given id", () => {
    expect(getTypingLanguage(0).code).toBe("en")
    expect(getTypingLanguage(1).code).toBe("zh-Hant")
    expect(getTypingLanguage(5).code).toBe("es")
  })

  test("id matches the entry's own id field", () => {
    for (const lang of TYPING_LANGUAGES) {
      expect(getTypingLanguage(lang.id)).toBe(lang)
    }
  })

  test("falls back to English (index 0) for an out-of-range id", () => {
    expect(getTypingLanguage(99)).toBe(TYPING_LANGUAGES[0]!)
    expect(getTypingLanguage(99).code).toBe("en")
  })

  test("falls back to English for a negative id", () => {
    expect(getTypingLanguage(-1)).toBe(TYPING_LANGUAGES[0]!)
  })
})

describe("countUnits — latin (whitespace-separated words)", () => {
  test("counts space-separated words", () => {
    expect(countUnits("the quick brown fox", "en")).toBe(4)
  })

  test("collapses runs of whitespace into a single separator", () => {
    expect(countUnits("the   quick\tbrown\nfox", "en")).toBe(4)
  })

  test("trims leading and trailing whitespace before splitting", () => {
    expect(countUnits("   hello world   ", "en")).toBe(2)
  })

  test("a single word counts as one", () => {
    expect(countUnits("hello", "en")).toBe(1)
  })

  test("punctuation does not split words (counts tokens, not words)", () => {
    expect(countUnits("e tu, Brute?", "en")).toBe(3)
  })

  test("empty and whitespace-only strings count as 1 (split returns one empty token)", () => {
    expect(countUnits("", "en")).toBe(1)
    expect(countUnits("   ", "en")).toBe(1)
  })

  test("non-zh-Hant codes all take the word-count branch", () => {
    for (const code of ["de", "fr", "it", "es"] as const) {
      expect(countUnits("uno due tre", code)).toBe(3)
    }
  })
})

describe("countUnits — zh-Hant (CJK character count)", () => {
  test("counts CJK ideographs", () => {
    expect(countUnits("山不在高", "zh-Hant")).toBe(4)
  })

  test("ignores fullwidth punctuation, only counting ideographs", () => {
    expect(countUnits("千里之行，始於足下。", "zh-Hant")).toBe(8)
  })

  test("ignores ASCII and whitespace mixed into CJK text", () => {
    expect(countUnits("山 high 水 deep", "zh-Hant")).toBe(2)
  })

  test("empty string counts as 0 in the CJK branch", () => {
    expect(countUnits("", "zh-Hant")).toBe(0)
  })

  test("CJK Unified Ideographs block boundaries U+4E00 and U+9FFF are counted", () => {
    expect(countUnits("一鿿", "zh-Hant")).toBe(2)
  })

  test("characters just outside the block are not counted", () => {
    // U+3007 (〇) below the block, U+A000 just above it
    expect(countUnits("〇ꀀ", "zh-Hant")).toBe(0)
  })
})
