import { describe, expect, test } from "bun:test"

import {
  hasDisallowedCharacter,
  parseDoorGreetingSuffix,
  SUFFIX_INVALID_CHARACTER,
  SUFFIX_INVALID_INPUT,
  SUFFIX_TOO_WIDE,
  suffixWidth,
} from "@/lib/door/greeting-suffix"

describe("suffixWidth", () => {
  test("Han counts 10 px each", () => {
    expect(suffixWidth("好帥")).toBe(20)
    expect(suffixWidth("好帥喔")).toBe(30)
  })

  test("printable ASCII counts 5 px each, space included", () => {
    expect(suffixWidth("hello!")).toBe(30)
    expect(suffixWidth("a b")).toBe(15)
    expect(suffixWidth("~")).toBe(5)
  })

  test("mixed Han and ASCII add up", () => {
    expect(suffixWidth("讚ab")).toBe(20)
    expect(suffixWidth("一二三a")).toBe(35)
  })

  test("full-width punctuation and symbols count as wide", () => {
    expect(suffixWidth("！！")).toBe(20)
    expect(suffixWidth("Ａ")).toBe(10)
    expect(suffixWidth("　")).toBe(10)
  })

  test("counts code points, not UTF-16 units", () => {
    expect(suffixWidth("𠮷")).toBe(10)
  })

  test("empty is zero", () => {
    expect(suffixWidth("")).toBe(0)
  })
})

describe("hasDisallowedCharacter", () => {
  test("rejects C0, DEL and C1 control characters", () => {
    expect(hasDisallowedCharacter("a\nb")).toBe(true)
    expect(hasDisallowedCharacter("a\tb")).toBe(true)
    expect(hasDisallowedCharacter("a\u007fb")).toBe(true)
    expect(hasDisallowedCharacter("a\u0085b")).toBe(true)
  })

  test("rejects zero-width, bidi and private-use characters", () => {
    expect(hasDisallowedCharacter("a​b")).toBe(true)
    expect(hasDisallowedCharacter("a‮b")).toBe(true)
    expect(hasDisallowedCharacter("ab")).toBe(true)
    expect(hasDisallowedCharacter("a b")).toBe(true)
  })

  test("accepts Han, ASCII and full-width punctuation", () => {
    expect(hasDisallowedCharacter("好 a！")).toBe(false)
  })
})

describe("parseDoorGreetingSuffix", () => {
  test("accepts up to 3 Han, 6 ASCII or a mix within 32 px", () => {
    expect(parseDoorGreetingSuffix("好帥喔")).toEqual({
      ok: true,
      value: "好帥喔",
    })
    expect(parseDoorGreetingSuffix("hello!")).toEqual({
      ok: true,
      value: "hello!",
    })
    expect(parseDoorGreetingSuffix("讚ab c")).toEqual({
      ok: true,
      value: "讚ab c",
    })
  })

  test("trims and stores empty as null", () => {
    expect(parseDoorGreetingSuffix("  好  ")).toEqual({ ok: true, value: "好" })
    expect(parseDoorGreetingSuffix("　好　")).toEqual({
      ok: true,
      value: "好",
    })
    expect(parseDoorGreetingSuffix("")).toEqual({ ok: true, value: null })
    expect(parseDoorGreetingSuffix("   ")).toEqual({ ok: true, value: null })
    expect(parseDoorGreetingSuffix(null)).toEqual({ ok: true, value: null })
  })

  test("normalises to NFC before measuring", () => {
    // "e" + combining acute is two code points, NFC makes it one.
    const result = parseDoorGreetingSuffix("café")
    expect(result).toEqual({ ok: true, value: "café" })
  })

  test("rejects anything wider than 32 px", () => {
    expect(parseDoorGreetingSuffix("一二三四")).toEqual({
      ok: false,
      error: SUFFIX_TOO_WIDE,
    })
    expect(parseDoorGreetingSuffix("abcdefg")).toEqual({
      ok: false,
      error: SUFFIX_TOO_WIDE,
    })
    expect(parseDoorGreetingSuffix("！！！！")).toEqual({
      ok: false,
      error: SUFFIX_TOO_WIDE,
    })
    expect(parseDoorGreetingSuffix("x".repeat(500))).toEqual({
      ok: false,
      error: SUFFIX_TOO_WIDE,
    })
  })

  test("rejects control characters inside the value", () => {
    expect(parseDoorGreetingSuffix("a\nb")).toEqual({
      ok: false,
      error: SUFFIX_INVALID_CHARACTER,
    })
    expect(parseDoorGreetingSuffix("a​b")).toEqual({
      ok: false,
      error: SUFFIX_INVALID_CHARACTER,
    })
  })

  test("rejects non-string input", () => {
    expect(parseDoorGreetingSuffix(42)).toEqual({
      ok: false,
      error: SUFFIX_INVALID_INPUT,
    })
    expect(parseDoorGreetingSuffix(undefined)).toEqual({
      ok: false,
      error: SUFFIX_INVALID_INPUT,
    })
    expect(parseDoorGreetingSuffix({ suffix: "好" })).toEqual({
      ok: false,
      error: SUFFIX_INVALID_INPUT,
    })
  })
})
