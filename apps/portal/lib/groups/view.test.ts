import { describe, expect, test } from "bun:test"

import { readFailureNotice, retainLastGood } from "./view"

describe("retainLastGood", () => {
  test("takes a fresh value", () => {
    expect(retainLastGood("old", "new")).toBe("new")
  })
  test("keeps the previous one when the read failed", () => {
    expect(retainLastGood("old", null)).toBe("old")
  })
  test("is null when there never was a good read", () => {
    expect(retainLastGood(null, null)).toBeNull()
  })
})

describe("readFailureNotice", () => {
  test("nothing to say without an error", () => {
    expect(readFailureNotice(null, true).kind).toBe("none")
  })
  test("a failure over a kept list is an inline note", () => {
    const n = readFailureNotice("boom", true)
    expect(n.kind).toBe("stale")
    expect("text" in n && n.text).toContain("上次的清單")
  })
  test("a failure with nothing kept carries the reason", () => {
    const n = readFailureNotice("boom", false)
    expect(n.kind).toBe("empty")
    expect("text" in n && n.text).toContain("boom")
  })
})
