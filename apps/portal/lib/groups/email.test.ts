import { describe, expect, test } from "bun:test"

import {
  MAX_EMAIL_LENGTH,
  normalizeEmail,
  parseEmailList,
  sameMailbox,
} from "@/lib/groups/email"

describe("normalizeEmail", () => {
  test("trims and lower-cases", () => {
    expect(normalizeEmail("  Foo.Bar@Gmail.COM ")).toBe("foo.bar@gmail.com")
  })

  test("rejects anything that is not one plain address", () => {
    for (const bad of [
      "",
      "foo",
      "foo@",
      "@gmail.com",
      "a b@gmail.com",
      "a@b",
      "a@@b.com",
      "Foo <foo@gmail.com>",
    ]) {
      expect(normalizeEmail(bad)).toBeNull()
    }
  })

  test("rejects what Postgres can't store: control characters, lone surrogates", () => {
    for (const bad of [
      "a\u0000b@x.com",
      "a@x\u0000.com",
      "a\u007fb@x.com",
      "a\uD800b@gmail.com",
    ])
      expect(normalizeEmail(bad)).toBeNull()
  })

  test("rejects anything longer than MAX_EMAIL_LENGTH", () => {
    const local = "a".repeat(MAX_EMAIL_LENGTH)
    expect(normalizeEmail(`${local}@x.com`)).toBeNull()
    expect(normalizeEmail(`${"a".repeat(MAX_EMAIL_LENGTH - 6)}@x.com`)).toBe(
      `${"a".repeat(MAX_EMAIL_LENGTH - 6)}@x.com`
    )
  })
})

describe("parseEmailList", () => {
  test("splits on newlines, commas, semicolons and spaces, dedupes", () => {
    expect(
      parseEmailList("a@x.com, B@x.com\nb@x.com;c@x.com  not-an-email")
    ).toEqual({
      valid: ["a@x.com", "b@x.com", "c@x.com"],
      invalid: ["not-an-email"],
    })
  })

  test("empty input gives empty lists", () => {
    expect(parseEmailList(" \n ")).toEqual({ valid: [], invalid: [] })
  })
})

describe("sameMailbox", () => {
  test("Gmail ignores dots, and only Gmail", () => {
    expect(sameMailbox("a.b@gmail.com", "ab@gmail.com")).toBe(true)
    expect(sameMailbox("a.b@gmail.com", "ab@googlemail.com")).toBe(true)
    expect(sameMailbox("a.b@winlab.tw", "ab@winlab.tw")).toBe(false)
    expect(sameMailbox("a@gmail.com", "b@gmail.com")).toBe(false)
    expect(sameMailbox("x@winlab.tw", "x@winlab.tw")).toBe(true)
  })
})
